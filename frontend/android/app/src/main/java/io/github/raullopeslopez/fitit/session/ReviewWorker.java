package io.github.raullopeslopez.fitit.session;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import io.github.raullopeslopez.fitit.R;
import java.io.IOException;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

/**
 * Una vez al día pregunta si la revisión semanal está pendiente y, el día que
 * toca, avisa. Ver {@link ReviewScheduler} para cuándo corre.
 *
 * <p>Nunca devuelve {@code retry}: el plan gratuito de Render duerme, y un
 * reintento con espera exponencial es una tormenta de peticiones contra un
 * contenedor que tarda medio minuto en despertar. Si hoy no se pudo, mañana a las
 * 9 se vuelve a mirar, y la revisión sigue pendiente (el servidor la mantiene
 * hasta que se responde).
 *
 * <p>Sin token o con uno caducado no hace nada: cerrar sesión no tiene que
 * cancelar el trabajo, y un 401 lo arregla la app al entrar con un token nuevo.
 */
public final class ReviewWorker extends Worker {
    static final String CHANNEL = "fitit_review";
    static final String LAST_NOTIFIED = "review_last_notified";
    static final int NOTIFICATION_ID = 4102;

    private static ReviewHttp testHttp;

    public ReviewWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /** Sólo para tests: sustituye la red. {@code null} vuelve a la de verdad. */
    static synchronized void useForTests(ReviewHttp http) {
        testHttp = http;
    }

    private static synchronized ReviewHttp http() {
        return testHttp != null ? testHttp : new UrlConnectionHttp();
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SessionStore store = Session.store(context);
        String token = store.token();
        String apiBase = store.apiBase();
        if (token == null || apiBase == null || store.sessionExpired()) return Result.success();

        // Las mismas cabeceras que QueueDrainer: el servidor las trata igual.
        Map<String, String> headers = new HashMap<>();
        headers.put("Authorization", "Bearer " + token);
        String version = store.clientVersion();
        if (version != null) headers.put("X-Client-Version", version);

        QueueDrainer.Response response;
        try {
            response = http().get(apiBase + "/targets/review", headers);
        } catch (IOException e) {
            return Result.success();
        }
        // Un 401 no se apunta como «caducada»: de la sesión se ocupa la cola, y
        // la app renueva el token al entrar.
        if (response.status < 200 || response.status >= 300) return Result.success();

        SharedPreferences prefs =
                context.getSharedPreferences(SessionStore.PREFS, Context.MODE_PRIVATE);
        String reviewDate = ReviewCheck.reviewDateToNotify(
                response.body, LocalDate.now().toString(), prefs.getString(LAST_NOTIFIED, null));
        if (reviewDate == null) return Result.success();

        notifyReview(context);
        // Se apunta al avisar, no al abrirla: un aviso por revisión.
        prefs.edit().putString(LAST_NOTIFIED, reviewDate).apply();
        return Result.success();
    }

    private static void notifyReview(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(
                CHANNEL, "Revisión semanal", NotificationManager.IMPORTANCE_DEFAULT));
        manager.notify(NOTIFICATION_ID, new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_fitit)
                .setContentTitle("Revisión semanal")
                .setContentText("Tu semana está lista. ¿Ajustamos el objetivo?")
                .setAutoCancel(true)
                .setContentIntent(SessionLaunch.review(context))
                .build());
    }
}
