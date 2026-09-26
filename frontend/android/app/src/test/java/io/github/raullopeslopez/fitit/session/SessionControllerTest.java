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
import android.os.Bundle;
import androidx.core.app.RemoteInput;
import androidx.test.core.app.ApplicationProvider;
import androidx.work.testing.WorkManagerTestInitHelper;
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

// La notificación en curso y sus tres botones, de punta a punta sin teléfono:
// lo que Entreno publica, lo que enseña Android y lo que hace cada toque.
// Spec: docs/widgets-entreno.md, «1 · Notificación en curso» y «Comportamiento».
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

    private Notification shown() {
        Notification[] active = shadowOf(notifications).getAllNotifications().toArray(new Notification[0]);
        return active.length == 0 ? null : active[active.length - 1];
    }

    private static List<String> actions(Notification n) {
        List<String> titles = new ArrayList<>();
        if (n.actions != null) for (Notification.Action a : n.actions) titles.add(a.title.toString());
        return titles;
    }

    private void tap(String action) {
        SessionController.handle(context, new Intent(action), NOW + 5_000);
    }

    private void reply(String typed) {
        Intent intent = new Intent(SessionController.ACTION_OTHER);
        Bundle results = new Bundle();
        results.putCharSequence(SessionController.KEY_OTHER, typed);
        RemoteInput.addResultsToIntent(
                new RemoteInput[] {new RemoteInput.Builder(SessionController.KEY_OTHER).build()},
                intent,
                results);
        SessionController.handle(context, intent, NOW + 5_000);
    }

    // --- Lo que se ve ---------------------------------------------------------

    @Test
    public void entrenoPublishesAndTheCardAppears() throws Exception {
        SessionController.publish(context, bench(NOW + 83_000), NOW);

        Notification n = shown();
        assertNotNull(n);
        assertEquals("Press banca · Pecho", n.extras.getString(Notification.EXTRA_TITLE));
        assertEquals("32,5 kg × 12 · 4 series", n.extras.getCharSequence(Notification.EXTRA_TEXT).toString());
        assertEquals(List.of("+1 serie", "Otra serie", "Saltar"), actions(n));
        // En curso: deslizar no la quita.
        assertTrue((n.flags & Notification.FLAG_ONGOING_EVENT) != 0);
        assertEquals(Notification.VISIBILITY_PUBLIC, n.visibility);
    }

    @Test
    public void theCountdownIsTheNotificationsOwnClock() throws Exception {
        SessionController.publish(context, bench(NOW + 83_000), NOW);

        Notification n = shown();
        assertTrue(n.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER));
        assertTrue(n.extras.getBoolean(Notification.EXTRA_CHRONOMETER_COUNT_DOWN));
        assertEquals(NOW + 83_000, n.when);
    }

    @Test
    public void whenTheRestIsOverItSaysSoAndSkipGoes() throws Exception {
        SessionController.publish(context, bench(NOW - 1), NOW);

        Notification n = shown();
        assertEquals("Descanso terminado", n.extras.getCharSequence(Notification.EXTRA_SUB_TEXT).toString());
        assertFalse(n.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER));
        assertEquals(List.of("+1 serie", "Otra serie"), actions(n));
    }

    @Test
    public void withRestOffThereIsNoClockAndNoSkip() throws Exception {
        SessionController.publish(context, bench(0).put("restSeconds", 0), NOW);

        Notification n = shown();
        assertNull(n.extras.getCharSequence(Notification.EXTRA_SUB_TEXT));
        assertFalse(n.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER));
        assertEquals(List.of("+1 serie", "Otra serie"), actions(n));
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
        assertEquals(NOW + 5_000 + 90_000, n.when);
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
    public void anotherSetLogsWhatWasTypedAndRepeatsItNext() throws Exception {
        SessionController.publish(context, bench(NOW - 1), NOW);

        reply("35x10");
        tap(SessionController.ACTION_REPEAT);

        assertEquals(2, store.queue().size());
        JSONObject second = store.queue().get(1).getJSONObject("payload");
        assertEquals(35, second.getDouble("weight"), 0);
        assertEquals(10, second.getInt("reps"));
    }

    @Test
    public void anotherSetWithACommaIsUnderstood() throws Exception {
        SessionController.publish(context, bench(NOW - 1), NOW);

        reply("32,5x8");

        assertEquals(8, store.head().getJSONObject("payload").getInt("reps"));
    }

    @Test
    public void anEntryItCannotReadLogsNothingAndSaysWhy() throws Exception {
        SessionController.publish(context, bench(NOW - 1), NOW);

        reply("12 32");

        assertTrue(store.queue().isEmpty());
        assertEquals(
                "No entendí «12 32». Escríbela como 32,5x12.",
                shown().extras.getCharSequence(Notification.EXTRA_TEXT).toString());
    }

    @Test
    public void skipTakesTheClockAway() throws Exception {
        SessionController.publish(context, bench(NOW + 83_000), NOW);

        tap(SessionController.ACTION_SKIP);

        Notification n = shown();
        assertFalse(n.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER));
        assertEquals(List.of("+1 serie", "Otra serie"), actions(n));
        assertEquals(0, store.control().getLong("restEndsAt"));
        assertTrue(heard.contains("changed"));
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
    public void theRestOverAlarmRelabelsTheCard() throws Exception {
        SessionController.publish(context, bench(NOW + 1_000), NOW);

        tap(SessionController.ACTION_REST_OVER);

        assertEquals("Descanso terminado",
                shown().extras.getCharSequence(Notification.EXTRA_SUB_TEXT).toString());
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
    public void aTapWithNoSessionClearsAStaleCard() throws Exception {
        SessionController.publish(context, bench(NOW + 83_000), NOW);
        store.clearControl();

        tap(SessionController.ACTION_REPEAT);

        assertTrue(store.queue().isEmpty());
        assertNull(shown());
    }
}
