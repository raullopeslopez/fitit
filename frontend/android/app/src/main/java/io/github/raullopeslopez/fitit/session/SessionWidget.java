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
 * Press banca                            01:23
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

    /** Repinta todos los widgets puestos, 4×1 y 4×2; si no hay ninguno no hace nada. */
    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (manager == null) return;
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, SessionWidget.class));
        if (ids != null && ids.length > 0) render(context, manager, ids);
        int[] large = manager.getAppWidgetIds(new ComponentName(context, SessionWidget4x2.class));
        if (large != null && large.length > 0) SessionWidget4x2.render(context, manager, large);
        if ((ids != null && ids.length > 0) || (large != null && large.length > 0)) {
            SessionAlarms.armDay(context, System.currentTimeMillis());
        }
    }

    private static void render(Context context, AppWidgetManager manager, int[] ids) {
        RemoteViews views = views(context, Session.store(context).control(), System.currentTimeMillis());
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    static RemoteViews views(Context context, JSONObject control, long now) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_session_4x1);
        if (Session.store(context).sessionExpired()) return expired(context, views);
        if (control == null) return idle(context, views);

        header(context, views, control, now);
        views.setTextViewText(R.id.widget_set, SessionControl.set(control));
        views.setTextViewText(R.id.widget_count, " · " + SessionControl.series(control));
        views.setOnClickPendingIntent(R.id.widget_repeat,
                SessionNotification.broadcast(context, SessionController.ACTION_WIDGET_REPEAT, 20));
        return views;
    }

    // Lo que comparten los dos tamaños; los ids se llaman igual en los dos layouts.

    /**
     * «Sesión caducada»: el servidor rechazó el token. Gana a los demás estados,
     * porque un +1 ahora encolaría series que no salen. Un botón con borde y sin
     * relleno, «Abrir Fitit» («Abrir» en el 4×1), que sólo abre la app: no
     * registra nada, así que no lleva ámbar. Las series siguen en la cola.
     */
    static RemoteViews expired(Context context, RemoteViews views) {
        views.setViewVisibility(R.id.widget_session, View.GONE);
        views.setViewVisibility(R.id.widget_idle, View.GONE);
        views.setViewVisibility(R.id.widget_expired, View.VISIBLE);
        views.setOnClickPendingIntent(R.id.widget_reopen, SessionLaunch.app(context));
        views.setOnClickPendingIntent(R.id.widget_expired, SessionLaunch.app(context));
        return views;
    }

    /** Sin sesión: «Sin entreno en curso», el día, y «Empezar entreno». */
    static RemoteViews idle(Context context, RemoteViews views) {
        views.setViewVisibility(R.id.widget_expired, View.GONE);
        views.setViewVisibility(R.id.widget_session, View.GONE);
        views.setViewVisibility(R.id.widget_idle, View.VISIBLE);
        views.setTextViewText(R.id.widget_idle_date, LocalDate.now().format(DAY));
        views.setOnClickPendingIntent(R.id.widget_start, SessionLaunch.start(context));
        views.setOnClickPendingIntent(R.id.widget_idle, SessionLaunch.start(context));
        return views;
    }

    /** El ejercicio, que abre la app al tocarlo, y el reloj del descanso. */
    static void header(Context context, RemoteViews views, JSONObject control, long now) {
        views.setViewVisibility(R.id.widget_expired, View.GONE);
        views.setViewVisibility(R.id.widget_idle, View.GONE);
        views.setViewVisibility(R.id.widget_session, View.VISIBLE);
        // Sólo el ejercicio: el grupo muscular dejó de pintarse en la fase 5.
        views.setTextViewText(R.id.widget_exercise, SessionControl.title(control));
        views.setOnClickPendingIntent(R.id.widget_open,
                SessionLaunch.open(context, control.optInt("workoutId", -1)));
        clock(views, R.id.widget_clock, R.id.widget_over, control, now);
    }

    /**
     * El tiempo del descanso en dos cronómetros del propio layout, que corren sin
     * que nadie los repinte: {@code countdown} baja en color de texto hasta el fin
     * del descanso; pasado, {@code over} sube desde ahí en accent-ink con signo
     * ({@code +00:12}). El cambio de uno a otro lo hace la alarma del fin del
     * descanso, que repinta. Sin descanso, ninguno. Lo usan los widgets y la
     * notificación.
     */
    static void clock(RemoteViews views, int countdown, int over, JSONObject control, long now) {
        long endsAt = control.optLong("restEndsAt");
        long base = SystemClock.elapsedRealtime() + (endsAt - now);
        switch (SessionControl.rest(control, now)) {
            case RUNNING:
                views.setChronometer(countdown, base, null, true);
                views.setChronometerCountDown(countdown, true);
                views.setViewVisibility(countdown, View.VISIBLE);
                views.setChronometer(over, SystemClock.elapsedRealtime(), "+%s", false);
                views.setViewVisibility(over, View.GONE);
                break;
            case OVER:
                views.setChronometer(countdown, SystemClock.elapsedRealtime(), null, false);
                views.setViewVisibility(countdown, View.GONE);
                views.setChronometer(over, base, "+%s", true);
                views.setChronometerCountDown(over, false);
                views.setViewVisibility(over, View.VISIBLE);
                break;
            default:
                views.setChronometer(countdown, SystemClock.elapsedRealtime(), null, false);
                views.setViewVisibility(countdown, View.GONE);
                views.setChronometer(over, SystemClock.elapsedRealtime(), "+%s", false);
                views.setViewVisibility(over, View.GONE);
                break;
        }
    }
}
