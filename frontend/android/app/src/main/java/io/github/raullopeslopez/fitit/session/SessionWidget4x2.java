package io.github.raullopeslopez.fitit.session;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import io.github.raullopeslopez.fitit.R;
import org.json.JSONObject;

/**
 * El widget 4×2 de la pantalla de inicio, el que ajusta.
 *
 * <pre>
 * Press banca                      01:23  ⏭
 * 4 series · 1 sin enviar
 * [ − ]   32,5 kg   [ + ]    [ − ]  12  [ + ]
 * [   Registrar serie   ]  Otro ejercicio  Terminar
 * </pre>
 *
 * <p>«Otro ejercicio» abre la app con el campo de añadir ejercicio de ese entreno
 * ({@link SessionLaunch#ADD}). Cambiar a uno que ya está en el entreno no se hace
 * desde aquí: se escribe en la notificación o se toca en la app.
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
        if (control == null) return SessionWidget.idle(context, views);

        SessionWidget.header(context, views, control, now);
        boolean resting = SessionControl.rest(control, now) == SessionControl.Rest.RUNNING;
        views.setViewVisibility(R.id.widget_skip, resting ? View.VISIBLE : View.GONE);

        views.setTextViewText(R.id.widget_count, SessionControl.series(control));
        String unsent = SessionControl.unsent(Session.store(context).queue().size());
        views.setTextViewText(R.id.widget_unsent, unsent);
        views.setViewVisibility(R.id.widget_unsent, unsent.isEmpty() ? View.GONE : View.VISIBLE);

        views.setViewVisibility(R.id.widget_weight_box,
                SessionControl.hasWeight(control) ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.widget_weight, SessionControl.kilosLabel(control));
        views.setTextViewText(R.id.widget_reps, SessionControl.repsLabel(control));

        tap(context, views, R.id.widget_skip, SessionController.ACTION_SKIP, 35);
        tap(context, views, R.id.widget_weight_down, SessionController.ACTION_WEIGHT_DOWN, 30);
        tap(context, views, R.id.widget_weight_up, SessionController.ACTION_WEIGHT_UP, 31);
        tap(context, views, R.id.widget_reps_down, SessionController.ACTION_REPS_DOWN, 32);
        tap(context, views, R.id.widget_reps_up, SessionController.ACTION_REPS_UP, 33);
        tap(context, views, R.id.widget_log, SessionController.ACTION_WIDGET_REPEAT, 21);
        tap(context, views, R.id.widget_end, SessionController.ACTION_END, 34);
        views.setOnClickPendingIntent(R.id.widget_other,
                SessionLaunch.add(context, control.optInt("workoutId", -1)));
        return views;
    }

    private static void tap(Context context, RemoteViews views, int id, String action, int code) {
        views.setOnClickPendingIntent(id, SessionNotification.broadcast(context, action, code, false));
    }
}
