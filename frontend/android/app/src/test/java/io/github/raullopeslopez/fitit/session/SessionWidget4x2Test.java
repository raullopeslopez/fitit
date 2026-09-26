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
import io.github.raullopeslopez.fitit.R;
import java.util.List;
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
        SessionController.handle(context, sent.get(sent.size() - 1), at);
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
        assertEquals("4 series", text(R.id.widget_count));
        assertFalse(shown(R.id.widget_unsent));
        assertEquals("32,5 kg", text(R.id.widget_weight));
        assertEquals("12", text(R.id.widget_reps));
        assertEquals("Registrar serie", text(R.id.widget_log));
        assertEquals("Terminar", text(R.id.widget_end));
        assertTrue(shown(R.id.widget_clock));
        assertTrue(shown(R.id.widget_skip));
        assertEquals("Saltar descanso", view().findViewById(R.id.widget_skip).getContentDescription());
    }

    @Test
    public void raisingTheWeightTwiceAndLoggingLogsFiveKilosMore() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now - 1), now);

        tap(R.id.widget_weight_up, now + 1_000);
        tap(R.id.widget_weight_up, now + 2_000);

        // Ajustar no registra: sólo cambia la serie que está a la vista.
        assertTrue(store.queue().isEmpty());
        assertEquals("37,5 kg", text(R.id.widget_weight));
        assertEquals("4 series", text(R.id.widget_count));

        tap(R.id.widget_log, now + 3_000);

        assertEquals(1, store.queue().size());
        assertEquals(37.5, store.queue().get(0).getJSONObject("payload").getDouble("weight"), 0);
        assertEquals("5 series", text(R.id.widget_count));
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

        assertEquals("30 kg", text(R.id.widget_weight));
        assertEquals("11", text(R.id.widget_reps));
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
    public void skipIsThereOnlyWhileResting() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now + 60_000), now);

        tap(R.id.widget_skip, now + 1_000);

        assertEquals(0, store.control().getLong("restEndsAt"));
        assertFalse(shown(R.id.widget_clock));
        assertFalse(shown(R.id.widget_skip));
    }

    @Test
    public void whenTheRestIsOverItSaysSo() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now - 1), now);

        assertTrue(shown(R.id.widget_rest_over));
        assertFalse(shown(R.id.widget_clock));
        assertFalse(shown(R.id.widget_skip));
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

    @Test
    public void withNoSessionItOffersToStartOne() {
        SessionWidget.updateAll(context);

        assertTrue(shown(R.id.widget_idle));
        assertEquals("Sin entreno en curso", text(R.id.widget_idle_title));
        view().findViewById(R.id.widget_start).performClick();

        Intent started = shadowOf((Application) context).getNextStartedActivity();
        assertNotNull(started);
        assertEquals(SessionLaunch.START, started.getStringExtra(SessionLaunch.EXTRA_ACTION));
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

    // --- Otro ejercicio -------------------------------------------------------
    // Sólo crea: abre la app con el campo de añadir ejercicio. Cambiar a uno que
    // ya está en el entreno se hace desde la notificación («remo») o la app.

    @Test
    public void otroEjercicioSitsBesideTerminar() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now - 1), now);

        assertTrue(shown(R.id.widget_other));
        assertEquals("Otro ejercicio", text(R.id.widget_other));
    }

    @Test
    public void otroEjercicioOpensTheAppToAddAnExercise() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now + 60_000), now);

        view().findViewById(R.id.widget_other).performClick();

        Intent started = shadowOf((Application) context).getNextStartedActivity();
        assertNotNull(started);
        assertEquals(SessionLaunch.ADD, started.getStringExtra(SessionLaunch.EXTRA_ACTION));
        assertEquals(7, started.getIntExtra(SessionLaunch.EXTRA_WORKOUT, -1));
        // No registra nada y el widget sigue enseñando la serie.
        assertTrue(store.queue().isEmpty());
        assertTrue(shown(R.id.widget_session));
        assertEquals("Press banca", text(R.id.widget_exercise));
    }
}
