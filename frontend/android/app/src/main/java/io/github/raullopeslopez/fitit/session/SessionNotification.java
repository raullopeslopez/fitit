package io.github.raullopeslopez.fitit.session;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import io.github.raullopeslopez.fitit.R;
import org.json.JSONObject;

/**
 * La notificación en curso: pantalla de bloqueo y bandeja.
 *
 * <pre>
 * Fitit · Press banca
 * 32,5 kg × 12 · 4 series                    01:23
 * [ +1 serie ]
 * </pre>
 *
 * <p>La cuenta atrás es el cronómetro de la propia notificación: nadie la reescribe
 * cada segundo. Al acabar, la alarma de fin de descanso la repinta con «Descanso
 * terminado». Canal silencioso: ni suena ni vibra. Plantilla
 * estándar, con la fuente del sistema (la spec dejaba las fuentes propias como
 * riesgo en la capa de Xiaomi). Spec: docs/widgets-entreno.md, «1 · Notificación
 * en curso».
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
        channel.setDescription("La serie que toca y el descanso, con botones para registrar sin abrir la app.");
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    private static Notification build(Context context, JSONObject control, long now) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_fitit)
                .setContentTitle(SessionControl.title(control))
                .setContentText(SessionControl.line(control))
                .setOngoing(true)
                .setSilent(true)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(SessionLaunch.open(context, control.optInt("workoutId", -1)))
                .addAction(0, "+1 serie", broadcast(context, SessionController.ACTION_REPEAT, 1));

        SessionControl.Rest rest = SessionControl.rest(control, now);
        if (rest == SessionControl.Rest.RUNNING) {
            builder.setWhen(control.optLong("restEndsAt"))
                    .setShowWhen(true)
                    .setUsesChronometer(true)
                    .setChronometerCountDown(true);
        } else {
            builder.setShowWhen(false).setUsesChronometer(false);
            if (rest == SessionControl.Rest.OVER) builder.setSubText("Descanso terminado");
        }
        return builder.build();
    }

    static PendingIntent broadcast(Context context, String action, int code) {
        Intent intent = new Intent(context, SessionActionReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(context, code, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

}
