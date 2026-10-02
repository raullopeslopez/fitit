package io.github.raullopeslopez.fitit.session;

import android.content.Context;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.concurrent.TimeUnit;

/**
 * Programa la comprobación diaria de la revisión semanal.
 *
 * <ul>
 *   <li><b>Cada 24 h, la primera a las 9:00 locales</b> (la siguiente que llegue):
 *       el aviso es de «es domingo por la mañana», no de «cuando el sistema quiera».
 *       WorkManager no garantiza la hora exacta —Doze puede retrasarla—, pero sí que
 *       el periodo se mantiene; para un recordatorio semanal basta.
 *   <li><b>{@code KEEP}</b>: se llama cada vez que la app entrega el token, y con
 *       {@code UPDATE} cada arranque reharía el reloj: abrir la app a las 10 mandaría
 *       el aviso de las 9 a mañana. Con KEEP el trabajo que ya existe conserva su
 *       horario. Si algún día cambia la configuración, se cambia el nombre.
 *   <li><b>Con red</b>: sin ella la petición sólo fallaría.
 * </ul>
 */
public final class ReviewScheduler {
    static final String UNIQUE_WORK = "fitit_review";
    private static final LocalTime HOUR = LocalTime.of(9, 0);

    private ReviewScheduler() {}

    public static void schedule(Context context) {
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                        ReviewWorker.class, 24, TimeUnit.HOURS)
                .setConstraints(new Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build())
                .setInitialDelay(delayUntilNine(LocalDateTime.now()).toMillis(), TimeUnit.MILLISECONDS)
                .build();
        WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(UNIQUE_WORK, ExistingPeriodicWorkPolicy.KEEP, request);
    }

    /** Lo que falta hasta las 9:00 siguientes; a las 9:00 en punto, un día entero. */
    static Duration delayUntilNine(LocalDateTime now) {
        LocalDateTime next = now.toLocalDate().atTime(HOUR);
        if (!next.isAfter(now)) next = next.plusDays(1);
        return Duration.between(now, next);
    }
}
