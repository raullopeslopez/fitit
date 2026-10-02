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
     * Repintar los widgets al cambiar de día, para lo que depende de él (IdleSummary).
     * Sin despertar al teléfono: si duerme, lo verá quien lo desbloquee, y es
     * entonces cuando repinta.
     */
    static void armDay(Context context, long now) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms == null) return;
        alarms.set(AlarmManager.RTC, nextDayEdge(now, ZoneId.systemDefault()),
                SessionNotification.broadcast(context, SessionController.ACTION_DAY, 12));
    }

    /**
     * El próximo cambio de día que el widget tiene que ver: las 04:00, cuando
     * empieza el día de comida, o medianoche, cuando cambian los pasos y «hace 2
     * días». La alarma vuelve a armarse al repintar, así que basta con la próxima.
     */
    static long nextDayEdge(long now, ZoneId zone) {
        java.time.ZonedDateTime at = java.time.Instant.ofEpochMilli(now).atZone(zone);
        java.time.ZonedDateTime four = at.toLocalDate().atTime(4, 0).atZone(zone);
        if (at.isBefore(four)) return four.toInstant().toEpochMilli();
        return at.toLocalDate().plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli();
    }

    private static PendingIntent restOver(Context context) {
        return SessionNotification.broadcast(context, SessionController.ACTION_REST_OVER, 10);
    }

    private static PendingIntent expire(Context context) {
        return SessionNotification.broadcast(context, SessionController.ACTION_EXPIRE, 11);
    }
}
