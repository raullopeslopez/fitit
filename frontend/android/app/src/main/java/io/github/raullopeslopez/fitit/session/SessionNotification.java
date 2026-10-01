package io.github.raullopeslopez.fitit.session;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import io.github.raullopeslopez.fitit.R;
import org.json.JSONObject;

/**
 * La notificación en curso: pantalla de bloqueo y bandeja. Diseño propio dentro
 * del marco de Android (DESIGN.md, «La notificación del entreno»; N4 en la vista
 * previa v17):
 *
 * <pre>
 * Fitit · Entreno                                  (lo pone Android)
 * Press banca                                  01:23      cerrada
 * 32,5 kg × 12 · 4 series
 *
 * Press banca · 4 series                                  desplegada
 * 01:23
 * [ −  32,5 kg  + |    ]
 * [ −  12 reps  + | +1 ]
 * </pre>
 *
 * <p>Sin botones del sistema: el bloque de ajuste ocupa su sitio, y con ellos se
 * fue escribir desde fuera de la app (Android sólo deja campos de texto en sus
 * botones). Renuncia consciente: con diseño propio no puede ser «Live Update», así
 * que no sube a la isla de HyperOS ni al chip de la barra de estado.
 *
 * <p>El tiempo son los cronómetros del propio layout, como en el widget: nadie lo
 * reescribe cada segundo. Baja en color de texto y, pasado el descanso, sube en
 * accent-ink con signo; el cambio lo hace la alarma de fin de descanso. Canal
 * silencioso: ni suena ni vibra. Lo que suena al acabar el descanso es otro aviso,
 * en otro canal ({@link RestChime}).
 */
final class SessionNotification {
    static final String CHANNEL = "fitit_entreno";
    static final int ID = 4102;
    // Canales que ya no se usan y que Android conserva en Ajustes aunque el código
    // se haya ido: los del aviso de descanso que retiró la fase 0, y el de la
    // 0.6.0, de importancia baja (Android no deja subírsela a un canal que ya
    // existe, así que se sustituye).
    private static final String[] RETIRED = {"fitit-sesion", "fitit-fin-descanso", "fitit_session"};

    private SessionNotification() {}

    static void show(Context context, JSONObject control, long now) {
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        ensureChannel(context);
        // Sin permiso (Android 13+) no hay tarjeta; el control sigue guardado.
        if (!manager.areNotificationsEnabled()) return;
        try {
            manager.notify(ID, build(context, control, now));
        } catch (SecurityException e) {
            // Permiso retirado entre la comprobación y el aviso: igual que sin él.
        }
    }

    static void cancel(Context context) {
        NotificationManagerCompat.from(context).cancel(ID);
    }

    private static void ensureChannel(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        for (String retired : RETIRED) manager.deleteNotificationChannel(retired);
        // Importancia normal, no baja. Android trata la baja como «silenciosa», y
        // muchos teléfonos —Xiaomi el primero— no enseñan las silenciosas en la
        // pantalla de bloqueo, que es donde tiene que estar. Sin sonido ni
        // vibración en el canal, y `setSilent` en cada aviso: sigue sin sonar.
        NotificationChannel channel = new NotificationChannel(
                CHANNEL, "Entreno en curso", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("La serie que toca y el descanso, con peso y reps para ajustar y registrar sin abrir la app.");
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    private static Notification build(Context context, JSONObject control, long now) {
        return new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_fitit)
                // Título y texto no se pintan (manda el diseño propio), pero los
                // leen el lector de pantalla y quien no sabe pintarlo (un reloj).
                .setContentTitle(SessionControl.title(control))
                .setContentText(SessionControl.line(control))
                .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
                .setCustomContentView(collapsed(context, control, now))
                .setCustomBigContentView(expanded(context, control, now))
                // El tiempo grande es el nuestro: la cabecera no pinta otro.
                .setShowWhen(false)
                .setOngoing(true)
                .setSilent(true)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(SessionLaunch.open(context, control.optInt("workoutId", -1)))
                .build();
    }

    /** Cerrada: el ejercicio y la serie a la izquierda, el tiempo a la derecha. */
    private static RemoteViews collapsed(Context context, JSONObject control, long now) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.notification_session);
        views.setTextViewText(R.id.widget_exercise, SessionControl.title(control));
        views.setTextViewText(R.id.widget_set, SessionControl.set(control));
        views.setTextViewText(R.id.widget_count, " · " + SessionControl.series(control));
        SessionWidget.clock(views, R.id.widget_clock, R.id.widget_over, control, now);
        return views;
    }

    /** Desplegada: la línea, el tiempo y el bloque de ajuste del widget. */
    private static RemoteViews expanded(Context context, JSONObject control, long now) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.notification_session_big);
        views.setTextViewText(R.id.widget_exercise, SessionControl.title(control));
        views.setTextViewText(R.id.widget_count, " · " + SessionControl.series(control));
        SessionWidget.clock(views, R.id.widget_clock, R.id.widget_over, control, now);
        SessionWidget4x2.block(views, control);
        tap(context, views, R.id.widget_weight_down, SessionController.ACTION_WEIGHT_DOWN, 30);
        tap(context, views, R.id.widget_weight_up, SessionController.ACTION_WEIGHT_UP, 31);
        tap(context, views, R.id.widget_reps_down, SessionController.ACTION_REPS_DOWN, 32);
        tap(context, views, R.id.widget_reps_up, SessionController.ACTION_REPS_UP, 33);
        // El +1 de aquí no vibra: sólo el del widget, como se pidió.
        tap(context, views, R.id.widget_log, SessionController.ACTION_REPEAT, 1);
        return views;
    }

    static void tap(Context context, RemoteViews views, int id, String action, int code) {
        views.setOnClickPendingIntent(id, broadcast(context, action, code));
    }

    static PendingIntent broadcast(Context context, String action, int code) {
        Intent intent = new Intent(context, SessionActionReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(context, code, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
