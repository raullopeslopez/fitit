package io.github.raullopeslopez.fitit.session;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.Manifest;
import android.app.Application;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.graphics.Paint;
import android.graphics.Rect;
import android.view.View;
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
import org.robolectric.annotation.GraphicsMode;
import org.robolectric.shadows.ShadowAppWidgetManager;

// Cómo se ve: el layout inflado de verdad, medido al tamaño del Xiaomi del
// usuario. Las medidas son las de DESIGN.md, «Fuera de la app»; con
// FITIT_RENDER_DIR, además, un PNG por estado para compararlo con las vistas
// previas aprobadas.
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, qualifiers = "xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class SessionWidgetLookTest {
    // El fondo de pantalla de las vistas previas, para que el PNG se compare igual.
    private static final int WALL_LIGHT = 0xFFD9D4CA;
    private static final int WALL_DARK = 0xFF1D2024;

    private Context context;
    private SessionStore store;
    private ShadowAppWidgetManager widgets;

    @Before
    public void setUp() throws Exception {
        context = ApplicationProvider.getApplicationContext();
        shadowOf((Application) context).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        WorkManagerTestInitHelper.initializeTestWorkManager(context);
        store = new SessionStore(context, new SessionStoreTest.FakeCipher());
        Session.useForTests(store, new QueueDrainerTest.FakeHttp());
        widgets = shadowOf(AppWidgetManager.getInstance(context));
    }

    @After
    public void tearDown() {
        Session.useForTests(null, null);
    }

    private JSONObject bench(long restEndsAt) throws Exception {
        long now = System.currentTimeMillis();
        return new JSONObject()
                .put("workoutId", 7)
                .put("exercise", "Press banca")
                .put("template", new JSONObject()
                        .put("exercise_name", "Press banca")
                        .put("reps", 12)
                        .put("weight", 32.5))
                .put("count", 4)
                .put("restSeconds", 90)
                .put("restEndsAt", restEndsAt)
                .put("lastSetAt", now);
    }

    private View large(JSONObject control, float width) {
        int id = widgets.createWidget(SessionWidget4x2.class, R.layout.widget_session_4x2);
        SessionController.publish(context, control, System.currentTimeMillis());
        return WidgetRender.lay(context, widgets.getViewFor(id), width, 200);
    }

    private Rect at(View root, int id) {
        return WidgetRender.bounds(root, root.findViewById(id));
    }

    private float dp(int px) {
        return WidgetRender.dp(context, px);
    }

    private static void near(String what, float expected, float actual) {
        assertEquals(what, expected, actual, 1f);
    }

    /**
     * Lo que ocupa la cifra del tiempo: su caja sin el aire de la fuente, un alto
     * igual al tamaño del texto y centrado, como `line-height` = tamaño en las
     * vistas previas. Los 11 dp de DESIGN.md se miden desde aquí.
     */
    private Rect digits(View root, int id) {
        TextView text = root.findViewById(id);
        Rect rect = at(root, id);
        int air = Math.round((text.getHeight() - text.getTextSize()) / 2f);
        rect.inset(0, air);
        return rect;
    }

    /**
     * La caja del tiempo cabe entera la línea de la fuente. Con la caja del
     * tamaño del texto (30 dp para 30sp), Geist Mono, que mide 1,3 em, se
     * alineaba arriba y perdía el pie redondo del 0 y del 3.
     */
    private static void uncut(View root, int id) {
        TextView text = root.findViewById(id);
        Paint.FontMetricsInt font = text.getPaint().getFontMetricsInt();
        assertTrue("el tiempo corta el pie de las cifras: " + text.getHeight() + " < "
                + (font.descent - font.ascent), text.getHeight() >= font.descent - font.ascent);
    }

    @Test
    public void restingTheTimeSitsElevenDpFromTheLineAndFromTheBlock() throws Exception {
        View root = large(bench(System.currentTimeMillis() + 83_000), 358);

        Rect line = at(root, R.id.widget_line);
        Rect clock = digits(root, R.id.widget_clock);
        Rect block = at(root, R.id.widget_block);
        uncut(root, R.id.widget_clock);
        // Centrado en su hueco (DESIGN.md): antes quedaba a 2 dp del nombre y a 20
        // del bloque y parecía pegado.
        near("línea → tiempo", 11, dp(clock.top - line.bottom));
        near("tiempo → bloque", 11, dp(block.top - clock.bottom));
        // Alineado a la izquierda, con el nombre.
        assertEquals(line.left, clock.left);
        WidgetRender.save(root, WALL_LIGHT, "4x2-descansando-claro");
    }

    @Test
    public void theAdjustBlockIsOnePieceWithThePlusOneAsItsEnd() throws Exception {
        View root = large(bench(0), 358);

        Rect block = at(root, R.id.widget_block);
        Rect weight = at(root, R.id.widget_weight_box);
        Rect reps = at(root, R.id.widget_reps_box);
        Rect log = at(root, R.id.widget_log);
        near("fila de kg", 48, dp(weight.height()));
        near("fila de reps", 48, dp(reps.height()));
        // Dos filas de 48, el filete de 1 y el marco de 1 arriba y abajo: 99.
        near("alto del bloque", 99, dp(block.height()));
        near("ancho del +1", 60, dp(log.width()));
        near("el +1 cierra el bloque por la derecha, dentro del marco de 1 dp",
                1, dp(block.right - log.right));
        near("el +1 ocupa todo el alto", 97, dp(log.height()));
        // Los − y + tocan en 44 dp.
        for (int id : new int[] {R.id.widget_weight_down, R.id.widget_weight_up,
                R.id.widget_reps_down, R.id.widget_reps_up}) {
            near("zona de toque", 44, dp(at(root, id).width()));
        }
        // Y todo cabe en los 200 dp con su margen de 14.
        assertTrue("el bloque se sale por abajo", dp(block.bottom) <= 200 - 14 + 0.5f);
        WidgetRender.save(root, WALL_LIGHT, "4x2-entrenando-claro");
    }

    @Test
    public void overtimeTakesTheSameSlotAsTheCountdown() throws Exception {
        View root = large(bench(System.currentTimeMillis() - 12_500), 358);

        Rect line = at(root, R.id.widget_line);
        Rect over = digits(root, R.id.widget_over);
        uncut(root, R.id.widget_over);
        near("línea → tiempo de más", 11, dp(over.top - line.bottom));
        near("tiempo de más → bloque", 11, dp(at(root, R.id.widget_block).top - over.bottom));
        WidgetRender.save(root, WALL_LIGHT, "4x2-pasado-claro");
    }

    @Test
    @Config(qualifiers = "+night")
    public void overtimeInTheDark() throws Exception {
        View root = large(bench(System.currentTimeMillis() - 167_500), 358);

        assertEquals(0xFFFF6A2C, ((TextView) root.findViewById(R.id.widget_over)).getCurrentTextColor());
        WidgetRender.save(root, WALL_DARK, "4x2-pasado-oscuro");
    }

    @Test
    public void theFourByOneShowsTheTimeBeforeTheName() throws Exception {
        int id = widgets.createWidget(SessionWidget.class, R.layout.widget_session_4x1);
        long now = System.currentTimeMillis();
        SessionController.publish(context, bench(now + 83_000), now);
        View resting = WidgetRender.lay(context, widgets.getViewFor(id), 358, 90);
        assertTrue(at(resting, R.id.widget_clock).right <= at(resting, R.id.widget_exercise).left);
        WidgetRender.save(resting, WALL_LIGHT, "4x1-descansando-claro");

        SessionController.publish(context, bench(now - 12_500), now);
        View over = WidgetRender.lay(context, widgets.getViewFor(id), 358, 90);
        assertTrue(at(over, R.id.widget_over).right <= at(over, R.id.widget_exercise).left);
        WidgetRender.save(over, WALL_LIGHT, "4x1-pasado-claro");
    }

    // --- La notificación (N4) ---------------------------------------------------
    // Sin fondo propio: el marco y el fondo los pone Android. Se pinta sobre el
    // color de tarjeta de las vistas previas, al ancho de contenido de una
    // notificación en el Xiaomi (360 dp menos los márgenes del sistema).

    private android.app.Notification notification(JSONObject control) {
        SessionController.publish(context, control, System.currentTimeMillis());
        android.app.NotificationManager manager =
                context.getSystemService(android.app.NotificationManager.class);
        android.app.Notification[] active = shadowOf(manager).getAllNotifications()
                .toArray(new android.app.Notification[0]);
        return active[active.length - 1];
    }

    private View card(android.widget.RemoteViews views) {
        android.widget.FrameLayout frame = new android.widget.FrameLayout(context);
        int pad = WidgetRender.px(context, 16);
        frame.setPadding(pad, pad / 2, pad, pad / 2);
        frame.addView(views.apply(context, frame));
        return WidgetRender.layFree(context, frame, 360);
    }

    @Test
    public void theNotificationCollapsedFitsTheSystemRowAndExpandedCarriesTheBlock() throws Exception {
        android.app.Notification n = notification(bench(System.currentTimeMillis() + 83_000));

        View small = card(n.contentView);
        uncut(small, R.id.widget_clock);
        // Android da unos 48 dp al contenido de una notificación cerrada con diseño propio.
        assertTrue("alto cerrada: " + dp(small.getHeight()), dp(small.getHeight()) <= 48 + 16);
        WidgetRender.save(small, 0xFFFFFFFF, "notificacion-cerrada-claro");

        View big = card(n.bigContentView);
        uncut(big, R.id.widget_clock);
        near("bloque de la notificación", 99, dp(at(big, R.id.widget_block).height()));
        // Y el desplegado cabe en los 256 dp que da Android.
        assertTrue("alto desplegada: " + dp(big.getHeight()), dp(big.getHeight()) <= 256);
        WidgetRender.save(big, 0xFFFFFFFF, "notificacion-desplegada-claro");
    }

    @Test
    @Config(qualifiers = "+night")
    public void theNotificationPastTheRestInTheDark() throws Exception {
        android.app.Notification n = notification(bench(System.currentTimeMillis() - 12_500));

        WidgetRender.save(card(n.contentView), 0xFF15171A, "notificacion-cerrada-pasado-oscuro");
        View big = card(n.bigContentView);
        assertEquals(0xFFFF6A2C, ((TextView) big.findViewById(R.id.widget_over)).getCurrentTextColor());
        WidgetRender.save(big, 0xFF15171A, "notificacion-desplegada-pasado-oscuro");
    }

    @Test
    @Config(qualifiers = "+night")
    public void inTheDarkItTakesTheDarkColours() throws Exception {
        View root = large(bench(System.currentTimeMillis() + 83_000), 358);

        assertEquals(0xFFF2F3F5, ((TextView) root.findViewById(R.id.widget_exercise)).getCurrentTextColor());
        assertEquals(0xFF9BA1A9, ((TextView) root.findViewById(R.id.widget_count)).getCurrentTextColor());
        WidgetRender.save(root, WALL_DARK, "4x2-descansando-oscuro");
    }

    @Test
    public void sessionExpiredFitsWithItsOutlinedButton() throws Exception {
        store.markExpired();
        View root = large(bench(0), 358);

        Rect button = at(root, R.id.widget_reopen);
        near("alto de Abrir Fitit", 44, dp(button.height()));
        assertTrue("se sale por abajo", dp(button.bottom) <= 200 - 14 + 0.5f);
        // Las dos líneas del texto caben sin cortarse.
        assertEquals(2, ((TextView) root.findViewById(R.id.widget_expired_body)).getLineCount());
        WidgetRender.save(root, WALL_LIGHT, "4x2-caducada-claro");

        int id = widgets.createWidget(SessionWidget.class, R.layout.widget_session_4x1);
        SessionWidget.updateAll(context);
        View small = WidgetRender.lay(context, widgets.getViewFor(id), 358, 90);
        near("alto de Abrir", 44, dp(at(small, R.id.widget_reopen).height()));
        WidgetRender.save(small, WALL_LIGHT, "4x1-caducada-claro");
    }

    @Test
    @Config(qualifiers = "+night")
    public void sessionExpiredInTheDark() throws Exception {
        store.markExpired();
        WidgetRender.save(large(bench(0), 358), WALL_DARK, "4x2-caducada-oscuro");
    }

    // --- Sin entreno: dos pantallas (vista previa v16) --------------------------

    private View idle(float width) throws Exception {
        int id = widgets.createWidget(SessionWidget4x2.class, R.layout.widget_session_4x2);
        SessionWidget.updateAll(context);
        return WidgetRender.lay(context, widgets.getViewFor(id), width, 200);
    }

    private void idleSummary(boolean goal) throws Exception {
        String today = java.time.LocalDate.now().toString();
        String twoDaysAgo = java.time.LocalDate.now().minusDays(2).toString();
        store.mergeSummary(new JSONObject()
                .put("lastWorkout", new JSONObject().put("date", twoDaysAgo)
                        .put("groups", new org.json.JSONArray().put("Pierna")))
                .put("steps", new JSONObject().put("date", today).put("today", 8432).put("weekAverage", 7910))
                .put("stepsGoal", goal ? (Object) 10000 : JSONObject.NULL));
    }

    @Test
    public void idleTwoPagesWithTheDotsAtTheBottom() throws Exception {
        idleSummary(true);
        View first = idle(358);
        Rect dots = at(first, R.id.widget_dots);
        near("toque de los puntitos", 44, dp(dots.height()));
        // Se meten 12 dp en el margen de abajo: los puntitos, a 24 del borde, como
        // en la vista previa (fila de 20 px pegada al padding de 14).
        near("puntitos al borde", 24, 200 - dp(dots.centerY()));
        near("botón a lo ancho", 358 - 32, dp(at(first, R.id.widget_start).width()));
        WidgetRender.save(first, WALL_LIGHT, "4x2-sin-entreno-1-claro");

        store.flipIdlePage();
        View second = idle(358);
        Rect bar = at(second, R.id.widget_steps_bar);
        near("barra", 8, dp(bar.height()));
        uncut(second, R.id.widget_steps);
        // Nada se monta: la cifra termina antes de la barra, y la barra antes de la media.
        assertTrue(digits(second, R.id.widget_steps).bottom <= bar.top);
        assertTrue(bar.bottom <= at(second, R.id.widget_steps_week_line).top);
        assertTrue(at(second, R.id.widget_steps_week_line).bottom <= dots.top + WidgetRender.px(context, 12));
        WidgetRender.save(second, WALL_LIGHT, "4x2-sin-entreno-2-claro");
    }

    @Test
    @Config(qualifiers = "+night")
    public void idleStepsInTheDarkAndWithNoGoal() throws Exception {
        idleSummary(true);
        store.flipIdlePage();
        WidgetRender.save(idle(358), WALL_DARK, "4x2-sin-entreno-2-oscuro");
        store.flipIdlePage();
        WidgetRender.save(idle(358), WALL_DARK, "4x2-sin-entreno-1-oscuro");

        idleSummary(false);
        store.flipIdlePage();
        WidgetRender.save(idle(358), WALL_DARK, "4x2-sin-entreno-2-sin-objetivo-oscuro");
    }

    @Test
    public void aBodyweightExerciseKeepsOnlyTheRepsRow() throws Exception {
        JSONObject pullUps = bench(0).put("exercise", "Dominadas");
        pullUps.getJSONObject("template").put("weight", JSONObject.NULL);
        View root = large(pullUps, 358);

        near("sólo la fila de reps y el marco", 50, dp(at(root, R.id.widget_block).height()));
        WidgetRender.save(root, WALL_LIGHT, "4x2-sin-peso-claro");
    }

    @Test
    public void terminarIsARingInTheTopRightWithAFortyFourDpTouch() throws Exception {
        View root = large(bench(System.currentTimeMillis() + 83_000), 358);

        Rect end = at(root, R.id.widget_end);
        near("toque", 44, dp(end.width()));
        near("toque", 44, dp(end.height()));
        Rect block = at(root, R.id.widget_block);
        assertTrue("arriba", end.bottom <= at(root, R.id.widget_block).top);
        // A la derecha: su borde exterior casi en el del bloque (el aro de 34
        // queda dentro de los 44 de toque).
        assertTrue("a la derecha", end.right >= block.right - WidgetRender.px(context, 2));
    }

    @Test
    public void theFourByOneTouchIsFortyFourDp() throws Exception {
        int id = widgets.createWidget(SessionWidget.class, R.layout.widget_session_4x1);
        SessionController.publish(context, bench(0), System.currentTimeMillis());
        View root = WidgetRender.lay(context, widgets.getViewFor(id), 358, 90);

        Rect plusOne = at(root, R.id.widget_repeat);
        assertTrue("alto del +1: " + dp(plusOne.height()), dp(plusOne.height()) >= 44 - 0.5f);
        WidgetRender.save(root, WALL_LIGHT, "4x1-entrenando-claro");
    }
}
