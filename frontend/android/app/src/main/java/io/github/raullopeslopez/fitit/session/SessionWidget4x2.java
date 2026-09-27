package io.github.raullopeslopez.fitit.session;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import io.github.raullopeslopez.fitit.R;
import java.time.LocalDate;
import org.json.JSONObject;

/**
 * El widget 4×2 de la pantalla de inicio, el que ajusta; y el 3×2
 * ({@link SessionWidget3x2}), que es el mismo más estrecho.
 *
 * <pre>
 * Press banca · 4 series · 1 sin enviar         (■)
 * 01:23
 * [ −  32,5 kg  + |    ]
 * [ −  12 reps  + | +1 ]
 * </pre>
 *
 * <p>Añadir o cambiar de ejercicio se hace dentro de la app: tocar el ejercicio
 * la abre en ese entreno ({@link SessionLaunch#OPEN}).
 *
 * <p>Los {@code −}/{@code +} cambian la serie que se repite y no registran nada;
 * el {@code +1} es el del 4×1 (y vibra igual). Un ejercicio sin peso no
 * enseña los botones de kg. Lo demás, el ejercicio, el reloj y el estado sin
 * sesión, es lo mismo que el 4×1 ({@link SessionWidget}), que es también quien
 * repinta los dos. Spec: docs/widgets-entreno.md, «4×2, con ajuste» y fase 4.
 */
public class SessionWidget4x2 extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        render(context, manager, ids);
    }

    /** El launcher cambió su tamaño (al ponerlo, al estirarlo): se repinta a su medida. */
    @Override
    public void onAppWidgetOptionsChanged(
            Context context, AppWidgetManager manager, int id, Bundle options) {
        render(context, manager, new int[] {id});
    }

    /**
     * Cuánto sitio le dio el launcher (DESIGN.md, «Tamaños»). El diseño aprobado
     * pide 200 dp de alto; dos filas de launcher pueden dar menos (≈176 en el
     * Xiaomi del usuario) y el bloque perdía la fila de reps por abajo. Por
     * debajo de {@link #TALL}, compacto: el tiempo sube a la línea del nombre, las
     * filas del bloque bajan a 44 dp (el mínimo de toque) y los márgenes a 10.
     * Estrecho además ({@link #WIDE}), descansando se quita « · 4 series» para
     * que quepa el nombre. Sin tamaño (un launcher que no lo dice), el de siempre.
     */
    enum Fit {
        FULL, COMPACT, NARROW;

        static final int TALL = 190;
        static final int WIDE = 300;

        /** En vertical, que es como se usa: ancho mínimo × alto máximo. */
        static Fit of(Bundle options) {
            int height = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT);
            int width = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
            if (height <= 0 || height >= TALL) return FULL;
            return width > 0 && width < WIDE ? NARROW : COMPACT;
        }
    }

    static void render(Context context, AppWidgetManager manager, int[] ids) {
        JSONObject control = Session.store(context).control();
        long now = System.currentTimeMillis();
        for (int id : ids) {
            Fit fit = Fit.of(manager.getAppWidgetOptions(id));
            manager.updateAppWidget(id, views(context, control, now, fit));
        }
    }

    static RemoteViews views(Context context, JSONObject control, long now) {
        return views(context, control, now, Fit.FULL);
    }

    static RemoteViews views(Context context, JSONObject control, long now, Fit fit) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_session_4x2);
        // Los márgenes de siempre; el compacto los aprieta más abajo (fit). Sin
        // entreno o caducada caben igual, y no deben heredar los de un compacto.
        padding(context, views, 14);
        if (Session.store(context).sessionExpired()) return SessionWidget.expired(context, views);
        if (control == null) return idle(context, views, LocalDate.now());

        SessionWidget.header(context, views, control, now);

        views.setTextViewText(R.id.widget_count, " · " + SessionControl.series(control));
        String unsent = SessionControl.unsent(Session.store(context).queue().size());
        views.setTextViewText(R.id.widget_unsent, unsent);
        views.setViewVisibility(R.id.widget_unsent, unsent.isEmpty() ? View.GONE : View.VISIBLE);

        block(views, control);
        fit(context, views, control, now, fit);

        SessionNotification.tap(context, views, R.id.widget_weight_down, SessionController.ACTION_WEIGHT_DOWN, 30);
        SessionNotification.tap(context, views, R.id.widget_weight_up, SessionController.ACTION_WEIGHT_UP, 31);
        SessionNotification.tap(context, views, R.id.widget_reps_down, SessionController.ACTION_REPS_DOWN, 32);
        SessionNotification.tap(context, views, R.id.widget_reps_up, SessionController.ACTION_REPS_UP, 33);
        SessionNotification.tap(context, views, R.id.widget_log, SessionController.ACTION_WIDGET_REPEAT, 21);
        SessionNotification.tap(context, views, R.id.widget_end, SessionController.ACTION_END, 34);
        return views;
    }

    /**
     * Lo que cambia con el tamaño. Todo se pone en los dos sentidos: al repintar,
     * Android reaplica sobre la vista que ya había, y un compacto de antes dejaría
     * sus márgenes y su reloj a un widget que ahora es alto.
     */
    static void fit(Context context, RemoteViews views, JSONObject control, long now, Fit fit) {
        boolean compact = fit != Fit.FULL;
        if (compact) padding(context, views, 10);

        if (compact) {
            views.setViewVisibility(R.id.widget_clock, View.GONE);
            views.setViewVisibility(R.id.widget_over, View.GONE);
            SessionWidget.clock(views, R.id.widget_clock_inline, R.id.widget_over_inline, control, now);
        } else {
            views.setViewVisibility(R.id.widget_clock_inline, View.GONE);
            views.setViewVisibility(R.id.widget_over_inline, View.GONE);
        }
        boolean resting = SessionControl.rest(control, now) != SessionControl.Rest.NONE;
        views.setViewVisibility(R.id.widget_count,
                fit == Fit.NARROW && resting ? View.GONE : View.VISIBLE);

        // Los márgenes y los altos sólo se tocan desde Android 12; antes, el
        // compacto se queda en el reloj arriba y los márgenes de 10, que es lo
        // que más alto ahorra.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            float row = compact ? 44 : 48;
            views.setViewLayoutHeight(R.id.widget_weight_box, row, TypedValue.COMPLEX_UNIT_DIP);
            views.setViewLayoutHeight(R.id.widget_reps_box, row, TypedValue.COMPLEX_UNIT_DIP);
            views.setViewLayoutMargin(R.id.widget_block, RemoteViews.MARGIN_TOP,
                    compact ? 8 : 11, TypedValue.COMPLEX_UNIT_DIP);
        }
    }

    /** 16 dp a los lados siempre; arriba y abajo, {@code edge}. */
    private static void padding(Context context, RemoteViews views, int edge) {
        float density = context.getResources().getDisplayMetrics().density;
        int side = Math.round(16 * density);
        int vertical = Math.round(edge * density);
        views.setViewPadding(R.id.widget_root, side, vertical, side, vertical);
    }

    /**
     * Sin entreno, dos pantallas que cambian al tocar los puntitos (DESIGN.md,
     * «Sin entreno»): empezar, con el último entreno; y los pasos de hoy frente al
     * objetivo. Sin pasos de hoy sólo hay la primera, y los puntitos no se ven
     * (invisibles, no fuera: la primera pantalla no se mueve de sitio).
     */
    static RemoteViews idle(Context context, RemoteViews views, LocalDate today) {
        SessionWidget.idle(context, views);
        JSONObject summary = Session.store(context).summary();

        String last = IdleSummary.lastLine(summary, today);
        if (last != null) views.setTextViewText(R.id.widget_idle_date, last);
        views.setOnClickPendingIntent(R.id.widget_idle_start, SessionLaunch.start(context));

        IdleSummary.Steps steps = IdleSummary.steps(summary, today);
        boolean second = steps != null && Session.store(context).idlePage() == 1;
        views.setViewVisibility(R.id.widget_idle_start, second ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.widget_idle_steps, second ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_dots, steps == null ? View.INVISIBLE : View.VISIBLE);
        views.setImageViewResource(R.id.widget_dot_1, second ? R.drawable.widget_dot_off : R.drawable.widget_dot_on);
        views.setImageViewResource(R.id.widget_dot_2, second ? R.drawable.widget_dot_on : R.drawable.widget_dot_off);
        SessionNotification.tap(context, views, R.id.widget_dots, SessionController.ACTION_PAGE, 35);
        if (steps == null) return views;

        views.setTextViewText(R.id.widget_steps, IdleSummary.thousands(steps.today));
        boolean goal = steps.goal != null;
        views.setViewVisibility(R.id.widget_steps_goal, goal ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_steps_bar, goal ? View.VISIBLE : View.INVISIBLE);
        if (goal) {
            views.setTextViewText(R.id.widget_steps_goal, "/ " + IdleSummary.thousands(steps.goal));
            views.setProgressBar(R.id.widget_steps_bar, 1000, steps.progress(), false);
        }
        boolean week = steps.weekAverage != null;
        views.setViewVisibility(R.id.widget_steps_week_line, week ? View.VISIBLE : View.INVISIBLE);
        if (week) views.setTextViewText(R.id.widget_steps_week, IdleSummary.thousands(steps.weekAverage));
        views.setOnClickPendingIntent(R.id.widget_idle_steps, SessionLaunch.app(context));
        return views;
    }

    /**
     * Las cifras del bloque de ajuste (widget_adjust_block). Sin peso, la fila de
     * kg y su filete se van y queda sólo la de reps.
     */
    static void block(RemoteViews views, JSONObject control) {
        int weighted = SessionControl.hasWeight(control) ? View.VISIBLE : View.GONE;
        views.setViewVisibility(R.id.widget_weight_box, weighted);
        views.setViewVisibility(R.id.widget_divider, weighted);
        views.setTextViewText(R.id.widget_weight, SessionControl.weightLabel(control));
        views.setTextViewText(R.id.widget_reps, SessionControl.repsLabel(control));
    }
}
