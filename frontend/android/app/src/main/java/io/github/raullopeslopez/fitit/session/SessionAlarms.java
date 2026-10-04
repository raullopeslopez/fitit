package io.github.raullopeslopez.fitit.session;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.os.Build;
import java.time.LocalDate;
import java.time.ZoneId;
import org.json.JSONObject;

/**
 * Las dos horas del control: el fin del descanso (para repintar «Descanso
 * terminado») y el cierre a las dos horas sin series.
 *
 * <p>Con descanso son tres: la cuenta atrás tres segundos antes del cero (vibra
 * 3, 2, 1 y el cero), el repintado a positivo justo después, y el cierre.
 *
 * <p>Las tres despiertan en reposo. Las del fin del descanso son <b>exactas</b>
 * ({@code setExactAndAllowWhileIdle}, permiso {@code USE_EXACT_ALARM}): la
 * inexacta, con el teléfono bloqueado, llegaba más de un minuto tarde y entonces
 * la tarjeta no vibraba (0.13.1). Si Android no deja programarla exacta, vuelve a
 * la inexacta: el reloj se repinta igual, tarde. El cierre a las dos horas sigue
 * inexacto; ahí un minuto no se nota. Spec: docs/widgets-entreno.md.
 */
final class SessionAlarms {
    private SessionAlarms() {}

    static void arm(Context context, JSONObject control, long now) {
        cancel(context);
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        long restEndsAt = control.optLong("restEndsAt", 0);
        if (restEndsAt > now) {
            // La cuenta atrás vibra 3, 2, 1 y el cero; sólo si queda tiempo para
            // contarla entera. El repintado a positivo va después del último pulso.
            long countdownAt = restEndsAt - SessionController.COUNTDOWN_MS;
            if (countdownAt > now) armExact(context, alarms, countdownAt, countdown(context));
            armExact(context, alarms, restEndsAt + SessionController.REST_OVER_DELAY_MS, restOver(context));
        }
        long lastSetAt = control.optLong("lastSetAt", now);
        alarms.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP, lastSetAt + SessionControl.IDLE_MS, expire(context));
    }

    private static void armExact(Context context, AlarmManager alarms, long at, PendingIntent intent) {
        // Antes de Android 12 no hace falta permiso; desde ahí, el del manifiesto.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()) {
            try {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent);
                return;
            } catch (SecurityException e) {
                // Permiso retirado entre la pregunta y la alarma: la inexacta.
            }
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent);
    }

    static void cancel(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        alarms.cancel(countdown(context));
        alarms.cancel(restOver(context));
        alarms.cancel(expire(context));
        cancelBarTick(context);
    }

    /**
     * El próximo repintado de la barra del 4×1 (0.17.0). Inexacta y sin despertar
     * al teléfono: con la pantalla apagada nadie la mira, y al encenderla llega.
     */
    static void armBarTick(Context context, long at) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms == null) return;
        alarms.set(AlarmManager.RTC, at, barTick(context));
    }

    static void cancelBarTick(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms != null) alarms.cancel(barTick(context));
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

    private static PendingIntent countdown(Context context) {
        return SessionNotification.broadcast(context, SessionController.ACTION_REST_COUNTDOWN, 14);
    }

    private static PendingIntent restOver(Context context) {
        return SessionNotification.broadcast(context, SessionController.ACTION_REST_OVER, 10);
    }

    private static PendingIntent barTick(Context context) {
        return SessionNotification.broadcast(context, SessionController.ACTION_BAR_TICK, 15);
    }

    private static PendingIntent expire(Context context) {
        return SessionNotification.broadcast(context, SessionController.ACTION_EXPIRE, 11);
    }
}
