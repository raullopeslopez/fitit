package io.github.raullopeslopez.fitit.session;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;
import io.github.raullopeslopez.fitit.R;
import java.time.LocalDate;
import org.json.JSONObject;

/**
 * El widget 4×2 de la pantalla de inicio, el que ajusta.
 *
 * <pre>
 * Press banca                      01:23
 * 4 series · 1 sin enviar
 * [ − ]   32,5 kg   [ + ]    [ − ]  12  [ + ]
 * [   Registrar serie   ]  Terminar
 * </pre>
 *
 * <p>Añadir o cambiar de ejercicio se hace dentro de la app: tocar el ejercicio
 * la abre en ese entreno ({@link SessionLaunch#OPEN}).
 *
 * <p>Los {@code −}/{@code +} cambian la serie que se repite y no registran nada;
 * «Registrar serie» es el +1 del 4×1 (y vibra igual). Un ejercicio sin peso no
 * enseña los botones de kg. Lo demás, el ejercicio, el reloj y el estado sin
 * sesión, es lo mismo que el 4×1 ({@link SessionWidget}), que es también quien
 * repinta los dos. Spec: docs/widgets-entreno.md, «4×2, con ajuste» y fase 4.
 */
public class SessionWidget4x2 extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        render(context, manager, ids);
    }

    static void render(Context context, AppWidgetManager manager, int[] ids) {
        RemoteViews views = views(context, Session.store(context).control(), System.currentTimeMillis());
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    static RemoteViews views(Context context, JSONObject control, long now) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_session_4x2);
        if (Session.store(context).sessionExpired()) return SessionWidget.expired(context, views);
        if (control == null) return idle(context, views, LocalDate.now());

        SessionWidget.header(context, views, control, now);

        views.setTextViewText(R.id.widget_count, " · " + SessionControl.series(control));
        String unsent = SessionControl.unsent(Session.store(context).queue().size());
        views.setTextViewText(R.id.widget_unsent, unsent);
        views.setViewVisibility(R.id.widget_unsent, unsent.isEmpty() ? View.GONE : View.VISIBLE);

        block(views, control);

        SessionNotification.tap(context, views, R.id.widget_weight_down, SessionController.ACTION_WEIGHT_DOWN, 30);
        SessionNotification.tap(context, views, R.id.widget_weight_up, SessionController.ACTION_WEIGHT_UP, 31);
        SessionNotification.tap(context, views, R.id.widget_reps_down, SessionController.ACTION_REPS_DOWN, 32);
        SessionNotification.tap(context, views, R.id.widget_reps_up, SessionController.ACTION_REPS_UP, 33);
        SessionNotification.tap(context, views, R.id.widget_log, SessionController.ACTION_WIDGET_REPEAT, 21);
        SessionNotification.tap(context, views, R.id.widget_end, SessionController.ACTION_END, 34);
        return views;
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
