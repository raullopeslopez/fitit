package io.github.raullopeslopez.fitit.session;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import io.github.raullopeslopez.fitit.R;
import org.json.JSONObject;

/**
 * El aviso de fin de descanso: suena y vibra una vez cuando el descanso llega a
 * cero, y se va solo. Es una notificación aparte de la tarjeta del entreno, en su
 * propio canal, porque la tarjeta se reescribe con cada serie y tiene que seguir
 * muda; quien lo quiera callado lo apaga en Ajustes → Fitit → «Fin del descanso»
 * sin perder la tarjeta. Spec: docs/widgets-entreno.md, «Fin del descanso con
 * sonido».
 *
 * <p>Lo dispara la misma alarma inexacta que repinta el reloj. Si llega más de
 * {@link #LATE_MS} tarde (teléfono en reposo), no suena: un pitido a destiempo da la
 * hora equivocada, y eso es peor que no darla.
 */
final class RestChime {
    // No «fitit-fin-descanso»: ése es el del aviso retirado en la fase 0, y
    // SessionNotification lo borra cada vez que pinta la tarjeta.
    static final String CHANNEL = "fitit_fin_descanso";
    static final int ID = 4103;
    static final long LATE_MS = 60_000;
    /** Lo justo para oírlo y verlo; luego la tarjeta vuelve a ser lo único. */
    private static final long VISIBLE_MS = 15_000;
    private static final long[] VIBRATION = {0, 250, 150, 250};

    private RestChime() {}

    /** La alarma de fin de descanso sonó a las {@code now}: avisa si toca. */
    static void ring(Context context, JSONObject control, long now) {
        long restEndsAt = control.optLong("restEndsAt", 0);
        // Saltado (0), aún corriendo, o demasiado tarde para que el aviso sea verdad.
        if (restEndsAt <= 0 || now < restEndsAt || now - restEndsAt > LATE_MS) return;
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        ensureChannel(context);
        if (!manager.areNotificationsEnabled()) return;
        try {
            manager.notify(ID, build(context, control));
        } catch (SecurityException e) {
            // Permiso retirado entre la comprobación y el aviso: igual que sin él.
        }
    }

    static void cancel(Context context) {
        NotificationManagerCompat.from(context).cancel(ID);
    }

    private static void ensureChannel(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(
                CHANNEL, "Fin del descanso", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Suena y vibra una vez cuando acaba el descanso entre series.");
        channel.setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
        channel.enableVibration(true);
        channel.setVibrationPattern(VIBRATION);
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    private static Notification build(Context context, JSONObject control) {
        return new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_fitit)
                .setContentTitle("Descanso terminado")
                .setContentText(SessionControl.title(control))
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setTimeoutAfter(VISIBLE_MS)
                .setContentIntent(SessionLaunch.open(context, control.optInt("workoutId", -1)))
                .build();
    }
}
