package io.github.raullopeslopez.fitit.session;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import io.github.raullopeslopez.fitit.R;
import java.util.List;
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
 * <p>«Otro ejercicio» cambia el widget a la lista de candidatos (fase 5):
 *
 * <pre>
 * [ Remo        ]  [ Dominadas   ]
 * [ 40 kg × 10  ]  [ 8 reps      ]
 * [ Sentadilla  ]  [ Curl        ]
 *                  [ 12,5 kg × 12]
 * [        Nuevo…          ]   Cancelar
 * </pre>
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
        if (SessionControl.isChoosing(control)) return choosing(context, views, control);

        SessionWidget.header(context, views, control, now);
        views.setViewVisibility(R.id.widget_choose, View.GONE);
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
        tap(context, views, R.id.widget_other, SessionController.ACTION_CHOOSE, 36);
        return views;
    }

    private static final int[] PICKS = {
        R.id.widget_pick_0, R.id.widget_pick_1, R.id.widget_pick_2, R.id.widget_pick_3
    };
    private static final int[] NAMES = {
        R.id.widget_pick_name_0, R.id.widget_pick_name_1, R.id.widget_pick_name_2, R.id.widget_pick_name_3
    };
    private static final int[] MARKS = {
        R.id.widget_pick_mark_0, R.id.widget_pick_mark_1, R.id.widget_pick_mark_2, R.id.widget_pick_mark_3
    };

    /**
     * «Otro ejercicio»: los candidatos que publicó la app, con su marca, en casillas
     * fijas; «Nuevo…» abre la app para añadir uno; «Cancelar» vuelve. Tocar uno lo
     * pone en curso sin registrar nada ({@link SessionControl#switchTo}).
     */
    private static RemoteViews choosing(Context context, RemoteViews views, JSONObject control) {
        views.setViewVisibility(R.id.widget_idle, View.GONE);
        views.setViewVisibility(R.id.widget_session, View.GONE);
        views.setViewVisibility(R.id.widget_choose, View.VISIBLE);

        List<JSONObject> candidates = SessionControl.candidates(control);
        for (int i = 0; i < PICKS.length; i++) {
            if (i >= candidates.size()) {
                // Hueco en la fila de un candidato solo; sin nadie en la fila, fuera.
                views.setViewVisibility(PICKS[i], i % 2 == 1 && i == candidates.size() ? View.INVISIBLE : View.GONE);
                continue;
            }
            JSONObject candidate = candidates.get(i);
            String name = candidate.optString("exercise", "");
            String mark = SessionControl.mark(candidate);
            views.setViewVisibility(PICKS[i], View.VISIBLE);
            views.setTextViewText(NAMES[i], name);
            views.setTextViewText(MARKS[i], mark);
            views.setViewVisibility(MARKS[i], mark.isEmpty() ? View.GONE : View.VISIBLE);
            Intent intent = new Intent(context, SessionActionReceiver.class)
                    .setAction(SessionController.ACTION_SWITCH)
                    .putExtra(SessionController.EXTRA_EXERCISE, name);
            views.setOnClickPendingIntent(PICKS[i], PendingIntent.getBroadcast(context, 40 + i, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
        views.setViewVisibility(R.id.widget_pick_row_0, candidates.isEmpty() ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.widget_pick_row_1, candidates.size() > 2 ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_pick_empty, candidates.isEmpty() ? View.VISIBLE : View.GONE);

        views.setOnClickPendingIntent(R.id.widget_pick_new,
                SessionLaunch.add(context, control.optInt("workoutId", -1)));
        tap(context, views, R.id.widget_pick_cancel, SessionController.ACTION_CHOOSE_CANCEL, 37);
        return views;
    }

    private static void tap(Context context, RemoteViews views, int id, String action, int code) {
        views.setOnClickPendingIntent(id, SessionNotification.broadcast(context, action, code, false));
    }
}
