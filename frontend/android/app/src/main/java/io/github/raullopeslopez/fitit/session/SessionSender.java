package io.github.raullopeslopez.fitit.session;

import android.content.Context;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.OutOfQuotaPolicy;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

/**
 * Pide a WorkManager que vacíe la cola en cuanto haya red.
 *
 * <ul>
 *   <li><b>Expedited</b>: sin eso Android puede aplazarlo minutos con la pantalla
 *       apagada, y «se sube en el momento» dejaría de ser verdad. Si se acaba la
 *       cuota de trabajos urgentes, corre como uno normal en vez de no correr.
 *   <li><b>Uno detrás de otro</b> ({@code APPEND_OR_REPLACE}): una petición que
 *       llega mientras otra envía se encadena detrás. Dos envíos a la vez sobre la
 *       misma cola mandarían la misma serie dos veces.
 *   <li><b>Reintento con espera</b> exponencial desde 10 s cuando no hay red o el
 *       servidor está caído.
 * </ul>
 */
public final class SessionSender {
    static final String UNIQUE_WORK = "fitit-send-sets";

    private SessionSender() {}

    public static void schedule(Context context) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(SessionWorker.class)
                .setConstraints(new Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build())
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
                .build();
        WorkManager.getInstance(context)
                .enqueueUniqueWork(UNIQUE_WORK, ExistingWorkPolicy.APPEND_OR_REPLACE, request);
    }
}
