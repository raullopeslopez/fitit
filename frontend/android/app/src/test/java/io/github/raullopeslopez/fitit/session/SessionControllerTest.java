package io.github.raullopeslopez.fitit.session;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Application;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.os.VibrationAttributes;
import android.os.Vibrator;
import android.view.View;
import android.widget.Chronometer;
import android.widget.FrameLayout;
import android.widget.TextView;
import androidx.test.core.app.ApplicationProvider;
import androidx.work.testing.WorkManagerTestInitHelper;
import io.github.raullopeslopez.fitit.R;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlarmManager;

// La notificación en curso, de punta a punta sin teléfono: lo que Entreno
// publica, lo que enseña Android y lo que hace cada toque. Spec:
// docs/widgets-entreno.md («Comportamiento», fase 6) y DESIGN.md («La notificación
// del entreno»).
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class SessionControllerTest {
    private static final long NOW = 1_790_000_000_000L;

    private Context context;
    private SessionStore store;
    private NotificationManager notifications;
    private ShadowAlarmManager alarms;
    private final List<String> heard = new ArrayList<>();
    private final SessionEvents.Listener listener = new SessionEvents.Listener() {
        @Override
        public void onSent(QueueDrainer.Outcome outcome) {
            heard.add("sent");
        }

        @Override
        public void onChanged() {
            heard.add("changed");
        }
    };

    @Before
    public void setUp() throws Exception {
        context = ApplicationProvider.getApplicationContext();
        shadowOf((Application) context).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        WorkManagerTestInitHelper.initializeTestWorkManager(context);
        store = new SessionStore(context, new SessionStoreTest.FakeCipher());
        Session.useForTests(store, new QueueDrainerTest.FakeHttp());
        notifications = context.getSystemService(NotificationManager.class);
        alarms = shadowOf(context.getSystemService(AlarmManager.class));
        SessionEvents.add(listener);
    }

    @After
    public void tearDown() {
        SessionEvents.remove(listener);
        Session.useForTests(null, null);
    }

    private static JSONObject bench(long restEndsAt) throws Exception {
        return new JSONObject()
                .put("workoutId", 1)
                .put("exercise", "Press banca")
                .put("group", "Pecho")
                .put("template", new JSONObject()
                        .put("exercise_name", "Press banca")
                        .put("reps", 12)
                        .put("weight", 32.5))
                .put("count", 4)
                .put("restSeconds", 90)
                .put("restEndsAt", restEndsAt)
                .put("lastSetAt", NOW);
    }

    /** La tarjeta del entreno (no el aviso de fin de descanso, que va aparte). */
    private Notification shown() {
        return shadowOf(notifications).getNotification(SessionNotification.ID);
    }

    private org.robolectric.shadows.ShadowVibrator vibrator() {
        return shadowOf(context.getSystemService(Vibrator.class));
    }

    private static List<String> actions(Notification n) {
        List<String> titles = new ArrayList<>();
        if (n.actions != null) for (Notification.Action a : n.actions) titles.add(a.title.toString());
        return titles;
    }

    private void tap(String action) {
        SessionController.handle(context, new Intent(action), NOW + 5_000);
    }

    /** La notificación cerrada, inflada como la pintaría Android. */
    private View collapsed() {
        return shown().contentView.apply(context, new FrameLayout(context));
    }

    /** Y desplegada. */
    private View expanded() {
        return shown().bigContentView.apply(context, new FrameLayout(context));
    }

    private static String text(View root, int id) {
        return ((TextView) root.findViewById(id)).getText().toString();
    }

    private static boolean visible(View root, int id) {
        View v = root.findViewById(id);
        return v != null && v.getVisibility() == View.VISIBLE;
    }

    // --- Lo que se ve (N4: diseño propio, DESIGN.md «La notificación») --------

    @Test
    public void entrenoPublishesAndTheCardAppears() throws Exception {
        SessionController.publish(context, bench(NOW + 83_000), NOW);

        Notification n = shown();
        assertNotNull(n);
        // Título y texto siguen ahí para quien no pinta el diseño propio (lector
        // de pantalla, relojes).
        assertEquals("Press banca", n.extras.getString(Notification.EXTRA_TITLE));
        assertEquals("32,5 kg × 12 · 4 series", n.extras.getCharSequence(Notification.EXTRA_TEXT).toString());
        // En curso: deslizar no la quita.
        assertTrue((n.flags & Notification.FLAG_ONGOING_EVENT) != 0);
        assertEquals(Notification.VISIBILITY_PUBLIC, n.visibility);
    }

    @Test
    public void itIsOurOwnDesignInsideTheSystemFrameWithNoSystemButtons() throws Exception {
        SessionController.publish(context, bench(NOW + 83_000), NOW);

        Notification n = shown();
        // Cabecera y marco los pone Android; lo de en medio es nuestro.
        assertEquals("android.app.Notification$DecoratedCustomViewStyle",
                n.extras.getString(Notification.EXTRA_TEMPLATE));
        assertEquals(R.layout.notification_session, n.contentView.getLayoutId());
        assertEquals(R.layout.notification_session_big, n.bigContentView.getLayoutId());
        // Sin botones del sistema: ni +1 serie, ni Otra serie, ni Otro ejercicio.
        assertEquals(List.of(), actions(n));
        // El tiempo es el nuestro, grande; la cabecera no repite otro reloj.
        assertFalse(n.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER));
    }

    @Test
    public void collapsedItIsTheExerciseTheSetAndTheTimeOnTheRight() throws Exception {
        SessionController.publish(context, bench(NOW + 83_000), NOW);

        View root = collapsed();
        assertEquals("Press banca", text(root, R.id.widget_exercise));
        assertEquals("32,5 kg × 12", text(root, R.id.widget_set));
        assertEquals(" · 4 series", text(root, R.id.widget_count));
        Chronometer clock = root.findViewById(R.id.widget_clock);
        assertTrue(visible(root, R.id.widget_clock));
        assertTrue(clock.isCountDown());
        long remaining = clock.getBase() - SystemClock.elapsedRealtime();
        assertEquals(83_000, remaining, 1_000);
        assertFalse(visible(root, R.id.widget_over));
    }

    @Test
    public void expandedItCarriesTheSameAdjustBlockAsTheWidget() throws Exception {
        SessionController.publish(context, bench(NOW + 83_000), NOW);

        View root = expanded();
        assertEquals("Press banca", text(root, R.id.widget_exercise));
        assertEquals(" · 4 series", text(root, R.id.widget_count));
        assertTrue(visible(root, R.id.widget_clock));
        assertTrue(visible(root, R.id.widget_block));
        assertEquals("32,5", text(root, R.id.widget_weight));
        assertEquals("12", text(root, R.id.widget_reps));
        assertEquals("+1", text(root, R.id.widget_log));
    }

    @Test
    public void theExpandedBlockAdjustsAndLogsWithoutVibrating() throws Exception {
        SessionController.publish(context, bench(NOW - 1), NOW);

        tapIn(expanded(), R.id.widget_weight_up);
        assertTrue(store.queue().isEmpty());
        assertEquals("35", text(expanded(), R.id.widget_weight));

        tapIn(expanded(), R.id.widget_log);
        assertEquals(1, store.queue().size());
        assertEquals(35, store.head().getJSONObject("payload").getDouble("weight"), 0);
        assertEquals(" · 5 series", text(expanded(), R.id.widget_count));
        // Sólo el widget vibra.
        assertFalse(shadowOf(context.getSystemService(Vibrator.class)).isVibrating());
    }

    // Toca una vista de la notificación y entrega lo que emitió, como Android.
    private void tapIn(View root, int id) {
        List<Intent> before = shadowOf((Application) context).getBroadcastIntents();
        int seen = before.size();
        root.findViewById(id).performClick();
        List<Intent> sent = shadowOf((Application) context).getBroadcastIntents();
        assertEquals("la vista emite una acción", seen + 1, sent.size());
        SessionController.handle(context, sent.get(sent.size() - 1), NOW + 5_000);
    }

    @Test
    public void pastTheRestTheTimeTurnsAmberAndCountsUpWithASign() throws Exception {
        SessionController.publish(context, bench(NOW - 12_000), NOW);

        for (View root : new View[] {collapsed(), expanded()}) {
            assertFalse(visible(root, R.id.widget_clock));
            assertTrue(visible(root, R.id.widget_over));
            Chronometer over = root.findViewById(R.id.widget_over);
            assertFalse(over.isCountDown());
            assertEquals(12_000, SystemClock.elapsedRealtime() - over.getBase(), 1_000);
            assertEquals("+%s", over.getFormat());
            assertEquals(context.getColor(R.color.widget_accent_ink), over.getCurrentTextColor());
        }
        assertNull(shown().extras.getCharSequence(Notification.EXTRA_SUB_TEXT));
    }

    @Test
    public void withRestOffThereIsNoClock() throws Exception {
        SessionController.publish(context, bench(0).put("restSeconds", 0), NOW);

        for (View root : new View[] {collapsed(), expanded()}) {
            assertFalse(visible(root, R.id.widget_clock));
            assertFalse(visible(root, R.id.widget_over));
        }
    }

    @Test
    public void theChannelMakesNoSoundAndShowsOnTheLockScreen() throws Exception {
        SessionController.publish(context, bench(NOW + 83_000), NOW);

        NotificationChannel channel = notifications.getNotificationChannel(SessionNotification.CHANNEL);
        assertNotNull(channel);
        assertEquals("Entreno en curso", channel.getName().toString());
        // Importancia normal, no baja: Android (y Xiaomi el primero) esconde de
        // la pantalla de bloqueo las notificaciones de importancia baja, que
        // trata como «silenciosas». Sin sonido ni vibración sigue sin sonar.
        assertEquals(NotificationManager.IMPORTANCE_DEFAULT, channel.getImportance());
        assertNull(channel.getSound());
        assertFalse(channel.shouldVibrate());
        assertEquals(Notification.VISIBILITY_PUBLIC, channel.getLockscreenVisibility());
    }

    @Test
    public void theLowImportanceChannelOfApk060IsRetired() throws Exception {
        // Android no deja subir la importancia de un canal que ya existe: el de
        // la 0.6.0 se borra y el control usa uno nuevo.
        notifications.createNotificationChannel(
                new NotificationChannel("fitit_session", "Entreno en curso", NotificationManager.IMPORTANCE_LOW));

        SessionController.publish(context, bench(NOW + 83_000), NOW);

        assertNull(notifications.getNotificationChannel("fitit_session"));
        assertNotNull(notifications.getNotificationChannel(SessionNotification.CHANNEL));
    }

    @Test
    public void theChannelsOfTheOldRestNoticeAreRetired() throws Exception {
        notifications.createNotificationChannel(
                new NotificationChannel("fitit-sesion", "Sesión en curso", NotificationManager.IMPORTANCE_LOW));
        notifications.createNotificationChannel(
                new NotificationChannel("fitit-fin-descanso", "Fin del descanso", NotificationManager.IMPORTANCE_HIGH));

        SessionController.publish(context, bench(NOW + 83_000), NOW);

        assertNull(notifications.getNotificationChannel("fitit-sesion"));
        assertNull(notifications.getNotificationChannel("fitit-fin-descanso"));
    }

    @Test
    public void withoutPermissionNothingIsShownAndNothingBreaks() throws Exception {
        shadowOf((Application) context).denyPermissions(Manifest.permission.POST_NOTIFICATIONS);
        shadowOf(notifications).setNotificationsEnabled(false);

        SessionController.publish(context, bench(NOW + 83_000), NOW);

        assertNull(shown());
        // El control sigue guardado: el widget (fase 3) lo usa sin notificación.
        assertNotNull(store.control());
    }

    // --- Lo que hace cada toque -----------------------------------------------

    @Test
    public void plusOneLogsTheSetWithoutOpeningTheApp() throws Exception {
        SessionController.publish(context, bench(NOW - 1), NOW);

        tap(SessionController.ACTION_REPEAT);

        assertEquals(1, store.queue().size());
        JSONObject payload = store.head().getJSONObject("payload");
        assertEquals(32.5, payload.getDouble("weight"), 0);
        assertEquals(12, payload.getInt("reps"));
        // La notificación se actualiza en sitio: una serie más y reloj nuevo.
        Notification n = shown();
        assertEquals("32,5 kg × 12 · 5 series", n.extras.getCharSequence(Notification.EXTRA_TEXT).toString());
        Chronometer clock = collapsed().findViewById(R.id.widget_clock);
        assertEquals(90_000, clock.getBase() - SystemClock.elapsedRealtime(), 1_000);
        // Y la app, si está abierta, se entera.
        assertTrue(heard.contains("changed"));
    }

    @Test
    public void plusOneAsksForTheSetToBeSentRightAway() throws Exception {
        SessionController.publish(context, bench(NOW - 1), NOW);

        tap(SessionController.ACTION_REPEAT);

        assertEquals(1, androidx.work.WorkManager.getInstance(context)
                .getWorkInfosForUniqueWork(SessionSender.UNIQUE_WORK).get().size());
    }

    @Test
    public void skippingTheRestInTheAppTakesTheClockAway() throws Exception {
        // Fuera de la app ya no hay botón de saltar; en la app sí, y la
        // notificación lo sigue para que no haya dos relojes distintos.
        SessionController.publish(context, bench(NOW + 83_000), NOW);

        SessionController.skipRest(context, NOW + 5_000);

        assertFalse(visible(collapsed(), R.id.widget_clock));
        assertFalse(visible(expanded(), R.id.widget_clock));
        assertEquals(0, store.control().getLong("restEndsAt"));
    }

    @Test
    public void theEndOfTheRestIsAnAlarmNotATimer() throws Exception {
        SessionController.publish(context, bench(NOW + 83_000), NOW);

        // Una alarma que despierta en reposo, sin exigir alarma exacta.
        List<ShadowAlarmManager.ScheduledAlarm> scheduled = alarms.getScheduledAlarms();
        assertTrue(scheduled.stream().anyMatch(a -> a.getTriggerAtMs() == NOW + 83_000 && a.isAllowWhileIdle()));
        // Una alarma exacta tiene ventana 0; la inexacta deja a Android elegir.
        assertTrue(scheduled.stream().allMatch(a -> a.getWindowLengthMs() != 0));
    }

    @Test
    public void theRestOverAlarmTurnsTheCountdownIntoOvertime() throws Exception {
        SessionController.publish(context, bench(NOW + 1_000), NOW);

        tap(SessionController.ACTION_REST_OVER);

        // La alarma repinta: el reloj que bajaba se va y aparece el que sube.
        assertFalse(visible(collapsed(), R.id.widget_clock));
        assertTrue(visible(collapsed(), R.id.widget_over));
    }

    @Test
    public void theEndOfTheRestVibratesWithoutAnotherNotification() throws Exception {
        SessionController.publish(context, bench(NOW + 1_000), NOW);
        assertFalse(vibrator().isVibrating());

        tap(SessionController.ACTION_REST_OVER);

        // Vibra el teléfono y ya está: ni aviso aparte ni sonido. Lo único en
        // la bandeja sigue siendo la tarjeta, ahora con el tiempo en positivo.
        assertTrue(vibrator().isVibrating());
        assertEquals(1, shadowOf(notifications).getAllNotifications().size());
        assertTrue(visible(collapsed(), R.id.widget_over));
        // Como alarma: Android ignora la vibración de una app en segundo plano
        // si no es de alarma, aviso o llamada, y con el teléfono bloqueado lo está.
        assertEquals(VibrationAttributes.USAGE_ALARM,
                ((VibrationAttributes) vibrator().getVibrationAttributesFromLastVibration()).getUsage());
        // El canal con sonido de la 0.10.6 desaparece de Ajustes.
        assertNull(notifications.getNotificationChannel("fitit_fin_descanso"));
    }

    @Test
    public void aRestOverAlarmThatArrivesLateDoesNotVibrate() throws Exception {
        // Con el teléfono en reposo la alarma inexacta puede llegar tarde, y una
        // vibración a destiempo da la hora equivocada: mejor ninguna.
        SessionController.publish(context, bench(NOW + 1_000), NOW);

        SessionController.handle(context, new Intent(SessionController.ACTION_REST_OVER),
                NOW + 1_000 + SessionController.REST_LATE_MS + 1);

        assertFalse(vibrator().isVibrating());
        assertTrue(visible(collapsed(), R.id.widget_over));
    }

    @Test
    public void aSkippedRestDoesNotVibrate() throws Exception {
        SessionController.publish(context, bench(NOW + 83_000), NOW);
        SessionController.skipRest(context, NOW + 2_000);

        tap(SessionController.ACTION_REST_OVER);

        assertFalse(vibrator().isVibrating());
    }

    @Test
    public void twoHoursWithoutASetEndsIt() throws Exception {
        SessionController.publish(context, bench(0), NOW);
        assertTrue(alarms.getScheduledAlarms().stream()
                .anyMatch(a -> a.getTriggerAtMs() == NOW + SessionControl.IDLE_MS));

        SessionController.handle(context, new Intent(SessionController.ACTION_EXPIRE),
                NOW + SessionControl.IDLE_MS);

        assertNull(shown());
        assertNull(store.control());
    }

    @Test
    public void anEarlyExpiryAlarmDoesNotEndASessionStillGoing() throws Exception {
        SessionController.publish(context, bench(0), NOW);

        SessionController.handle(context, new Intent(SessionController.ACTION_EXPIRE), NOW + 60_000);

        assertNotNull(shown());
        assertNotNull(store.control());
    }

    @Test
    public void endingTakesTheCardAwayAndLeavesTheSets() throws Exception {
        SessionController.publish(context, bench(NOW + 83_000), NOW);
        tap(SessionController.ACTION_REPEAT);

        SessionController.end(context);

        assertNull(shown());
        assertNull(store.control());
        assertEquals(1, store.queue().size());
        assertTrue(alarms.getScheduledAlarms().isEmpty());
    }

    @Test
    public void deletingTheWorkoutInProgressTakesTheCardAndItsSetsAway() throws Exception {
        // Borrado en la app: la notificación y los widgets no pueden seguir
        // ofreciendo un +1 a un entreno que ya no existe.
        SessionController.publish(context, bench(NOW + 83_000), NOW);
        tap(SessionController.ACTION_REPEAT);

        SessionController.forget(context, 1);

        assertNull(shown());
        assertNull(store.control());
        assertTrue(store.queue().isEmpty());
        assertTrue(alarms.getScheduledAlarms().isEmpty());
    }

    @Test
    public void deletingAnotherWorkoutLeavesTheCardAlone() throws Exception {
        SessionController.publish(context, bench(NOW + 83_000), NOW);
        tap(SessionController.ACTION_REPEAT);

        SessionController.forget(context, 2);

        assertNotNull(shown());
        assertNotNull(store.control());
        assertEquals(1, store.queue().size());
    }

    @Test
    public void aTapWithNoSessionClearsAStaleCard() throws Exception {
        SessionController.publish(context, bench(NOW + 83_000), NOW);
        store.clearControl();

        tap(SessionController.ACTION_REPEAT);

        assertTrue(store.queue().isEmpty());
        assertNull(shown());
    }
}
