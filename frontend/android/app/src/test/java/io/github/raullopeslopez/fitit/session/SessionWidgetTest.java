package io.github.raullopeslopez.fitit.session;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.Manifest;
import android.app.Application;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.os.Vibrator;
import android.view.View;
import android.widget.Chronometer;
import android.widget.TextView;
import androidx.test.core.app.ApplicationProvider;
import androidx.work.testing.WorkManagerTestInitHelper;
import io.github.raullopeslopez.fitit.R;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAppWidgetManager;

// El widget 4×1 de la pantalla de inicio. Spec: docs/widgets-entreno.md,
// «2 · Widget de pantalla de inicio» y fase 3; maqueta en la spec.
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class SessionWidgetTest {
    private Context context;
    private SessionStore store;
    private ShadowAppWidgetManager widgets;
    private int widgetId;

    @Before
    public void setUp() throws Exception {
        context = ApplicationProvider.getApplicationContext();
        shadowOf((Application) context).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        WorkManagerTestInitHelper.initializeTestWorkManager(context);
        store = new SessionStore(context, new SessionStoreTest.FakeCipher());
        Session.useForTests(store, new QueueDrainerTest.FakeHttp());
        widgets = shadowOf(AppWidgetManager.getInstance(context));
        widgetId = widgets.createWidget(SessionWidget.class, R.layout.widget_session_4x1);
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
        return widgets.getViewFor(widgetId);
    }

    private String text(int id) {
        return ((TextView) view().findViewById(id)).getText().toString();
    }

    private boolean shown(int id) {
        View v = view().findViewById(id);
        return v != null && v.getVisibility() == View.VISIBLE;
    }

    @Test
    public void withASessionItShowsTheSetToRepeatAndTheClock() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now + 83_000), now);

        assertTrue(shown(R.id.widget_session));
        assertFalse(shown(R.id.widget_idle));
        assertEquals("Press banca", text(R.id.widget_exercise));
        assertEquals("32,5 kg × 12", text(R.id.widget_set));
        assertEquals("4", text(R.id.widget_count_n));
        // Sólo «+1» (DESIGN.md): la serie ya está escrita a su izquierda.
        assertEquals("+1", text(R.id.widget_repeat));
        // El reloj lo lleva el propio widget: cuenta atrás hasta el fin del descanso.
        Chronometer clock = view().findViewById(R.id.widget_clock);
        assertTrue(shown(R.id.widget_clock));
        assertTrue(clock.isCountDown());
        long remaining = clock.getBase() - SystemClock.elapsedRealtime();
        assertTrue("remaining " + remaining, remaining > 80_000 && remaining <= 83_000);
    }

    @Test
    public void pastTheRestTheTimeTurnsAmberAndCountsUpWithASign() throws Exception {
        // DESIGN.md: al llegar a cero, el mismo número pasa a accent-ink y cuenta
        // hacia arriba con signo, +00:12. No hay «Descanso terminado».
        long now = now();
        SessionController.publish(context, bench(now - 12_500), now);

        assertFalse(shown(R.id.widget_clock));
        assertTrue(shown(R.id.widget_over));
        assertOvertime(context, view().findViewById(R.id.widget_over));
        for (String shownText : texts(view())) {
            assertFalse(shownText, shownText.contains("Descanso terminado"));
        }
    }

    /** El tiempo de más: cuenta hacia arriba desde el fin del descanso, con «+», en ámbar. */
    static void assertOvertime(Context context, Chronometer over) {
        assertFalse(over.isCountDown());
        long since = SystemClock.elapsedRealtime() - over.getBase();
        assertTrue("desde el fin: " + since, since >= 12_000 && since <= 14_000);
        assertEquals("+%s", over.getFormat());
        assertTrue(over.getText().toString(), over.getText().toString().matches("\\+00:1[234]"));
        assertEquals(context.getColor(R.color.widget_accent_ink), over.getCurrentTextColor());
    }

    @Test
    public void withRestOffThereIsNoClock() throws Exception {
        long now = now();
        SessionController.publish(context, bench(0).put("restSeconds", 0), now);

        assertFalse(shown(R.id.widget_clock));
        assertFalse(shown(R.id.widget_over));
    }

    @Test
    public void theMuscleGroupIsNotShown() throws Exception {
        // Fase 5: «Press banca», no «Press banca · Pecho».
        long now = now();
        SessionController.publish(context, bench(0), now);

        for (String shownText : texts(view())) assertFalse(shownText, shownText.contains("Pecho"));
    }

    /** Todo el texto que se ve en un widget pintado. */
    static java.util.List<String> texts(View root) {
        java.util.List<String> found = new java.util.ArrayList<>();
        collect(root, found);
        return found;
    }

    /** Cuántas vistas visibles se describen así a un lector de pantalla. */
    static int described(View view, String description) {
        if (view.getVisibility() != View.VISIBLE) return 0;
        int count = description.contentEquals(
                view.getContentDescription() == null ? "" : view.getContentDescription()) ? 1 : 0;
        if (view instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) count += described(group.getChildAt(i), description);
        }
        return count;
    }

    private static void collect(View view, java.util.List<String> found) {
        if (view.getVisibility() != View.VISIBLE) return;
        if (view instanceof TextView) found.add(((TextView) view).getText().toString());
        if (view instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) collect(group.getChildAt(i), found);
        }
    }

    @Test
    public void withNoSessionItOffersToStartOne() {
        SessionWidget.updateAll(context);

        assertTrue(shown(R.id.widget_idle));
        assertFalse(shown(R.id.widget_session));
        assertEquals("Sin entreno en curso", text(R.id.widget_idle_title));
        assertEquals("Empezar entreno", text(R.id.widget_start));
    }

    @Test
    public void endingTheSessionTurnsItBackToIdle() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now + 83_000), now);

        SessionController.end(context);

        assertTrue(shown(R.id.widget_idle));
    }

    @Test
    public void plusOneOnTheWidgetLogsFollowsAndVibrates() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now - 1), now);

        view().findViewById(R.id.widget_repeat).performClick();
        Intent sent = shadowOf((Application) context).getBroadcastIntents().get(0);
        SessionController.handle(context, sent, now + 5_000);

        assertEquals(1, store.queue().size());
        assertEquals("5", text(R.id.widget_count_n));
        // «Vibra al tocar +1 serie en el widget»: una pulsación corta, y es lo
        // único que vibra en toda la función.
        Vibrator vibrator = context.getSystemService(Vibrator.class);
        assertTrue(shadowOf(vibrator).isVibrating());
    }

    @Test
    public void plusOneOnTheNotificationDoesNotVibrate() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now - 1), now);

        SessionController.handle(context, new Intent(SessionController.ACTION_REPEAT), now + 5_000);

        Vibrator vibrator = context.getSystemService(Vibrator.class);
        assertFalse(shadowOf(vibrator).isVibrating());
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

    @Test
    public void startWorkoutOpensTheAppToStartTodays() {
        SessionWidget.updateAll(context);

        view().findViewById(R.id.widget_start).performClick();

        Intent started = shadowOf((Application) context).getNextStartedActivity();
        assertNotNull(started);
        assertEquals(SessionLaunch.START, started.getStringExtra(SessionLaunch.EXTRA_ACTION));
    }

    @Test
    public void theLaunchOrderIsReadOnce() {
        Intent intent = SessionLaunch.intent(context, SessionLaunch.OPEN, 7);

        JSONObject first = SessionLaunch.take(intent);
        assertEquals("open", first.optString("action"));
        assertEquals(7, first.optInt("workoutId"));
        // La app no vuelve a abrir el entreno al girar el teléfono o recrearse.
        assertEquals(null, SessionLaunch.take(intent));
    }

    // --- La barra del descanso (0.17.0, «el descanso se vacía», 2a) ------------
    // El fondo del 4×1 es lo que queda de descanso: se retira de derecha a
    // izquierda. Un widget sólo corre solo con el cronómetro, así que la barra
    // se repinta cada 5 s, y sólo mientras el descanso corre.

    private android.widget.ProgressBar bar() {
        return view().findViewById(R.id.widget_rest_bar);
    }

    /** Las alarmas de repintar la barra que hay puestas. */
    private java.util.List<org.robolectric.shadows.ShadowAlarmManager.ScheduledAlarm> ticks() {
        java.util.List<org.robolectric.shadows.ShadowAlarmManager.ScheduledAlarm> found =
                new java.util.ArrayList<>();
        for (org.robolectric.shadows.ShadowAlarmManager.ScheduledAlarm alarm :
                shadowOf(context.getSystemService(android.app.AlarmManager.class)).getScheduledAlarms()) {
            Intent intent = shadowOf(alarm.operation).getSavedIntent();
            if (SessionController.ACTION_BAR_TICK.equals(intent.getAction())) found.add(alarm);
        }
        return found;
    }

    @Test
    public void restingTheBackgroundIsWhatIsLeftOfTheRest() throws Exception {
        long now = now();
        // 45 de 90 s: media barra.
        SessionController.publish(context, bench(now + 45_000), now);

        assertTrue(shown(R.id.widget_rest_bar));
        assertEquals(1_000, bar().getMax());
        assertEquals(500, bar().getProgress(), 10);
        // El siguiente repintado, en 5 s, sin despertar al teléfono.
        assertEquals(1, ticks().size());
        assertEquals(android.app.AlarmManager.RTC, ticks().get(0).getType());
        assertEquals(now + SessionWidget.BAR_TICK_MS, ticks().get(0).getTriggerAtMs(), 1_000);
    }

    @Test
    public void eachTickRepaintsTheBarAndArmsTheNext() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now + 45_000), now);

        SessionController.handle(context, new Intent(SessionController.ACTION_BAR_TICK), now + 9_000);

        assertEquals(400, bar().getProgress(), 10);
        assertEquals(1, ticks().size());
        assertEquals(now + 9_000 + SessionWidget.BAR_TICK_MS, ticks().get(0).getTriggerAtMs());
    }

    @Test
    public void theLastStretchIsLeftToTheEndOfRestRepaint() throws Exception {
        long now = now();
        // Quedan 3 s: el próximo repintado ya es el del fin del descanso.
        SessionController.publish(context, bench(now + 3_000), now);

        assertTrue(shown(R.id.widget_rest_bar));
        assertTrue(ticks().isEmpty());
    }

    @Test
    public void pastTheRestThereIsNoBarAndNoRepaints() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now + 45_000), now);
        assertEquals(1, ticks().size());

        SessionController.publish(context, bench(now - 12_500), now);

        assertFalse(shown(R.id.widget_rest_bar));
        assertTrue(ticks().isEmpty());
        // Una alarma que llegue tarde no vuelve a armar nada.
        SessionController.handle(context, new Intent(SessionController.ACTION_BAR_TICK), now + 5_000);
        assertTrue(ticks().isEmpty());
    }

    @Test
    public void withoutRestThereIsNoBarAndNoRepaints() throws Exception {
        SessionController.publish(context, bench(0), now());

        assertFalse(shown(R.id.widget_rest_bar));
        assertTrue(ticks().isEmpty());
    }

    @Test
    public void pausedTheBarStaysStillAndStopsRepainting() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now + 45_000), now);

        SessionController.handle(context, new Intent(SessionController.ACTION_REST_TOGGLE), now);

        assertTrue(shown(R.id.widget_rest_bar));
        assertEquals(500, bar().getProgress(), 10);
        assertTrue(ticks().isEmpty());
    }

    @Test
    public void endingTheSessionStopsTheRepaints() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now + 45_000), now);

        SessionController.end(context);

        assertFalse(shown(R.id.widget_rest_bar));
        assertTrue(ticks().isEmpty());
    }
}
