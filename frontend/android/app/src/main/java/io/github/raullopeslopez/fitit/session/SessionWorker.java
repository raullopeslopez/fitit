package io.github.raullopeslopez.fitit.session;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.ForegroundInfo;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * Vacía la cola desde WorkManager, con la app abierta o no.
 *
 * <p>Sin token o con uno caducado termina con éxito y no reintenta: esperar no lo
 * arregla, lo arregla la app al entrar, que copia el token y pide otro envío.
 */
public final class SessionWorker extends Worker {
    private static final String CHANNEL = "fitit_sending";
    private static final int NOTIFICATION_ID = 4101;

    public SessionWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        QueueDrainer.Outcome outcome =
                new QueueDrainer(Session.store(getApplicationContext()), Session.http()).drain();
        // El entreno del control ya no existe: fuera la notificación y sus
        // alarmas (end también repinta los widgets).
        if (outcome.controlEnded) SessionController.end(getApplicationContext());
        // Lo enviado deja de contar como «sin enviar» en el widget 4×2.
        SessionWidget.updateAll(getApplicationContext());
        SessionEvents.publish(outcome);
        return outcome.status == QueueDrainer.Status.RETRY ? Result.retry() : Result.success();
    }

    /**
     * Sólo la pide Android 11 o anterior, que ejecuta un trabajo «expedited» como
     * servicio en primer plano y exige una notificación mientras dura. De 12 en
     * adelante no se llama y no aparece nada.
     */
    @NonNull
    @Override
    public ForegroundInfo getForegroundInfo() {
        Context context = getApplicationContext();
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(
                CHANNEL, "Envío de series", NotificationManager.IMPORTANCE_MIN));
        Notification notification = new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_sys_upload)
                .setContentTitle("Enviando series")
                .setSilent(true)
                .setOngoing(true)
                .build();
        return new ForegroundInfo(NOTIFICATION_ID, notification);
    }
}
