package io.github.raullopeslopez.fitit.session;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.Manifest;
import android.app.Application;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.graphics.Paint;
import android.graphics.Rect;
import android.os.Bundle;
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

    /** El 4×2 de 358 × 200 dp, como lo da el launcher. */
    private View large(JSONObject control) {
        return placed(SessionWidget4x2.class, control, 358, 200);
    }

    /** El 3×2 del Xiaomi del usuario: ≈253 × 176 dp, medido en su captura del 2026-09-27. */
    private View xiaomi(JSONObject control) {
        return placed(SessionWidget3x2.class, control, 253, 176);
    }

    /**
     * El widget al tamaño que le da el launcher, que se lo dice en sus opciones
     * (en vertical, ancho mínimo × alto máximo). Sin control, sin entreno.
     */
    private View placed(Class<? extends SessionWidget4x2> type, JSONObject control, float width, float height) {
        int id = widgets.createWidget(type, R.layout.widget_session_4x2);
        Bundle options = new Bundle();
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, Math.round(width));
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, Math.round(height));
        AppWidgetManager.getInstance(context).updateAppWidgetOptions(id, options);
        if (control != null) SessionController.publish(context, control, System.currentTimeMillis());
        else SessionWidget.updateAll(context);
        return WidgetRender.lay(context, widgets.getViewFor(id), width, height);
    }

    private View placed(JSONObject control, float width, float height) {
        return placed(SessionWidget3x2.class, control, width, height);
    }

    private View fourByOne(JSONObject control) {
        int id = widgets.createWidget(SessionWidget.class, R.layout.widget_session_4x1);
        if (control != null) SessionController.publish(context, control, System.currentTimeMillis());
        else SessionWidget.updateAll(context);
        return WidgetRender.lay(context, widgets.getViewFor(id), 358, 84);
    }

    private static boolean shown(View root, int id) {
        View v = root.findViewById(id);
        return v != null && v.getVisibility() == View.VISIBLE;
    }

    private static boolean cut(View root, int id) {
        TextView text = root.findViewById(id);
        return text.getLayout() != null && text.getLayout().getEllipsisCount(0) > 0;
    }

    private Rect at(View root, int id) {
        return WidgetRender.bounds(root, root.findViewById(id));
    }

    private float dp(int px) {
        return WidgetRender.dp(context, px);
    }

    private float sp(View root, int id) {
        return ((TextView) root.findViewById(id)).getTextSize()
                / context.getResources().getDisplayMetrics().scaledDensity;
    }

    private static void near(String what, float expected, float actual) {
        assertEquals(what, expected, actual, 1f);
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

    /** Un texto cabe si no hay «…» en ninguna de sus líneas. */
    private static void whole(View root, int id) {
        TextView text = root.findViewById(id);
        android.text.Layout layout = text.getLayout();
        for (int i = 0; i < layout.getLineCount(); i++) {
            assertEquals("«" + text.getText() + "» se corta", 0, layout.getEllipsisCount(i));
        }
    }

    /** Dónde acaba, en px, lo que se pinta de un glifo centrado en su zona (− o +). */
    private Rect glyph(View root, int id) {
        TextView zone = root.findViewById(id);
        Rect box = at(root, id);
        int half = Math.round(zone.getPaint().measureText(zone.getText().toString()) / 2f);
        return new Rect(box.centerX() - half, box.top, box.centerX() + half, box.bottom);
    }

    // --- 1 · El 4×1: «el descanso se vacía» ----------------------------------

    @Test
    public void theFourByOneLaysOutTimeNameSetAndPlusOne() throws Exception {
        // 30 de 90 s: queda un tercio de barra.
        View root = fourByOne(bench(System.currentTimeMillis() + 30_000));

        Rect bar = at(root, R.id.widget_rest_bar);
        // Todo el widget, de borde a borde: el fondo es la barra.
        near("alto de la barra", 84, dp(bar.height()));
        near("ancho de la barra", 358, dp(bar.width()));
        assertEquals(333, ((android.widget.ProgressBar) root.findViewById(R.id.widget_rest_bar)).getProgress(), 12);

        // Padding 0 12 0 18: el tiempo, a 18 del borde; el +1, a 12.
        Rect clock = at(root, R.id.widget_clock);
        near("margen izquierdo", 18, dp(clock.left));
        Rect plusOne = at(root, R.id.widget_repeat);
        near("margen derecho", 12, 358 - dp(plusOne.right));
        near("ancho del +1", 60, dp(plusOne.width()));
        near("alto del +1", 56, dp(plusOne.height()));
        near("+1 centrado", 42, dp(plusOne.centerY()));
        near("+1 en Mono 20sp", 20, sp(root, R.id.widget_repeat));

        // Línea 1: tiempo Mono 28sp, 10 dp, el nombre en Geist 15sp.
        near("tiempo a 28sp", 28, sp(root, R.id.widget_clock));
        near("10 dp al nombre", 10, dp(at(root, R.id.widget_exercise).left - clock.right));
        uncut(root, R.id.widget_clock);
        // Línea 2, 3 dp debajo: la serie en Mono 13sp y tinta, « · 4 series» en muted.
        Rect set = at(root, R.id.widget_set);
        near("3 dp entre líneas", 3, dp(set.top - Math.max(clock.bottom, at(root, R.id.widget_exercise).bottom)));
        near("serie a 13sp", 13, sp(root, R.id.widget_set));
        assertEquals(context.getColor(R.color.widget_text),
                ((TextView) root.findViewById(R.id.widget_set)).getCurrentTextColor());
        assertEquals("4", ((TextView) root.findViewById(R.id.widget_count_n)).getText().toString());
        assertEquals(context.getColor(R.color.widget_muted),
                ((TextView) root.findViewById(R.id.widget_count_n)).getCurrentTextColor());
        // El bloque de dos líneas, centrado en el alto.
        Rect line = at(root, R.id.widget_open);
        near("centrado", 42, dp(line.centerY()));
        WidgetRender.save(root, WALL_LIGHT, "4x1-descansando-claro");
    }

    @Test
    @Config(qualifiers = "+night")
    public void theFourByOneRestingInTheDark() throws Exception {
        WidgetRender.save(fourByOne(bench(System.currentTimeMillis() + 60_000)), WALL_DARK,
                "4x1-descansando-oscuro");
    }

    @Test
    public void theFourByOnePastTheRestHasNoBar() throws Exception {
        View over = fourByOne(bench(System.currentTimeMillis() - 12_500));

        assertFalse(shown(over, R.id.widget_rest_bar));
        assertTrue(at(over, R.id.widget_over).right <= at(over, R.id.widget_exercise).left);
        WidgetRender.save(over, WALL_LIGHT, "4x1-pasado-claro");

        View training = fourByOne(bench(0));
        assertFalse(shown(training, R.id.widget_rest_bar));
        assertTrue("alto del +1", dp(at(training, R.id.widget_repeat).height()) >= 44 - 0.5f);
        WidgetRender.save(training, WALL_LIGHT, "4x1-entrenando-claro");
    }

    // --- 2 · El 4×2 entrenando: «se lee como la serie» -----------------------

    @Test
    public void theFourByTwoIsNameThenTimeThenTheRow() throws Exception {
        View root = large(bench(System.currentTimeMillis() + 83_000));

        // Padding 14 16 16.
        Rect line = at(root, R.id.widget_line);
        near("arriba", 14, dp(line.top));
        near("izquierda", 16, dp(line.left));
        Rect row = at(root, R.id.widget_block);
        near("abajo", 16, 200 - dp(row.bottom));
        near("derecha", 16, 358 - dp(row.right));

        // a) El nombre en Geist 15sp y « · 4 series» en 13sp.
        near("nombre", 15, sp(root, R.id.widget_exercise));
        near("series", 13, sp(root, R.id.widget_count_n));

        // b) Entre la línea y la fila, centrado: el tiempo en Mono 40sp a la
        // izquierda, el aro de pausa y Terminar a la derecha.
        Rect clock = at(root, R.id.widget_clock);
        near("tiempo a 40sp", 40, sp(root, R.id.widget_clock));
        uncut(root, R.id.widget_clock);
        assertEquals(line.left, clock.left);
        near("centrado entre la línea y la fila", (line.bottom + row.top) / 2f, clock.centerY());
        Rect pause = at(root, R.id.widget_rest_toggle);
        Rect end = at(root, R.id.widget_end);
        near("toque de pausa", 44, dp(pause.width()));
        near("toque de Terminar", 44, dp(end.width()));
        near("4 dp entre los aros", 4, dp(end.left - pause.right));
        near("Terminar, −5 dp sobre el margen", 358 - 16 + 5, dp(end.right));
        near("los aros, a la altura del tiempo", clock.centerY(), pause.centerY());
        assertTrue("el tiempo no pisa la pausa", clock.right <= pause.left);
        WidgetRender.save(root, WALL_LIGHT, "4x2-descansando-claro");
    }

    @Test
    public void theAdjustRowReadsLikeTheSet() throws Exception {
        View root = large(bench(0));

        Rect row = at(root, R.id.widget_block);
        Rect weight = at(root, R.id.widget_weight_box);
        Rect reps = at(root, R.id.widget_reps_box);
        Rect log = at(root, R.id.widget_log);
        near("alto de la fila", 46, dp(row.height()));
        near("marco de kg, todo el alto", 46, dp(weight.height()));
        near("+1: 56 de ancho", 56, dp(log.width()));
        near("+1: todo el alto", 46, dp(log.height()));
        near("+1 en Mono 18sp", 18, sp(root, R.id.widget_log));
        near("6 dp entre marcos", 6, dp(reps.left - weight.right));
        near("6 dp hasta el +1", 6, dp(log.left - reps.right));
        near("los dos marcos, iguales", dp(weight.width()), dp(reps.width()));
        assertEquals(row.right, log.right);

        // − y + tocan en 44, en los extremos de su marco (dentro del borde de 1).
        for (int id : new int[] {R.id.widget_weight_down, R.id.widget_weight_up,
                R.id.widget_reps_down, R.id.widget_reps_up}) {
            near("zona de toque", 44, dp(at(root, id).width()));
            near("zona de toque", 44, dp(at(root, id).height()));
        }
        near("− al borde", 1, dp(at(root, R.id.widget_weight_down).left - weight.left));
        near("+ al borde", 1, dp(weight.right - at(root, R.id.widget_weight_up).right));

        // «32,5 kg» y «× 12», centrados, sin tocar sus glifos.
        Rect kilos = at(root, R.id.widget_weight_value);
        near("kg centrado", weight.centerX(), kilos.centerX());
        assertTrue("«32,5 kg» pisa el −", kilos.left - glyph(root, R.id.widget_weight_down).right
                >= WidgetRender.px(context, 4));
        assertTrue("«32,5 kg» pisa el +", glyph(root, R.id.widget_weight_up).left - kilos.right
                >= WidgetRender.px(context, 4));
        Rect times = at(root, R.id.widget_reps_value);
        near("reps centradas", reps.centerX(), times.centerX());
        near("valor a 16sp", 16, sp(root, R.id.widget_weight));
        near("reps a 16sp", 16, sp(root, R.id.widget_reps));
        // Sin descanso, el tiempo no está y Terminar sigue arriba a la derecha.
        assertFalse(shown(root, R.id.widget_clock));
        assertTrue(shown(root, R.id.widget_end));
        WidgetRender.save(root, WALL_LIGHT, "4x2-entrenando-claro");
    }

    @Test
    public void aHeavyWeightStillClearsItsGlyphs() throws Exception {
        JSONObject heavy = bench(0);
        heavy.getJSONObject("template").put("weight", 102.5);
        View root = large(heavy);

        Rect kilos = at(root, R.id.widget_weight_value);
        assertTrue("«102,5 kg» pisa el −", kilos.left > glyph(root, R.id.widget_weight_down).right);
        assertTrue("«102,5 kg» pisa el +", glyph(root, R.id.widget_weight_up).left > kilos.right);
        WidgetRender.save(root, WALL_LIGHT, "4x2-102kg-claro");
    }

    @Test
    public void aBodyweightExerciseKeepsOnlyTheRepsFrameAcross() throws Exception {
        JSONObject pullUps = bench(0).put("exercise", "Dominadas");
        pullUps.getJSONObject("template").put("weight", JSONObject.NULL);
        View root = large(pullUps);

        assertFalse(shown(root, R.id.widget_weight_box));
        Rect reps = at(root, R.id.widget_reps_box);
        near("de borde a borde, menos el +1", 358 - 32 - 56 - 6, dp(reps.width()));
        near("empieza en el margen", 16, dp(reps.left));
        WidgetRender.save(root, WALL_LIGHT, "4x2-sin-peso-claro");
    }

    @Test
    public void overtimeTakesTheSameSlotAsTheCountdown() throws Exception {
        View root = large(bench(System.currentTimeMillis() - 12_500));

        uncut(root, R.id.widget_over);
        near("tiempo de más a 40sp", 40, sp(root, R.id.widget_over));
        assertEquals(at(root, R.id.widget_line).left, at(root, R.id.widget_over).left);
        assertFalse("pasado no hay nada que pausar", shown(root, R.id.widget_rest_toggle));
        WidgetRender.save(root, WALL_LIGHT, "4x2-pasado-claro");
    }

    @Test
    @Config(qualifiers = "+night")
    public void theFourByTwoInTheDark() throws Exception {
        View root = large(bench(System.currentTimeMillis() + 83_000));
        assertEquals(0xFFF2F3F5, ((TextView) root.findViewById(R.id.widget_exercise)).getCurrentTextColor());
        assertEquals(0xFF9BA1A9, ((TextView) root.findViewById(R.id.widget_count_n)).getCurrentTextColor());
        WidgetRender.save(root, WALL_DARK, "4x2-descansando-oscuro");

        View over = large(bench(System.currentTimeMillis() - 167_500));
        assertEquals(0xFFFF6A2C, ((TextView) over.findViewById(R.id.widget_over)).getCurrentTextColor());
        WidgetRender.save(over, WALL_DARK, "4x2-pasado-oscuro");

        WidgetRender.save(large(bench(0)), WALL_DARK, "4x2-entrenando-oscuro");
    }

    @Test
    public void pausedTheTimeStaysStillInMuted() throws Exception {
        JSONObject paused = bench(System.currentTimeMillis() + 83_000)
                .put("restPausedMs", 61_000L);
        View root = large(paused);

        assertTrue(shown(root, R.id.widget_paused));
        assertFalse(shown(root, R.id.widget_clock));
        assertEquals(context.getColor(R.color.widget_muted),
                ((TextView) root.findViewById(R.id.widget_paused)).getCurrentTextColor());
        WidgetRender.save(root, WALL_LIGHT, "4x2-pausa-claro");
    }

    // --- 2 · El compacto: el 3×2 y cualquier widget de < 300 × < 190 dp ------

    @Test
    public void inTheUsersLauncherTheStackedBlockStays() throws Exception {
        View root = xiaomi(bench(System.currentTimeMillis() + 83_000));

        Rect block = at(root, R.id.widget_block);
        assertTrue("el bloque se sale por abajo: " + dp(block.bottom) + " > 176",
                block.bottom <= root.getHeight());
        near("fila de kg", 44, dp(at(root, R.id.widget_weight_box).height()));
        near("fila de reps", 44, dp(at(root, R.id.widget_reps_box).height()));
        near("+1 de 56", 56, dp(at(root, R.id.widget_log).width()));
        // Dos filas de 44 y el filete de 1; el marco de 1 queda fuera.
        near("+1, todo el alto del bloque", 89, dp(at(root, R.id.widget_log).height()));
        // El tiempo, en la línea del nombre, a 24sp.
        Rect clock = at(root, R.id.widget_clock);
        near("tiempo a 24sp", 24, sp(root, R.id.widget_clock));
        assertTrue(clock.left >= at(root, R.id.widget_exercise).right);
        assertTrue(clock.bottom <= block.top);
        uncut(root, R.id.widget_clock);
        // Estrecho y descansando: fuera el número de series, y el aro de pausa a
        // la izquierda de Terminar, entero (0.15.0).
        assertFalse(shown(root, R.id.widget_count));
        Rect pause = at(root, R.id.widget_rest_toggle);
        near("toque de pausa", 44, dp(pause.width()));
        assertTrue(clock.right <= pause.left);
        assertTrue(pause.right <= at(root, R.id.widget_end).left);
        WidgetRender.save(root, WALL_DARK, "3x2-compacto-descansando-oscuro");
    }

    @Test
    public void theStackedBlockHasTheNewLegends() throws Exception {
        JSONObject heavy = bench(0);
        heavy.getJSONObject("template").put("weight", 102.5);
        View root = xiaomi(heavy);

        assertEquals("102,5", ((TextView) root.findViewById(R.id.widget_weight)).getText().toString());
        Rect weight = at(root, R.id.widget_weight);
        assertTrue("la cifra pisa el −", at(root, R.id.widget_weight_down).right <= weight.left);
        assertTrue("la cifra pisa el +", weight.right <= at(root, R.id.widget_weight_up).left);
        // «×» delante de las reps, sin la palabra «reps».
        Rect reps = at(root, R.id.widget_reps);
        TextView sign = (TextView) ((android.view.ViewGroup) root.findViewById(R.id.widget_reps).getParent()).getChildAt(0);
        assertEquals("×", sign.getText().toString());
        assertTrue("«×» va delante", WidgetRender.bounds(root, sign).right <= reps.left);
        // Las leyendas, a la línea base de su cifra, no centradas.
        TextView kilos = root.findViewById(R.id.widget_weight);
        TextView kg = (TextView) ((android.view.ViewGroup) kilos.getParent()).getChildAt(1);
        near("«kg» a la línea base", dp(weight.top + kilos.getBaseline()),
                dp(WidgetRender.bounds(root, kg).top + kg.getBaseline()));
        TextView count = root.findViewById(R.id.widget_reps);
        near("«×» a la línea base", dp(reps.top + count.getBaseline()),
                dp(WidgetRender.bounds(root, sign).top + sign.getBaseline()));
        for (int id : new int[] {R.id.widget_weight_down, R.id.widget_weight_up,
                R.id.widget_reps_down, R.id.widget_reps_up}) {
            near("zona de toque", 44, dp(at(root, id).width()));
        }
        near("hueco entre + y +1", 6,
                dp(at(root, R.id.widget_log).left - at(root, R.id.widget_weight_up).right));
        WidgetRender.save(root, WALL_LIGHT, "3x2-compacto-102kg-claro");
    }

    @Test
    public void compactAndNotRestingKeepsTheSeriesCount() throws Exception {
        View root = xiaomi(bench(0));

        assertTrue(at(root, R.id.widget_block).bottom <= root.getHeight());
        assertTrue(shown(root, R.id.widget_count));
        assertFalse(shown(root, R.id.widget_clock));
        WidgetRender.save(root, WALL_DARK, "3x2-compacto-oscuro");
    }

    @Test
    public void lowButWideIsCompactAndKeepsTheSeriesCount() throws Exception {
        View root = placed(SessionWidget4x2.class, bench(System.currentTimeMillis() + 83_000), 358, 176);

        assertTrue(at(root, R.id.widget_block).bottom <= root.getHeight());
        near("bloque apilado", 44, dp(at(root, R.id.widget_weight_box).height()));
        assertTrue(shown(root, R.id.widget_count));
        assertFalse(cut(root, R.id.widget_exercise));
    }

    @Test
    public void narrowButTallIsCompactToo() throws Exception {
        // < 300 dp de ancho: la fila de dos marcos no cabe aunque sobre alto.
        View root = placed(bench(System.currentTimeMillis() + 83_000), 270, 200);

        near("bloque apilado", 44, dp(at(root, R.id.widget_weight_box).height()));
        near("tiempo en la línea", 24, sp(root, R.id.widget_clock));
        WidgetRender.save(root, WALL_LIGHT, "3x2-descansando-claro");
    }

    @Test
    @Config(qualifiers = "+night")
    public void theThreeByTwoPastTheRestInTheDark() throws Exception {
        WidgetRender.save(xiaomi(bench(System.currentTimeMillis() - 12_500)), WALL_DARK, "3x2-pasado-oscuro");
    }

    // --- 4 · La notificación ---------------------------------------------------
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
    public void theNotificationCollapsedFitsHyperOsRow() throws Exception {
        android.app.Notification n = notification(bench(System.currentTimeMillis() + 83_000));

        View small = card(n.contentView);
        uncut(small, R.id.widget_clock);
        near("tiempo a 30sp", 30, sp(small, R.id.widget_clock));
        // La serie en Mono y tinta; « · 4 series» en muted.
        assertEquals(context.getColor(R.color.widget_text),
                ((TextView) small.findViewById(R.id.widget_set)).getCurrentTextColor());
        assertEquals(context.getColor(R.color.widget_muted),
                ((TextView) small.findViewById(R.id.widget_count_word)).getCurrentTextColor());
        // A la derecha, el tiempo y detrás el aro de pausa.
        Rect clock = at(small, R.id.widget_clock);
        Rect pause = at(small, R.id.widget_rest_toggle);
        near("aro de 44", 44, dp(pause.width()));
        assertTrue("el aro va detrás del tiempo", clock.right <= pause.left);
        assertTrue("la serie no pisa el tiempo", at(small, R.id.widget_line).right <= clock.left);
        // HyperOS da ≈48 dp al contenido de una notificación cerrada con diseño
        // propio; con los 8 + 8 de este marco, 64.
        assertTrue("alto cerrada: " + dp(small.getHeight()), dp(small.getHeight()) <= 48 + 16);
        WidgetRender.save(small, 0xFFFFFFFF, "notificacion-cerrada-claro");

        View paused = card(notification(bench(System.currentTimeMillis() + 83_000)
                .put("restPausedMs", 61_000L)).contentView);
        assertTrue(shown(paused, R.id.widget_paused));
        WidgetRender.save(paused, 0xFFFFFFFF, "notificacion-cerrada-pausa-claro");
    }

    @Test
    public void theNotificationExpandedIsTheFourByTwoWithoutTerminar() throws Exception {
        android.app.Notification n = notification(bench(System.currentTimeMillis() + 83_000));

        View big = card(n.bigContentView);
        uncut(big, R.id.widget_clock);
        near("tiempo a 40sp", 40, sp(big, R.id.widget_clock));
        near("fila de ajuste", 46, dp(at(big, R.id.widget_block).height()));
        near("+1 de 56", 56, dp(at(big, R.id.widget_log).width()));
        assertNull("sin Terminar", big.findViewById(R.id.widget_end));
        assertTrue(shown(big, R.id.widget_rest_toggle));
        // Cabe en los 256 dp que da Android a la desplegada.
        assertTrue("alto desplegada: " + dp(big.getHeight()), dp(big.getHeight()) <= 256);
        WidgetRender.save(big, 0xFFFFFFFF, "notificacion-desplegada-claro");
    }

    @Test
    @Config(qualifiers = "+night")
    public void theNotificationPastTheRestInTheDark() throws Exception {
        android.app.Notification n = notification(bench(System.currentTimeMillis() - 12_500));

        View small = card(n.contentView);
        assertFalse("pasado de tiempo no hay aro", shown(small, R.id.widget_rest_toggle));
        WidgetRender.save(small, 0xFF15171A, "notificacion-cerrada-pasado-oscuro");
        View big = card(n.bigContentView);
        assertEquals(0xFFFF6A2C, ((TextView) big.findViewById(R.id.widget_over)).getCurrentTextColor());
        WidgetRender.save(big, 0xFF15171A, "notificacion-desplegada-pasado-oscuro");
    }

    // --- Sesión caducada -----------------------------------------------------

    @Test
    public void sessionExpiredFitsWithItsOutlinedButton() throws Exception {
        store.markExpired();
        View root = large(bench(0));

        Rect button = at(root, R.id.widget_reopen);
        near("alto de Abrir Fitit", 44, dp(button.height()));
        assertTrue("se sale por abajo", dp(button.bottom) <= 200 - 14 + 0.5f);
        assertEquals(2, ((TextView) root.findViewById(R.id.widget_expired_body)).getLineCount());
        WidgetRender.save(root, WALL_LIGHT, "4x2-caducada-claro");

        View narrow = xiaomi(bench(0));
        whole(narrow, R.id.widget_expired_body);
        assertTrue(at(narrow, R.id.widget_reopen).bottom <= narrow.getHeight());
        WidgetRender.save(narrow, WALL_LIGHT, "3x2-caducada-claro");

        View small = fourByOne(null);
        near("alto de Abrir", 44, dp(at(small, R.id.widget_reopen).height()));
        WidgetRender.save(small, WALL_LIGHT, "4x1-caducada-claro");
    }

    @Test
    @Config(qualifiers = "+night")
    public void sessionExpiredInTheDark() throws Exception {
        store.markExpired();
        WidgetRender.save(large(bench(0)), WALL_DARK, "4x2-caducada-oscuro");
    }

    // --- 3 · Sin entreno: pestañas con nombre ----------------------------------

    private void summary(boolean goal, int steps) throws Exception {
        String today = java.time.LocalDate.now().toString();
        String twoDaysAgo = java.time.LocalDate.now().minusDays(2).toString();
        String foodToday = IdleSummary.foodDay(java.time.LocalDateTime.now()).toString();
        store.mergeSummary(new JSONObject()
                .put("lastWorkout", new JSONObject().put("date", twoDaysAgo)
                        .put("groups", new org.json.JSONArray().put("Cuádriceps").put("Core")))
                .put("steps", new JSONObject().put("date", today).put("today", steps).put("weekAverage", 7910))
                .put("stepsGoal", goal ? (Object) 10000 : JSONObject.NULL)
                .put("food", new JSONObject().put("date", foodToday).put("protein", 118)
                        .put("targetProtein", 202).put("kcal", 1460).put("targetKcal", 2569)));
    }

    private View idle(String tab, float width, float height) throws Exception {
        store.setIdleTab(tab);
        return placed(width < 300 ? SessionWidget3x2.class : SessionWidget4x2.class, null, width, height);
    }

    /** Las pestañas: 40 dp a la vista, 44 de toque metidos en el margen, 18 entre ellas. */
    private void tabs(View root) {
        Rect steps = at(root, R.id.widget_tab_steps);
        near("toque de la pestaña", 44, dp(steps.height()));
        near("arriba del todo: invade el margen de 4", 0, dp(steps.top));
        Rect stepsText = at(root, R.id.widget_tab_steps_label);
        near("el texto, a 16 del borde", 16, dp(stepsText.left));
        near("18 dp entre pestañas", 18, dp(at(root, R.id.widget_tab_food_label).left - stepsText.right));
        assertTrue("toque de 44 a lo ancho", dp(steps.width()) >= 44 - 0.5f);
        near("pestañas a 13sp", 13, sp(root, R.id.widget_tab_steps_label));
        Rect line = at(root, R.id.widget_tab_steps_line);
        near("subrayado de 2", 2, dp(line.height()));
        near("subrayado del ancho del texto", dp(stepsText.width()), dp(line.width()));
        Rect rule = at(root, R.id.widget_tabs_rule);
        near("filete de 1", 1, dp(rule.height()));
        near("filete debajo de la fila de 40", 44, dp(rule.top));
    }

    /** El mismo hueco entre el filete, cada bloque y el borde de abajo. */
    private void evenly(View root, int... blocks) {
        int last = at(root, R.id.widget_tabs_rule).bottom;
        float first = -1;
        for (int id : blocks) {
            Rect block = at(root, id);
            float gap = dp(block.top - last);
            if (first < 0) first = gap;
            near("hueco antes de " + context.getResources().getResourceEntryName(id), first, gap);
            last = block.bottom;
        }
        near("hueco hasta el borde", first, dp(root.getHeight() - last));
    }

    @Test
    public void pasosTabSpreadsItsAirEvenly() throws Exception {
        summary(true, 8432);
        View root = idle("STEPS", 358, 200);

        tabs(root);
        assertEquals(context.getColor(R.color.widget_text),
                ((TextView) root.findViewById(R.id.widget_tab_steps_label)).getCurrentTextColor());
        assertEquals(context.getColor(R.color.widget_muted),
                ((TextView) root.findViewById(R.id.widget_tab_food_label)).getCurrentTextColor());
        near("cifra a 44sp", 44, sp(root, R.id.widget_steps));
        uncut(root, R.id.widget_steps);
        // «faltan 1.568» 10 dp detrás, a la línea base de la cifra.
        Rect number = at(root, R.id.widget_steps);
        Rect left = at(root, R.id.widget_steps_left);
        near("10 dp detrás", 10, dp(at(root, R.id.widget_steps_left_line).left - number.right));
        TextView big = root.findViewById(R.id.widget_steps);
        TextView small = root.findViewById(R.id.widget_steps_left);
        near("misma línea base", dp(number.top + big.getBaseline()), dp(left.top + small.getBaseline()));
        near("barra de 6", 6, dp(at(root, R.id.widget_steps_bar).height()));
        near("media a 12sp", 12, sp(root, R.id.widget_steps_week));
        evenly(root, R.id.widget_steps_line, R.id.widget_steps_bar, R.id.widget_steps_week_line);
        WidgetRender.save(root, WALL_LIGHT, "4x2-pasos-claro");
    }

    @Test
    public void pasosWithNoGoalOrTheGoalMet() throws Exception {
        summary(false, 8432);
        View noGoal = idle("STEPS", 358, 200);
        assertFalse(shown(noGoal, R.id.widget_steps_bar));
        assertFalse(shown(noGoal, R.id.widget_steps_left_line));
        evenly(noGoal, R.id.widget_steps_line, R.id.widget_steps_week_line);
        WidgetRender.save(noGoal, WALL_LIGHT, "4x2-pasos-sin-objetivo-claro");

        summary(true, 12000);
        View met = idle("STEPS", 358, 200);
        assertTrue(shown(met, R.id.widget_steps_bar));
        assertFalse(shown(met, R.id.widget_steps_left_line));
        WidgetRender.save(met, WALL_LIGHT, "4x2-pasos-cumplido-claro");
    }

    @Test
    public void comidaTabHasRingsOfOneHundredThirtySix() throws Exception {
        summary(true, 8432);
        View root = idle("FOOD", 358, 200);

        Rect rings = at(root, R.id.widget_food_rings);
        near("anillos de 136", 136, dp(rings.width()));
        near("redondos", dp(rings.width()), dp(rings.height()));
        near("a la derecha, en el margen", 358 - 16, dp(rings.right));
        // Una sola fila: el mismo aire arriba y abajo.
        Rect rule = at(root, R.id.widget_tabs_rule);
        near("centrados", dp(rings.top - rule.bottom), dp(root.getHeight() - rings.bottom));
        // «118/202 G» y «1460/2569 KCAL»: 24, 15 y 11sp, a la misma línea base.
        near("cifra a 24sp", 24, sp(root, R.id.widget_food_protein));
        near("objetivo a 15sp", 15, sp(root, R.id.widget_food_protein_target));
        near("unidad a 11sp", 11, sp(root, R.id.widget_food_protein_unit));
        assertTrue(shown(root, R.id.widget_food_kcal_unit));
        whole(root, R.id.widget_food_kcal);
        whole(root, R.id.widget_food_kcal_target);
        whole(root, R.id.widget_food_kcal_unit);
        assertTrue("las cifras pisan los anillos", at(root, R.id.widget_food_kcal_unit).right <= rings.left);
        near("14 dp entre bloques", 14, dp(at(root, R.id.widget_food_kcal_group).top
                - at(root, R.id.widget_food_protein_line).bottom));
        WidgetRender.save(root, WALL_LIGHT, "4x2-comida-claro");
    }

    @Test
    public void comidaInTheUsersThreeByTwo() throws Exception {
        summary(true, 8432);
        View root = idle("FOOD", 253, 176);

        Rect rings = at(root, R.id.widget_food_rings);
        assertTrue("anillo de " + dp(rings.width()), dp(rings.width()) >= FoodRings.MIN_DP - 0.5f);
        assertTrue("los anillos se salen por abajo", rings.bottom <= root.getHeight());
        assertTrue("los anillos pisan el filete", rings.top >= at(root, R.id.widget_tabs_rule).bottom);
        // Aquí « G» y « KCAL» no caben: la unidad la dice el sello.
        assertFalse(shown(root, R.id.widget_food_kcal_unit));
        whole(root, R.id.widget_food_kcal_target);
        assertTrue("las cifras pisan los anillos", at(root, R.id.widget_food_kcal_target).right <= rings.left);
        tabs(root);
        WidgetRender.save(root, WALL_LIGHT, "3x2-comida-claro");
    }

    @Test
    @Config(qualifiers = "+night")
    public void comidaInTheDarkAndClosed() throws Exception {
        summary(true, 8432);
        WidgetRender.save(idle("FOOD", 358, 200), WALL_DARK, "4x2-comida-oscuro");
        WidgetRender.save(idle("FOOD", 253, 176), WALL_DARK, "3x2-comida-oscuro");

        store.mergeSummary(new JSONObject().put("food", new JSONObject()
                .put("date", IdleSummary.foodDay(java.time.LocalDateTime.now()).toString())
                .put("protein", 205).put("targetProtein", 202).put("kcal", 2769).put("targetKcal", 2569)));
        View closed = idle("FOOD", 358, 200);
        assertEquals(context.getColor(R.color.widget_pr),
                ((TextView) closed.findViewById(R.id.widget_food_protein)).getCurrentTextColor());
        WidgetRender.save(closed, WALL_DARK, "4x2-comida-cerrado-oscuro");
    }

    @Test
    public void entrenoTabIsDaysSinceAndTheButton() throws Exception {
        summary(true, 8432);
        View root = idle("START", 358, 200);

        near("número a 40sp", 40, sp(root, R.id.widget_train_days));
        near("«días» a 15sp", 15, sp(root, R.id.widget_train_unit));
        Rect stripe1 = at(root, R.id.widget_train_stripe_1);
        Rect stripe2 = at(root, R.id.widget_train_stripe_2);
        near("franja de 4", 4, dp(stripe1.width()));
        near("dos mitades", dp(stripe1.height()), dp(stripe2.height()));
        near("la franja, del alto del bloque", dp(at(root, R.id.widget_train).height()),
                dp(stripe2.bottom - stripe1.top));
        near("12 dp a la derecha", 12, dp(at(root, R.id.widget_train_days).left - stripe1.right));
        near("6 dp debajo", 6, dp(at(root, R.id.widget_train_since).top
                - at(root, R.id.widget_train_days).bottom));
        Rect button = at(root, R.id.widget_start);
        near("botón de 44", 44, dp(button.height()));
        near("a lo ancho", 358 - 32, dp(button.width()));
        evenly(root, R.id.widget_train, R.id.widget_start);
        WidgetRender.save(root, WALL_LIGHT, "4x2-entreno-claro");
    }

    @Test
    @Config(qualifiers = "+night")
    public void theTabsInTheDark() throws Exception {
        summary(true, 8432);
        WidgetRender.save(idle("STEPS", 358, 200), WALL_DARK, "4x2-pasos-oscuro");
        WidgetRender.save(idle("START", 358, 200), WALL_DARK, "4x2-entreno-oscuro");
        WidgetRender.save(idle("STEPS", 253, 176), WALL_DARK, "3x2-pasos-oscuro");
        WidgetRender.save(idle("START", 253, 176), WALL_DARK, "3x2-entreno-oscuro");
    }

    @Test
    public void theThreeTabsFitTheUsersThreeByTwo() throws Exception {
        summary(true, 8432);

        View steps = idle("STEPS", 253, 176);
        tabs(steps);
        whole(steps, R.id.widget_steps);
        assertTrue(at(steps, R.id.widget_steps_left_line).right <= steps.getWidth()
                - WidgetRender.px(context, 16));
        assertTrue(at(steps, R.id.widget_steps_week_line).bottom <= steps.getHeight());
        evenly(steps, R.id.widget_steps_line, R.id.widget_steps_bar, R.id.widget_steps_week_line);
        WidgetRender.save(steps, WALL_LIGHT, "3x2-pasos-claro");

        View train = idle("START", 253, 176);
        // «desde el último · Cuádriceps · Core» no cabe en 253 dp: se nombra el
        // grupo principal entero, y la franja sigue partida en los dos colores.
        whole(train, R.id.widget_train_groups);
        assertEquals("Cuádriceps", ((TextView) train.findViewById(R.id.widget_train_groups)).getText().toString());
        assertTrue(shown(train, R.id.widget_train_stripe_2));
        assertTrue(at(train, R.id.widget_start).bottom <= train.getHeight());
        evenly(train, R.id.widget_train, R.id.widget_start);
        WidgetRender.save(train, WALL_LIGHT, "3x2-entreno-claro");
    }
}
