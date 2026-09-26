package io.github.raullopeslopez.fitit.session;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;
import io.github.raullopeslopez.fitit.R;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import org.json.JSONObject;

/**
 * El widget 4×1 de la pantalla de inicio.
 *
 * <pre>
 * Press banca · Pecho                    01:23
 * 32,5 kg × 12 · 4 series        [ +1 serie ]
 * </pre>
 *
 * <p>Sin sesión: «Sin entreno en curso», el día, y «Empezar entreno». No tiene
 * actualización periódica: {@link SessionController} lo repinta cada vez que el
 * control cambia, y el reloj es un cronómetro del propio widget. Colores por tema
 * del sistema (values / values-night) y las fuentes de la maqueta en res/font.
 * Spec: docs/widgets-entreno.md, «2 · Widget» y fase 3.
 */
public class SessionWidget extends AppWidgetProvider {
    private static final DateTimeFormatter DAY =
            DateTimeFormatter.ofPattern("EEEE d", new Locale("es", "ES"));

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        render(context, manager, ids);
    }

    /** Repinta todos los widgets puestos; si no hay ninguno no hace nada. */
    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (manager == null) return;
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, SessionWidget.class));
        if (ids != null && ids.length > 0) render(context, manager, ids);
    }

    private static void render(Context context, AppWidgetManager manager, int[] ids) {
        RemoteViews views = views(context, Session.store(context).control(), System.currentTimeMillis());
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    static RemoteViews views(Context context, JSONObject control, long now) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_session_4x1);
        if (control == null) {
            views.setViewVisibility(R.id.widget_session, View.GONE);
            views.setViewVisibility(R.id.widget_idle, View.VISIBLE);
            views.setTextViewText(R.id.widget_idle_date, LocalDate.now().format(DAY));
            views.setOnClickPendingIntent(R.id.widget_start, SessionLaunch.start(context));
            views.setOnClickPendingIntent(R.id.widget_idle, SessionLaunch.start(context));
            return views;
        }

        views.setViewVisibility(R.id.widget_idle, View.GONE);
        views.setViewVisibility(R.id.widget_session, View.VISIBLE);
        views.setTextViewText(R.id.widget_exercise, control.optString("exercise", ""));
        String group = control.isNull("group") ? "" : control.optString("group", "");
        views.setTextViewText(R.id.widget_group, group.isEmpty() ? "" : " · " + group);
        views.setTextViewText(R.id.widget_set, SessionControl.set(control));
        views.setTextViewText(R.id.widget_count, " · " + SessionControl.series(control));

        switch (SessionControl.rest(control, now)) {
            case RUNNING:
                long remaining = control.optLong("restEndsAt") - now;
                views.setChronometer(R.id.widget_clock, SystemClock.elapsedRealtime() + remaining, null, true);
                views.setChronometerCountDown(R.id.widget_clock, true);
                views.setViewVisibility(R.id.widget_clock, View.VISIBLE);
                views.setViewVisibility(R.id.widget_rest_over, View.GONE);
                break;
            case OVER:
                views.setChronometer(R.id.widget_clock, SystemClock.elapsedRealtime(), null, false);
                views.setViewVisibility(R.id.widget_clock, View.GONE);
                views.setViewVisibility(R.id.widget_rest_over, View.VISIBLE);
                break;
            default:
                views.setChronometer(R.id.widget_clock, SystemClock.elapsedRealtime(), null, false);
                views.setViewVisibility(R.id.widget_clock, View.GONE);
                views.setViewVisibility(R.id.widget_rest_over, View.GONE);
                break;
        }

        views.setOnClickPendingIntent(R.id.widget_open,
                SessionLaunch.open(context, control.optInt("workoutId", -1)));
        views.setOnClickPendingIntent(R.id.widget_repeat,
                SessionNotification.broadcast(context, SessionController.ACTION_WIDGET_REPEAT, 20, false));
        return views;
    }
}
