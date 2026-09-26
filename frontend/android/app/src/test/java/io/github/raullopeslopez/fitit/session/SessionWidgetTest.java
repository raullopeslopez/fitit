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
        assertEquals(" · Pecho", text(R.id.widget_group));
        assertEquals("32,5 kg × 12", text(R.id.widget_set));
        assertEquals(" · 4 series", text(R.id.widget_count));
        assertEquals("+1 serie", text(R.id.widget_repeat));
        // El reloj lo lleva el propio widget: cuenta atrás hasta el fin del descanso.
        Chronometer clock = view().findViewById(R.id.widget_clock);
        assertTrue(shown(R.id.widget_clock));
        assertTrue(clock.isCountDown());
        long remaining = clock.getBase() - SystemClock.elapsedRealtime();
        assertTrue("remaining " + remaining, remaining > 80_000 && remaining <= 83_000);
    }

    @Test
    public void whenTheRestIsOverItSaysSo() throws Exception {
        long now = now();
        SessionController.publish(context, bench(now - 1), now);

        assertFalse(shown(R.id.widget_clock));
        assertTrue(shown(R.id.widget_rest_over));
        assertEquals("Descanso terminado", text(R.id.widget_rest_over));
    }

    @Test
    public void withRestOffThereIsNoClock() throws Exception {
        long now = now();
        SessionController.publish(context, bench(0).put("restSeconds", 0), now);

        assertFalse(shown(R.id.widget_clock));
        assertFalse(shown(R.id.widget_rest_over));
    }

    @Test
    public void withoutAGroupThereIsNoDot() throws Exception {
        long now = now();
        SessionController.publish(context, bench(0).put("group", JSONObject.NULL), now);

        assertEquals("", text(R.id.widget_group));
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
        assertEquals(" · 5 series", text(R.id.widget_count));
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
}
