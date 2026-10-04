package io.github.raullopeslopez.fitit.session;

import android.content.Context;
import android.content.Intent;
import android.os.VibrationEffect;
import android.os.Vibrator;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Lo que pasa con cada toque de la notificación y los widgets, y cuando Entreno
 * publica o termina el control. Todo pasa por aquí para que la notificación, las
 * alarmas y la app nunca cuenten cosas distintas.
 */
public final class SessionController {
    private static final String PREFIX = "io.github.raullopeslopez.fitit.session.";
    public static final String ACTION_REPEAT = PREFIX + "REPEAT";
    /** El mismo +1, desde el widget: además vibra. */
    public static final String ACTION_WIDGET_REPEAT = PREFIX + "WIDGET_REPEAT";
    /** Los − y + del bloque de ajuste: cambian la serie que se repite, no registran. */
    public static final String ACTION_WEIGHT_DOWN = PREFIX + "WEIGHT_DOWN";
    public static final String ACTION_WEIGHT_UP = PREFIX + "WEIGHT_UP";
    public static final String ACTION_REPS_DOWN = PREFIX + "REPS_DOWN";
    public static final String ACTION_REPS_UP = PREFIX + "REPS_UP";
    /** Pausar o reanudar el descanso, desde el 4×2 y el 3×2. */
    public static final String ACTION_REST_TOGGLE = PREFIX + "REST_TOGGLE";
    /** «Terminar» del widget. */
    public static final String ACTION_END = PREFIX + "END";
    public static final String ACTION_REST_OVER = PREFIX + "REST_OVER";
    /** Tres segundos antes del cero: la tarjeta vibra 3, 2, 1 y el cero. */
    public static final String ACTION_REST_COUNTDOWN = PREFIX + "REST_COUNTDOWN";
    public static final String ACTION_EXPIRE = PREFIX + "EXPIRE";
    /** Los puntitos del widget sin entreno: la otra pantalla. */
    public static final String ACTION_PAGE = PREFIX + "PAGE";
    /** Medianoche: «hace 2 días» pasa a 3 y los pasos de ayer dejan de ser de hoy. */
    public static final String ACTION_DAY = PREFIX + "DAY";
    /** La cuenta atrás empieza tres segundos antes del cero: 3, 2, 1 y el cero. */
    static final long COUNTDOWN_MS = 3_000;
    /**
     * Más tarde que esto, la cuenta atrás no vibra: sus pulsos son un patrón
     * fijo del canal, y medio segundo tarde ya no caen con el 3, 2, 1 del reloj.
     */
    static final long COUNTDOWN_LATE_MS = 500;
    /**
     * El repintado a positivo, después del último pulso (el cero, de 400 ms): una
     * actualización muda de la tarjeta corta la vibración que estuviera sonando.
     * Por debajo de un segundo el reloj aún dice 00:00, no −00:01.
     */
    static final long REST_OVER_DELAY_MS = 900;

    private SessionController() {}

    /** Entreno registró una serie de fuerza: éste es el control desde ahora. */
    public static void publish(Context context, JSONObject control, long now) {
        Session.store(context).saveControl(control);
        refresh(context, control, now);
    }

    /**
     * La app entra (o abre con sesión) y da su token: si los widgets decían
     * «Sesión caducada», vuelven; y la cola que esperaba sale ya.
     */
    public static void renew(Context context, String token, String apiBase, String clientVersion) {
        Session.store(context).setSession(token, apiBase, clientVersion);
        SessionWidget.updateAll(context);
        SessionSender.schedule(context);
        // Cada APK con sesión entrega el token al arrancar: ahí se programa el aviso
        // de la revisión, sin que nadie tenga que hacer nada tras actualizar.
        ReviewScheduler.schedule(context);
    }

    /**
     * Un entreno borrado en la app: sus series sin enviar se tiran y, si era el
     * del control, la notificación y los widgets vuelven a «sin entreno». Borrar
     * otro entreno no toca el que está en curso.
     */
    public static void forget(Context context, int workoutId) {
        if (Session.store(context).forgetWorkout(workoutId)) {
            end(context);
        } else {
            // Las series tiradas dejan de contar como «sin enviar».
            SessionWidget.updateAll(context);
        }
    }

    /** «Terminar»: fuera la notificación y el control. Las series no se tocan. */
    public static void end(Context context) {
        Session.store(context).clearControl();
        SessionNotification.cancel(context);
        SessionAlarms.cancel(context);
        SessionWidget.updateAll(context);
        SessionEvents.changed();
    }

    /**
     * Saltar el descanso en la app: la notificación y los widgets quitan su reloj
     * también. Fuera de la app no hay botón de saltar (DESIGN.md): registrar ya
     * empieza la serie aunque quede descanso.
     */
    public static void skipRest(Context context, long now) {
        SessionStore store = Session.store(context);
        JSONObject control = store.control();
        if (control == null) return;
        try {
            control.put("restEndsAt", 0);
        } catch (JSONException e) {
            return;
        }
        control.remove(SessionControl.PAUSED_KEY);
        store.saveControl(control);
        refresh(context, control, now);
    }

    /**
     * «Reanudar» en la app: el descanso que se pausó desde el widget sigue con lo
     * que le quedaba, y el widget y la notificación vuelven a contar.
     */
    public static void resumeRest(Context context, long now) {
        SessionStore store = Session.store(context);
        JSONObject control = store.control();
        if (control == null) return;
        try {
            restChanged(context, store, SessionControl.resume(control, now), now);
        } catch (JSONException e) {
            // Un control ilegible se queda como estaba.
        }
    }

    public static void handle(Context context, Intent intent, long now) {
        String action = intent.getAction();
        if (action == null) return;
        SessionStore store = Session.store(context);
        // Lo del widget sin entreno no tiene control al que preguntar.
        if (ACTION_PAGE.equals(action)) {
            java.time.LocalDateTime clock = java.time.LocalDateTime.now();
            store.flipIdlePage(IdleSummary.pages(
                    store.summary(), clock.toLocalDate(), IdleSummary.foodDay(clock)).size());
            SessionWidget.updateAll(context);
            return;
        }
        if (ACTION_DAY.equals(action)) {
            SessionWidget.updateAll(context);
            return;
        }
        JSONObject control = store.control();
        if (control == null) {
            // Una tarjeta que sobrevivió a su control (se cerró la sesión con la
            // notificación ya en la bandeja): se retira, sin registrar nada.
            SessionNotification.cancel(context);
            SessionAlarms.cancel(context);
            SessionWidget.updateAll(context);
            return;
        }
        try {
            switch (action) {
                case ACTION_REPEAT:
                    log(context, store, SessionControl.repeat(control, now), now);
                    break;
                case ACTION_WIDGET_REPEAT:
                    // El único toque que vibra: el pulgar sobre el widget no ve
                    // nada más que lo confirme. (El fin del descanso también
                    // vibra, pero no es un toque: SessionNotification.)
                    log(context, store, SessionControl.repeat(control, now), now);
                    pulse(context);
                    break;
                case ACTION_WEIGHT_DOWN:
                    adjust(context, store, SessionControl.weight(control, -1), now);
                    break;
                case ACTION_WEIGHT_UP:
                    adjust(context, store, SessionControl.weight(control, 1), now);
                    break;
                case ACTION_REPS_DOWN:
                    adjust(context, store, SessionControl.reps(control, -1), now);
                    break;
                case ACTION_REPS_UP:
                    adjust(context, store, SessionControl.reps(control, 1), now);
                    break;
                case ACTION_REST_TOGGLE:
                    restChanged(context, store, SessionControl.toggleRest(control, now), now);
                    break;
                case ACTION_END:
                    end(context);
                    break;
                case ACTION_REST_COUNTDOWN:
                    // La misma tarjeta, aún bajando, en el canal que vibra 3, 2, 1
                    // y el cero; si el aviso aún es verdad. Las alarmas se quedan.
                    if (countdownOnTime(control, now)) {
                        SessionNotification.show(context, control, now, true);
                    }
                    break;
                case ACTION_REST_OVER:
                    // La tarjeta pasa a positivo, ya muda: la vibración fue la cuenta atrás.
                    SessionNotification.show(context, control, now);
                    SessionAlarms.arm(context, control, now);
                    SessionWidget.updateAll(context);
                    break;
                case ACTION_EXPIRE:
                    if (SessionControl.expired(control, now)) end(context);
                    else SessionAlarms.arm(context, control, now);
                    break;
                default:
                    break;
            }
        } catch (JSONException e) {
            // Un control ilegible no se puede usar: mejor ninguno que uno roto.
            end(context);
        }
    }

    /** Un − o + del bloque de ajuste: la serie que repetirán los siguientes toques, a la vista en todas partes. */
    private static void adjust(Context context, SessionStore store, JSONObject control, long now) {
        store.saveControl(control);
        refresh(context, control, now);
    }

    /**
     * El descanso se pausó o siguió: la alarma del fin se quita o se vuelve a
     * poner (refresh), y la app, si está abierta, congela o suelta su barra.
     */
    private static void restChanged(Context context, SessionStore store, JSONObject control, long now) {
        store.saveControl(control);
        refresh(context, control, now);
        SessionEvents.changed();
    }

    /** Una serie desde fuera: a la cola, al servidor en cuanto se pueda, y a la vista. */
    private static void log(Context context, SessionStore store, SessionControl.Step step, long now)
            throws JSONException {
        store.enqueue(step.entry);
        store.saveControl(step.control);
        refresh(context, step.control, now);
        SessionSender.schedule(context);
        SessionEvents.changed();
    }

    private static void refresh(Context context, JSONObject control, long now) {
        SessionNotification.show(context, control, now);
        SessionAlarms.arm(context, control, now);
        SessionWidget.updateAll(context);
    }

    /** Corriendo y en hora: ni saltado, ni en pausa, ni tan tarde que el 3, 2, 1 mienta. */
    private static boolean countdownOnTime(JSONObject control, long now) {
        if (SessionControl.rest(control, now) != SessionControl.Rest.RUNNING) return false;
        long countdownAt = control.optLong("restEndsAt", 0) - COUNTDOWN_MS;
        return now - countdownAt <= COUNTDOWN_LATE_MS;
    }

    /** Una pulsación corta. */
    private static void pulse(Context context) {
        Vibrator vibrator = context.getSystemService(Vibrator.class);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        vibrator.vibrate(VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE));
    }
}
