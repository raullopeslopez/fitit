package io.github.raullopeslopez.fitit.session;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.Manifest;
import android.app.Application;
import android.app.Notification;
import android.app.NotificationManager;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.os.Vibrator;
import android.view.View;
import android.widget.TextView;
import androidx.test.core.app.ApplicationProvider;
import androidx.work.testing.TestWorkerBuilder;
import androidx.work.testing.WorkManagerTestInitHelper;
import android.app.AlarmManager;
import android.widget.ProgressBar;
import io.github.raullopeslopez.fitit.R;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.json.JSONArray;
import java.util.concurrent.Executors;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAppWidgetManager;

// El widget 4×2, el que ajusta peso y reps. Spec: docs/widgets-entreno.md,
// «4×2, con ajuste» y fase 4; maqueta en la spec.
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class SessionWidget4x2Test {
    private Context context;
    private SessionStore store;
    private QueueDrainerTest.FakeHttp http;
    private ShadowAppWidgetManager widgets;
    private int large;
    private int small;

    @Before
    public void setUp() throws Exception {
        context = ApplicationProvider.getApplicationContext();
        shadowOf((Application) context).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        WorkManagerTestInitHelper.initializeTestWorkManager(context);
        store = new SessionStore(context, new SessionStoreTest.FakeCipher());
        store.setSession("jwt-abc", "https://fitit.example/api", "0.8.0");
        http = new QueueDrainerTest.FakeHttp();
        Session.useForTests(store, http);
        widgets = shadowOf(AppWidgetManager.getInstance(context));
        large = widgets.createWidget(SessionWidget4x2.class, R.layout.widget_session_4x2);
        small = widgets.createWidget(SessionWidget.class, R.layout.widget_session_4x1);
    }

    @After
    public void tearDown() {
        Session.useForTests(null, null);
    }

    private long now() {
        return System.currentTimeMillis();
    }

    private JSONObject bench(long restEndsAt) throws Exception {
        return new JSONObject()
                .put("workoutId", 7)
                .put("exercise", "Press banca")
                .put("group", "Pecho")
                .put("template", new JSONObject()
                        .put("exercise_name", "Press banca")
                        .put("reps", 12)
                        .put("weight", 32.5))
                .put("count", 4)
                .put("restSeconds", 90)
                .put("restEndsAt", restEndsAt)
                .put("lastSetAt", now());
    }

    private View view() {
        return widgets.getViewFor(large);
    }

    private String text(int id) {
        return ((TextView) view().findViewById(id)).getText().toString();
    }

    private boolean shown(int id) {
        View v = view().findViewById(id);
        return v != null && v.getVisibility() == View.VISIBLE;
    }

    // Toca un botón del widget y entrega lo que emitió, como haría Android.
    private void tap(int id, long at) {
        List<Intent> before = shadowOf((Application) context).getBroadcastIntents();
        int seen = before.size();
        view().findViewById(id).performClick();
        List<Intent> sent = shadowOf((Application) context).getBroadcastIntents();
        assertEquals("el botón emite una acción", seen + 1, sent.size());
        Intent intent = sent.get(sent.size() - 1);
        SessionController.handle(context, intent, at);
        // Los toques de estos tests van separados de segundos: el repintado
        // agrupado de un −/+ ya ha salido cuando llega el siguiente.
        if (List.of(SessionController.ACTION_WEIGHT_DOWN, SessionController.ACTION_WEIGHT_UP,
                SessionController.ACTION_REPS_DOWN, SessionController.ACTION_REPS_UP)
                .contains(intent.getAction())) {
            shadowOf(android.os.Looper.getMainLooper())
                    .idleFor(java.time.Duration.ofMillis(SessionController.ADJUST_SETTLE_MS));
        }
    }

    private Notification notification() {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        Notification[] active = shadowOf(manager).getAllNotifications().toArray(new Notification[0]);
        return active.length == 0 ? null : active[active.length - 1];
    }

    @Test
    public void withASessionItShowsTheMockup() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now + 83_000), now);

        assertTrue(shown(R.id.widget_session));
        assertFalse(shown(R.id.widget_idle));
        assertEquals("Press banca", text(R.id.widget_exercise));
        for (String shownText : SessionWidgetTest.texts(view())) {
            assertFalse(shownText, shownText.contains("Pecho"));
        }
        // Una línea: «Press banca · 4 series».
        assertEquals("4", text(R.id.widget_count_n));
        assertFalse(shown(R.id.widget_unsent));
        assertEquals("32,5", text(R.id.widget_weight));
        assertEquals("12", text(R.id.widget_reps));
        // El +1 no repite la serie: ya está escrita en los ajustes de al lado.
        assertEquals("+1", text(R.id.widget_log));
        // Terminar es un aro con ■: sin texto, con nombre para el lector de pantalla.
        assertTrue(shown(R.id.widget_end));
        assertEquals("Terminar entreno", view().findViewById(R.id.widget_end).getContentDescription());
        assertTrue(shown(R.id.widget_clock));
        // Ni saltar el descanso ni «Otro ejercicio»: añadir o cambiar de
        // ejercicio se hace dentro de la app (DESIGN.md, «Fuera de la app»).
        for (String shownText : SessionWidgetTest.texts(view())) {
            assertFalse(shownText, shownText.contains("Otro ejercicio"));
        }
        assertEquals(0, SessionWidgetTest.described(view(), "Saltar descanso"));
    }

    @Test
    public void raisingTheWeightTwiceAndLoggingLogsFiveKilosMore() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now - 1), now);

        tap(R.id.widget_weight_up, now + 1_000);
        tap(R.id.widget_weight_up, now + 2_000);

        // Ajustar no registra: sólo cambia la serie que está a la vista.
        assertTrue(store.queue().isEmpty());
        assertEquals("37,5", text(R.id.widget_weight));
        assertEquals("4", text(R.id.widget_count_n));

        tap(R.id.widget_log, now + 3_000);

        assertEquals(1, store.queue().size());
        assertEquals(37.5, store.queue().get(0).getJSONObject("payload").getDouble("weight"), 0);
        assertEquals("5", text(R.id.widget_count_n));
        // Y es lo que repite desde ahora la notificación, y el 4×1.
        assertEquals("37,5 kg × 12 · 5 series",
                notification().extras.getCharSequence(Notification.EXTRA_TEXT).toString());
        View smallView = widgets.getViewFor(small);
        assertEquals("37,5 kg × 12",
                ((TextView) smallView.findViewById(R.id.widget_set)).getText().toString());
        // «Registrar serie» vibra, como el +1 del 4×1.
        assertTrue(shadowOf(context.getSystemService(Vibrator.class)).isVibrating());
    }

    @Test
    public void adjustingDoesNotVibrate() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now - 1), now);

        tap(R.id.widget_reps_up, now + 1_000);

        assertEquals("13", text(R.id.widget_reps));
        assertFalse(shadowOf(context.getSystemService(Vibrator.class)).isVibrating());
    }

    @Test
    public void repsAndWeightGoDownToo() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now - 1), now);

        tap(R.id.widget_weight_down, now + 1_000);
        tap(R.id.widget_reps_down, now + 2_000);

        assertEquals("30", text(R.id.widget_weight));
        assertEquals("11", text(R.id.widget_reps));
    }

    @Test
    public void theGlyphsAreTextColouredAndTurnAmberWhilePressed() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now - 1), now);

        int[] pressed = {android.R.attr.state_pressed, android.R.attr.state_enabled};
        for (int id : new int[] {R.id.widget_weight_down, R.id.widget_weight_up,
                R.id.widget_reps_down, R.id.widget_reps_up}) {
            TextView glyph = view().findViewById(id);
            // En reposo, color de texto: el ámbar es sólo del +1.
            assertEquals(context.getColor(R.color.widget_text), glyph.getTextColors().getDefaultColor());
            // Al pulsar, el glifo pasa a accent-ink y su zona se tiñe.
            assertEquals(context.getColor(R.color.widget_accent_ink),
                    glyph.getTextColors().getColorForState(pressed, 0));
            assertTrue(glyph.getBackground().isStateful());
        }
    }

    @Test
    public void unsentSetsShowUntilTheQueueDrains() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now - 1), now);

        tap(R.id.widget_log, now + 1_000);

        assertTrue(shown(R.id.widget_unsent));
        assertEquals(" · 1 sin enviar", text(R.id.widget_unsent));

        http.answer(201, "{\"id\":7,\"sets\":[]}");
        TestWorkerBuilder.from(context, SessionWorker.class, Executors.newSingleThreadExecutor())
                .build()
                .doWork();

        assertTrue(store.queue().isEmpty());
        assertFalse(shown(R.id.widget_unsent));
    }

    @Test
    public void pastTheRestTheTimeTurnsAmberAndCountsUpWithASign() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now - 12_500), now);

        assertFalse(shown(R.id.widget_clock));
        assertTrue(shown(R.id.widget_over));
        SessionWidgetTest.assertOvertime(context, view().findViewById(R.id.widget_over));
    }

    @Test
    public void aBodyweightExerciseHasNoKiloButtons() throws Exception {
        long now = now();
        JSONObject pullUps = bench(now - 1).put("exercise", "Dominadas");
        pullUps.getJSONObject("template").put("weight", JSONObject.NULL);
        SessionController.publish(context, pullUps, now);

        assertFalse(shown(R.id.widget_weight_box));
        assertTrue(shown(R.id.widget_reps_box));
    }

    @Test
    public void endClosesTheControlEverywhere() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now + 60_000), now);
        tap(R.id.widget_log, now + 1_000);

        tap(R.id.widget_end, now + 2_000);

        assertNull(store.control());
        assertNull(notification());
        assertTrue(shown(R.id.widget_idle));
        View smallView = widgets.getViewFor(small);
        assertEquals(View.VISIBLE, smallView.findViewById(R.id.widget_idle).getVisibility());
        // Las series no se tocan: la que iba en la cola sigue ahí.
        assertEquals(1, store.queue().size());
    }

    // --- Sesión caducada (DESIGN.md, «Estados del 4×2 y el 3×2») --------------

    /** El servidor rechaza el token al vaciar la cola, como lo haría WorkManager. */
    private void drainIntoA401() {
        http.answer(401, "");
        TestWorkerBuilder.from(context, SessionWorker.class, Executors.newSingleThreadExecutor())
                .build()
                .doWork();
    }

    @Test
    public void aRejectedTokenShowsSessionExpiredAndKeepsTheSets() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now - 1), now);
        tap(R.id.widget_log, now + 1_000);

        drainIntoA401();

        assertTrue(shown(R.id.widget_expired));
        assertFalse(shown(R.id.widget_session));
        assertFalse(shown(R.id.widget_idle));
        assertEquals("Sesión caducada", text(R.id.widget_expired_title));
        assertEquals("Abre Fitit para volver a entrar. Tus series siguen guardadas.",
                text(R.id.widget_expired_body));
        assertEquals("Abrir Fitit", text(R.id.widget_reopen));
        // Las series no se pierden: esperan en la cola al token nuevo.
        assertEquals(1, store.queue().size());
        // El 4×1 dice lo mismo, con el botón corto.
        View smallView = widgets.getViewFor(small);
        assertEquals(View.VISIBLE, smallView.findViewById(R.id.widget_expired).getVisibility());
        assertEquals(View.GONE, smallView.findViewById(R.id.widget_session).getVisibility());
        assertEquals("Sesión caducada",
                ((TextView) smallView.findViewById(R.id.widget_expired_title)).getText().toString());
        assertEquals("Abrir",
                ((TextView) smallView.findViewById(R.id.widget_reopen)).getText().toString());
    }

    @Test
    public void abrirFititOpensTheAppWithNoOrder() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now - 1), now);
        tap(R.id.widget_log, now + 1_000);
        drainIntoA401();

        view().findViewById(R.id.widget_reopen).performClick();

        // Sólo abrir: la app pide entrar, y ni abre un entreno ni empieza otro.
        Intent started = shadowOf((Application) context).getNextStartedActivity();
        assertNotNull(started);
        assertNull(started.getStringExtra(SessionLaunch.EXTRA_ACTION));
    }

    @Test
    public void aFreshSessionFromTheAppBringsTheWidgetBack() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now - 1), now);
        tap(R.id.widget_log, now + 1_000);
        drainIntoA401();

        SessionController.renew(context, "jwt-new", "https://fitit.example/api", "0.10.0");

        assertFalse(shown(R.id.widget_expired));
        assertTrue(shown(R.id.widget_session));
        assertEquals("jwt-new", store.token());
    }

    @Test
    public void withNoSessionItOffersToStartOne() {
        SessionWidget.updateAll(context);

        assertTrue(shown(R.id.widget_idle));
        assertTrue(shown(R.id.widget_idle_start));
        view().findViewById(R.id.widget_start).performClick();

        Intent started = shadowOf((Application) context).getNextStartedActivity();
        assertNotNull(started);
        assertEquals(SessionLaunch.START, started.getStringExtra(SessionLaunch.EXTRA_ACTION));
    }

    // --- Sin entreno: pestañas (DESIGN.md, «Sin entreno») ---------------------

    private static String day(int ago) {
        return LocalDate.now().minusDays(ago).toString();
    }

    private void summary(JSONObject part) throws Exception {
        store.mergeSummary(part);
        SessionWidget.updateAll(context);
    }

    private static JSONObject last(int ago, String... groups) throws Exception {
        JSONArray names = new JSONArray();
        for (String g : groups) names.put(g);
        return new JSONObject().put("lastWorkout",
                new JSONObject().put("date", day(ago)).put("groups", names));
    }

    private static JSONObject stepsToday(int today, Integer weekAverage) throws Exception {
        return new JSONObject().put("steps", new JSONObject()
                .put("date", day(0))
                .put("today", today)
                .put("weekAverage", weekAverage == null ? JSONObject.NULL : weekAverage));
    }

    // Toca una pestaña y entrega lo que emitió, como Android.
    private void tapTab(int id) {
        List<Intent> before = shadowOf((Application) context).getBroadcastIntents();
        int seen = before.size();
        view().findViewById(id).performClick();
        List<Intent> sent = shadowOf((Application) context).getBroadcastIntents();
        assertEquals("la pestaña emite una acción", seen + 1, sent.size());
        SessionController.handle(context, sent.get(sent.size() - 1), now());
    }

    private boolean active(int label) {
        return ((TextView) view().findViewById(label)).getCurrentTextColor()
                == context.getColor(R.color.widget_text);
    }

    @Test
    public void entrenoSaysHowManyDaysSinceTheLastAndWhatItWas() throws Exception {
        summary(last(2, "Cuádriceps", "Glúteo"));

        assertTrue(shown(R.id.widget_idle_start));
        assertEquals("2", text(R.id.widget_train_days));
        assertEquals("días", text(R.id.widget_train_unit));
        assertEquals("desde el último · ", text(R.id.widget_train_since));
        assertEquals("Cuádriceps · Glúteo", text(R.id.widget_train_groups));
        // Dos grupos: la franja partida en dos mitades.
        assertTrue(shown(R.id.widget_train_stripe_2));
        assertEquals("Empezar entreno", text(R.id.widget_start));

        summary(last(1, "Pecho"));
        assertEquals("1", text(R.id.widget_train_days));
        assertEquals("día", text(R.id.widget_train_unit));
        assertFalse("un grupo, una franja entera", shown(R.id.widget_train_stripe_2));

        summary(last(0, "Core"));
        assertTrue(shown(R.id.widget_train_today));
        assertFalse(shown(R.id.widget_train_days));
        assertFalse(shown(R.id.widget_train_unit));
        assertEquals("último entreno · ", text(R.id.widget_train_since));
    }

    @Test
    public void theStripeTakesTheColourOfItsGroup() {
        assertEquals(R.color.widget_m_cuadriceps, SessionWidget4x2.groupColor("Cuádriceps"));
        assertEquals(R.color.widget_m_gluteo, SessionWidget4x2.groupColor("Glúteo"));
        assertEquals(R.color.widget_m_triceps, SessionWidget4x2.groupColor("Tríceps"));
        assertEquals(R.color.widget_m_core, SessionWidget4x2.groupColor("Core"));
        // Cardio no tiene color de grupo: la franja va en border-strong.
        assertEquals(R.color.widget_border_strong, SessionWidget4x2.groupColor("Cardio"));
    }

    @Test
    public void withNoLastWorkoutEntrenoIsJustTheButton() throws Exception {
        SessionWidget.updateAll(context);

        assertTrue(shown(R.id.widget_idle_start));
        assertFalse(shown(R.id.widget_train));
        assertTrue(shown(R.id.widget_start));
    }

    @Test
    public void withNoStepsThereIsNoPasosTab() throws Exception {
        store.setIdleTab("STEPS");
        SessionWidget.updateAll(context);

        assertTrue(shown(R.id.widget_idle_start));
        assertFalse(shown(R.id.widget_tab_steps));
        assertFalse(shown(R.id.widget_tab_food));
        assertTrue(shown(R.id.widget_tab_train));
        assertTrue(active(R.id.widget_tab_train_label));
    }

    @Test
    public void withStepsTodayPasosIsTheFirstTabAndEntrenoIsATapAway() throws Exception {
        summary(stepsToday(8432, 7910).put("stepsGoal", 10000));
        assertTrue(shown(R.id.widget_tab_steps));
        assertTrue(active(R.id.widget_tab_steps_label));
        assertTrue(shown(R.id.widget_tab_steps_line));
        assertFalse(active(R.id.widget_tab_train_label));
        assertFalse(shown(R.id.widget_tab_train_line));
        assertTrue(shown(R.id.widget_idle_steps));
        assertEquals("8.432", text(R.id.widget_steps));
        assertTrue(shown(R.id.widget_steps_left_line));
        assertEquals("1.568", text(R.id.widget_steps_left));
        assertEquals("7.910", text(R.id.widget_steps_week));
        ProgressBar bar = view().findViewById(R.id.widget_steps_bar);
        assertTrue(shown(R.id.widget_steps_bar));
        assertEquals(843, bar.getProgress());

        tapTab(R.id.widget_tab_train);

        assertTrue(shown(R.id.widget_idle_start));
        assertFalse(shown(R.id.widget_idle_steps));
        assertTrue(active(R.id.widget_tab_train_label));
        // Y se acuerda: repintar no la devuelve a los pasos.
        SessionWidget.updateAll(context);
        assertTrue(shown(R.id.widget_idle_start));

        tapTab(R.id.widget_tab_steps);

        assertTrue(shown(R.id.widget_idle_steps));
    }

    @Test
    public void aGoalMetFillsTheBarAndDropsFaltan() throws Exception {
        summary(stepsToday(12000, null).put("stepsGoal", 10000));

        assertEquals(1000, ((ProgressBar) view().findViewById(R.id.widget_steps_bar)).getProgress());
        assertFalse("meta cumplida: no falta nada", shown(R.id.widget_steps_left_line));
        // Sin media, la línea no se inventa una.
        assertFalse(shown(R.id.widget_steps_week_line));
    }

    @Test
    public void withNoGoalThereIsNoBarAndNoFaltan() throws Exception {
        summary(stepsToday(8432, 7910));

        assertEquals("8.432", text(R.id.widget_steps));
        assertFalse(shown(R.id.widget_steps_left_line));
        assertFalse(shown(R.id.widget_steps_bar));
        // Y su hueco se va con ella: el aire sigue repartido por igual.
        assertFalse(shown(R.id.widget_steps_bar_gap));
    }

    @Test
    public void yesterdaysStepsAreNotTodays() throws Exception {
        // Pasada la medianoche, lo que se leyó ayer no son «pasos hoy».
        summary(new JSONObject().put("steps",
                new JSONObject().put("date", day(1)).put("today", 8432)));

        assertTrue(shown(R.id.widget_idle_start));
        assertFalse(shown(R.id.widget_tab_steps));
    }

    @Test
    public void atMidnightTheWidgetsRepaintThemselves() throws Exception {
        summary(last(2));

        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        // Medianoche, o las 04:00 si ya pasó (el corte del día de comida).
        long midnight = SessionAlarms.nextDayEdge(now(), ZoneId.systemDefault());
        boolean armed = false;
        for (org.robolectric.shadows.ShadowAlarmManager.ScheduledAlarm alarm
                : shadowOf(alarms).getScheduledAlarms()) {
            if (alarm.triggerAtTime == midnight) armed = true;
        }
        assertTrue("hay una alarma al cambiar de día", armed);

        // Y la alarma repinta aunque no haya entreno: «2 días» pasa a 3.
        SessionController.handle(context, new Intent(SessionController.ACTION_DAY), now());
        assertTrue(shown(R.id.widget_idle_start));
        assertEquals("2", text(R.id.widget_train_days));
    }

    // --- La pestaña Comida (DESIGN.md, «Pestaña Comida») ---------------------

    private static String foodDay(int ago) {
        return IdleSummary.foodDay(java.time.LocalDateTime.now()).minusDays(ago).toString();
    }

    /** El día de comida a medias: 118 de 202 g de proteína, 1460 de 2569 kcal. */
    private static JSONObject food(String date, Object protein, Object kcal, Object remainingProtein,
            Object remainingKcal, Object targetKcal) throws Exception {
        return new JSONObject().put("food", new JSONObject()
                .put("date", date)
                .put("protein", protein)
                .put("targetProtein", 202)
                .put("remainingProtein", remainingProtein)
                .put("kcal", kcal)
                .put("targetKcal", targetKcal)
                .put("remainingKcal", remainingKcal));
    }

    private static JSONObject halfDay() throws Exception {
        return food(foodDay(0), 118, 1460, 84, 1109, 2569);
    }

    @Test
    public void comidaSitsBetweenPasosAndEntreno() throws Exception {
        store.mergeSummary(stepsToday(8432, 7910));
        summary(halfDay());

        // Tres pestañas; la que se ve sigue siendo Pasos.
        assertTrue(shown(R.id.widget_tab_steps));
        assertTrue(shown(R.id.widget_tab_food));
        assertTrue(shown(R.id.widget_tab_train));
        assertTrue(shown(R.id.widget_idle_steps));
        assertFalse(shown(R.id.widget_idle_food));

        tapTab(R.id.widget_tab_food);

        assertTrue(shown(R.id.widget_idle_food));
        assertFalse(shown(R.id.widget_idle_steps));
        assertFalse(shown(R.id.widget_idle_start));
        // Cada cifra una vez: «118/202 G» y «1460/2569 KCAL», nada en el centro.
        assertEquals("118", text(R.id.widget_food_protein));
        assertEquals("/202", text(R.id.widget_food_protein_target));
        assertEquals(" G", text(R.id.widget_food_protein_unit));
        assertEquals("1460", text(R.id.widget_food_kcal));
        assertEquals("/2569", text(R.id.widget_food_kcal_target));
        assertEquals(" KCAL", text(R.id.widget_food_kcal_unit));
        assertEquals(context.getColor(R.color.widget_accent_ink),
                ((TextView) view().findViewById(R.id.widget_food_protein)).getCurrentTextColor());
        assertEquals(context.getColor(R.color.widget_text),
                ((TextView) view().findViewById(R.id.widget_food_kcal)).getCurrentTextColor());
        android.widget.ImageView rings = view().findViewById(R.id.widget_food_rings);
        assertNotNull("los anillos se pintan", rings.getDrawable());

        tapTab(R.id.widget_tab_train);
        assertTrue(shown(R.id.widget_idle_start));
    }

    @Test
    public void theChosenTabSurvivesATabThatComesAndGoes() throws Exception {
        summary(halfDay());
        tapTab(R.id.widget_tab_train);

        // Llegan los pasos de hoy: aparece Pasos delante, y Entreno sigue elegida.
        summary(stepsToday(8432, 7910));
        assertTrue(shown(R.id.widget_tab_steps));
        assertTrue(shown(R.id.widget_idle_start));
    }

    @Test
    public void withoutStepsComidaIsTheFirstTab() throws Exception {
        summary(halfDay());

        assertTrue(shown(R.id.widget_idle_food));
        assertFalse(shown(R.id.widget_tab_steps));
        assertTrue(active(R.id.widget_tab_food_label));
    }

    @Test
    public void withoutAProteinTargetThereIsNoComidaTab() throws Exception {
        JSONObject part = halfDay();
        part.getJSONObject("food").put("targetProtein", JSONObject.NULL);
        summary(part);

        assertTrue(shown(R.id.widget_idle_start));
        assertFalse(shown(R.id.widget_tab_food));
        assertFalse(shown(R.id.widget_idle_food));
    }

    @Test
    public void yesterdaysFoodIsAnEmptyDayWithTheSameTargets() throws Exception {
        // Pasadas las 04:00, lo apuntado ayer no es de hoy: anillos vacíos y nada
        // comido («—», no 0).
        summary(food(foodDay(1), 118, 1460, 84, 1109, 2569));

        assertTrue(shown(R.id.widget_idle_food));
        assertEquals("—", text(R.id.widget_food_protein));
        assertEquals("/202", text(R.id.widget_food_protein_target));
        assertEquals("—", text(R.id.widget_food_kcal));
    }

    @Test
    public void closedProteinTurnsToTheRecordColour() throws Exception {
        summary(food(foodDay(0), 205, 2769, -3, -200, 2569));

        assertEquals("205", text(R.id.widget_food_protein));
        for (int id : new int[] {R.id.widget_food_protein, R.id.widget_food_protein_target,
                R.id.widget_food_protein_unit}) {
            assertEquals(context.getColor(R.color.widget_pr),
                    ((TextView) view().findViewById(id)).getCurrentTextColor());
        }
        // Las kcal no cambian de color: el récord es de la proteína.
        assertEquals(context.getColor(R.color.widget_text),
                ((TextView) view().findViewById(R.id.widget_food_kcal)).getCurrentTextColor());
    }

    @Test
    public void withoutAKcalTargetOnlyProteinIsShown() throws Exception {
        summary(food(foodDay(0), 118, 1460, 84, JSONObject.NULL, JSONObject.NULL));

        assertTrue(shown(R.id.widget_idle_food));
        assertEquals("118", text(R.id.widget_food_protein));
        assertFalse(shown(R.id.widget_food_kcal_group));
    }

    @Test
    public void tappingFoodOpensComida() throws Exception {
        summary(halfDay());

        view().findViewById(R.id.widget_idle_food).performClick();

        Intent started = shadowOf((Application) context).getNextStartedActivity();
        assertNotNull(started);
        assertEquals(SessionLaunch.FOOD, started.getStringExtra(SessionLaunch.EXTRA_ACTION));
    }

    // Lo guardado no se pierde al actualizar ni al reiniciar, pero nadie repintaba:
    // el widget quedaba vacío hasta abrir Fitit.
    @Test
    public void aNewApkOrABootRepaintsWhatIsStored() throws Exception {
        store.mergeSummary(halfDay());
        assertFalse("sin repintar, el widget no lo sabe", shown(R.id.widget_idle_food));

        new WidgetRefreshReceiver().onReceive(context, new Intent(Intent.ACTION_MY_PACKAGE_REPLACED));
        assertTrue(shown(R.id.widget_idle_food));
        assertEquals("118", text(R.id.widget_food_protein));

        store.mergeSummary(food(foodDay(0), 150, 2000, 52, 569, 2569));
        new WidgetRefreshReceiver().onReceive(context, new Intent(Intent.ACTION_BOOT_COMPLETED));
        assertEquals("150", text(R.id.widget_food_protein));
    }

    @Test
    public void otherBroadcastsDoNothing() throws Exception {
        store.mergeSummary(halfDay());
        new WidgetRefreshReceiver().onReceive(context, new Intent(Intent.ACTION_SCREEN_ON));
        assertFalse(shown(R.id.widget_idle_food));
    }

    @Test
    public void theDayEdgeIsFourInTheMorningThenMidnight() {
        ZoneId zone = ZoneId.of("Europe/Madrid");
        long night = java.time.ZonedDateTime.of(2026, 10, 2, 1, 30, 0, 0, zone).toInstant().toEpochMilli();
        long four = java.time.ZonedDateTime.of(2026, 10, 2, 4, 0, 0, 0, zone).toInstant().toEpochMilli();
        long noon = java.time.ZonedDateTime.of(2026, 10, 2, 12, 0, 0, 0, zone).toInstant().toEpochMilli();
        long midnight = java.time.ZonedDateTime.of(2026, 10, 3, 0, 0, 0, 0, zone).toInstant().toEpochMilli();

        assertEquals(four, SessionAlarms.nextDayEdge(night, zone));
        assertEquals(midnight, SessionAlarms.nextDayEdge(four, zone));
        assertEquals(midnight, SessionAlarms.nextDayEdge(noon, zone));
    }

    @Test
    public void macrosPrintLikeTheApp() {
        // Cuatro cifras sin punto, cinco con punto (formatMacro, RAE); null es «—».
        assertEquals("2569", IdleSummary.macro(2569.4));
        assertEquals("12.500", IdleSummary.macro(12500.0));
        assertEquals("—", IdleSummary.macro(null));
    }

    // --- El 3×2: el mismo widget, más estrecho (DESIGN.md, «Tamaños») ----------

    @Test
    public void theThreeByTwoIsTheSameWidgetAndLogsTheSame() throws Exception {
        int mid = widgets.createWidget(SessionWidget3x2.class, R.layout.widget_session_4x2);
        long now = now();
        SessionController.publish(context, bench(now + 83_000), now);

        View three = widgets.getViewFor(mid);
        assertEquals("Press banca", ((TextView) three.findViewById(R.id.widget_exercise)).getText().toString());
        assertEquals("32,5", ((TextView) three.findViewById(R.id.widget_weight)).getText().toString());
        assertEquals("+1", ((TextView) three.findViewById(R.id.widget_log)).getText().toString());

        List<Intent> before = shadowOf((Application) context).getBroadcastIntents();
        int seen = before.size();
        three.findViewById(R.id.widget_log).performClick();
        List<Intent> sent = shadowOf((Application) context).getBroadcastIntents();
        assertEquals(seen + 1, sent.size());
        SessionController.handle(context, sent.get(sent.size() - 1), now + 1_000);

        assertEquals(1, store.queue().size());
        // Y lo repinta el mismo updateAll que a los otros dos.
        assertEquals("5", ((TextView) widgets.getViewFor(mid)
                .findViewById(R.id.widget_count_n)).getText().toString());
    }

    @Test
    public void tappingTheExerciseOpensThatWorkout() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now - 1), now);

        view().findViewById(R.id.widget_open).performClick();

        Intent started = shadowOf((Application) context).getNextStartedActivity();
        assertNotNull(started);
        assertEquals(SessionLaunch.OPEN, started.getStringExtra(SessionLaunch.EXTRA_ACTION));
        assertEquals(7, started.getIntExtra(SessionLaunch.EXTRA_WORKOUT, -1));
    }

    // --- Pausar el descanso ----------------------------------------------------

    @Test
    public void thePauseButtonOnlyShowsWhileTheRestRuns() throws Exception {
        SessionController.publish(context, bench(now() + 90_000), now());
        assertTrue(shown(R.id.widget_rest_toggle));
        assertEquals(context.getString(R.string.widget_rest_pause),
                view().findViewById(R.id.widget_rest_toggle).getContentDescription());

        SessionController.publish(context, bench(now() - 5_000), now());
        assertFalse("pasado de tiempo no hay nada que pausar", shown(R.id.widget_rest_toggle));

        SessionController.publish(context, bench(0), now());
        assertFalse(shown(R.id.widget_rest_toggle));
    }

    @Test
    public void pausingFreezesTheClockAndResumingCountsAgain() throws Exception {
        SessionController.publish(context, bench(now() + 90_000), now());

        tap(R.id.widget_rest_toggle, now());

        assertTrue(store.control().getLong("restPausedMs") > 0);
        assertFalse(shown(R.id.widget_clock));
        assertFalse(shown(R.id.widget_over));
        assertTrue(shown(R.id.widget_paused));
        assertTrue(text(R.id.widget_paused).matches("01:[23]\\d"));
        assertEquals(context.getColor(R.color.widget_muted),
                ((TextView) view().findViewById(R.id.widget_paused)).getCurrentTextColor());
        assertEquals(context.getString(R.string.widget_rest_resume),
                view().findViewById(R.id.widget_rest_toggle).getContentDescription());
        // El 4×1 no tiene botón, pero también se queda quieto.
        View small4x1 = widgets.getViewFor(small);
        assertEquals(View.VISIBLE, small4x1.findViewById(R.id.widget_paused).getVisibility());
        assertEquals(View.GONE, small4x1.findViewById(R.id.widget_clock).getVisibility());
        // En pausa no hay fin del descanso que esperar.
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        assertTrue(shadowOf(alarms).getScheduledAlarms().stream()
                .noneMatch(a -> a.getTriggerAtMs() < now() + SessionControl.IDLE_MS - 60_000));

        tap(R.id.widget_rest_toggle, now());

        assertFalse(store.control().has("restPausedMs"));
        assertTrue(store.control().getLong("restEndsAt") > now());
        assertTrue(shown(R.id.widget_clock));
        assertFalse(shown(R.id.widget_paused));
        assertEquals(context.getString(R.string.widget_rest_pause),
                view().findViewById(R.id.widget_rest_toggle).getContentDescription());
    }

    @Test
    public void plusOneWhilePausedStartsANewRestRunning() throws Exception {
        SessionController.publish(context, bench(now() + 90_000), now());
        tap(R.id.widget_rest_toggle, now());

        tap(R.id.widget_log, now());

        assertFalse(store.control().has("restPausedMs"));
        assertTrue(shown(R.id.widget_clock));
        assertFalse(shown(R.id.widget_paused));
    }

    @Test
    public void theCompactWidgetFreezesTheInlineClock() throws Exception {
        SessionController.publish(context, bench(now() + 90_000), now());
        tap(R.id.widget_rest_toggle, now());

        View compact = SessionWidget4x2.views(context, store.control(), now(),
                SessionWidget4x2.Fit.COMPACT).apply(context, new android.widget.FrameLayout(context));

        // El compacto tiene su propio tiempo, en la línea del nombre a 24sp.
        TextView paused = compact.findViewById(R.id.widget_paused);
        assertEquals(View.VISIBLE, paused.getVisibility());
        assertEquals(24 * context.getResources().getDisplayMetrics().scaledDensity, paused.getTextSize(), 0.5f);
        assertEquals(View.GONE, compact.findViewById(R.id.widget_clock).getVisibility());
    }

    @Test
    public void theNarrowWidgetHasTheRingToo() throws Exception {
        // El 3×2 del Xiaomi (≈253 dp): también lleva el aro, aunque el nombre se
        // corte mientras se descansa (0.15.0; en la 0.14.0 se tocaba el tiempo y
        // no se veía que fuera un botón).
        SessionController.publish(context, bench(now() + 90_000), now());
        View narrow = SessionWidget4x2.views(context, store.control(), now(),
                SessionWidget4x2.Fit.NARROW).apply(context, new android.widget.FrameLayout(context));
        assertEquals(View.VISIBLE, narrow.findViewById(R.id.widget_rest_toggle).getVisibility());
        assertFalse(narrow.findViewById(R.id.widget_clock).hasOnClickListeners());

        List<Intent> before = shadowOf((Application) context).getBroadcastIntents();
        int seen = before.size();
        narrow.findViewById(R.id.widget_rest_toggle).performClick();
        List<Intent> sent = shadowOf((Application) context).getBroadcastIntents();
        assertEquals(seen + 1, sent.size());
        assertEquals(SessionController.ACTION_REST_TOGGLE, sent.get(sent.size() - 1).getAction());
    }
}
