package io.github.raullopeslopez.fitit.session;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import java.time.LocalDate;
import java.time.ZoneId;
import org.json.JSONObject;

/**
 * Las dos horas del control: el fin del descanso (para repintar «Descanso
 * terminado») y el cierre a las dos horas sin series.
 *
 * <p>Alarmas inexactas que despiertan en reposo ({@code setAndAllowWhileIdle}): no
 * hace falta el permiso de alarma exacta, y un minuto de retraso sólo se ve como
 * el reloj pasando de cero un rato. Spec: docs/widgets-entreno.md, «Cómo se
 * construye».
 */
final class SessionAlarms {
    private SessionAlarms() {}

    static void arm(Context context, JSONObject control, long now) {
        cancel(context);
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        long restEndsAt = control.optLong("restEndsAt", 0);
        if (restEndsAt > now) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, restEndsAt, restOver(context));
        }
        long lastSetAt = control.optLong("lastSetAt", now);
        alarms.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP, lastSetAt + SessionControl.IDLE_MS, expire(context));
    }

    static void cancel(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        alarms.cancel(restOver(context));
        alarms.cancel(expire(context));
    }

    /**
     * Repintar los widgets a medianoche, para lo que depende del día (IdleSummary).
     * Sin despertar al teléfono: si duerme, lo verá quien lo desbloquee, y es
     * entonces cuando repinta.
     */
    static void armDay(Context context, long now) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms == null) return;
        ZoneId zone = ZoneId.systemDefault();
        long midnight = java.time.Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
                .plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli();
        alarms.set(AlarmManager.RTC, midnight,
                SessionNotification.broadcast(context, SessionController.ACTION_DAY, 12));
    }

    private static PendingIntent restOver(Context context) {
        return SessionNotification.broadcast(context, SessionController.ACTION_REST_OVER, 10);
    }

    private static PendingIntent expire(Context context) {
        return SessionNotification.broadcast(context, SessionController.ACTION_EXPIRE, 11);
    }
}
