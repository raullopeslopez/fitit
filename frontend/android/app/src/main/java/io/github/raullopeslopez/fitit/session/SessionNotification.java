package io.github.raullopeslopez.fitit.session;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;
import io.github.raullopeslopez.fitit.R;
import org.json.JSONObject;

/**
 * La notificación en curso: pantalla de bloqueo y bandeja.
 *
 * <pre>
 * Fitit · Press banca
 * 32,5 kg × 12 · 4 series                    01:23
 * [ +1 serie ]   [ Otra serie ]   [ Saltar ]            (descansando)
 * [ +1 serie ]   [ Otra serie ]   [ Otro ejercicio ]    (sin descanso)
 * </pre>
 *
 * <p>La cuenta atrás es el cronómetro de la propia notificación: nadie la reescribe
 * cada segundo. Al acabar, la alarma de fin de descanso la repinta con «Descanso
 * terminado» y sin «Saltar». Canal silencioso: ni suena ni vibra. Plantilla
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
                .addAction(0, "+1 serie", broadcast(context, SessionController.ACTION_REPEAT, 1, false))
                .addAction(otherSet(context));

        SessionControl.Rest rest = SessionControl.rest(control, now);
        if (rest == SessionControl.Rest.RUNNING) {
            builder.setWhen(control.optLong("restEndsAt"))
                    .setShowWhen(true)
                    .setUsesChronometer(true)
                    .setChronometerCountDown(true)
                    .addAction(0, "Saltar", broadcast(context, SessionController.ACTION_SKIP, 3, false));
        } else {
            // Android pinta tres botones como mucho (el cuarto se pierde sin
            // aviso): el tercero es «Saltar» mientras corre el descanso y «Otro
            // ejercicio» el resto del tiempo. «Otra serie» entiende también
            // «Remo 40x10», así que cambiar se puede siempre.
            builder.setShowWhen(false).setUsesChronometer(false).addAction(otherExercise(context));
            if (rest == SessionControl.Rest.OVER) builder.setSubText("Descanso terminado");
        }
        return builder.build();
    }

    /** «Otro ejercicio»: el nombre y la serie, como «Remo 40x10», o sólo el nombre. */
    private static NotificationCompat.Action otherExercise(Context context) {
        RemoteInput input = new RemoteInput.Builder(SessionController.KEY_OTHER)
                .setLabel("Ejercicio y serie, como Remo 40x10")
                .build();
        return new NotificationCompat.Action.Builder(
                        0, "Otro ejercicio",
                        broadcast(context, SessionController.ACTION_OTHER_EXERCISE, 4, true))
                .addRemoteInput(input)
                .setAllowGeneratedReplies(false)
                .build();
    }

    /** «Otra serie»: el campo de texto de la notificación, como contestar un mensaje. */
    private static NotificationCompat.Action otherSet(Context context) {
        RemoteInput input = new RemoteInput.Builder(SessionController.KEY_OTHER)
                .setLabel("Peso x reps, como 32,5x12")
                .build();
        // Mutable: Android escribe lo tecleado dentro del intent.
        return new NotificationCompat.Action.Builder(
                        0, "Otra serie", broadcast(context, SessionController.ACTION_OTHER, 2, true))
                .addRemoteInput(input)
                .setAllowGeneratedReplies(false)
                .build();
    }

    static PendingIntent broadcast(Context context, String action, int code, boolean mutable) {
        Intent intent = new Intent(context, SessionActionReceiver.class).setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (mutable ? PendingIntent.FLAG_MUTABLE : PendingIntent.FLAG_IMMUTABLE);
        return PendingIntent.getBroadcast(context, code, intent, flags);
    }

}
