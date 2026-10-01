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
    /** «Terminar» del widget. */
    public static final String ACTION_END = PREFIX + "END";
    public static final String ACTION_REST_OVER = PREFIX + "REST_OVER";
    public static final String ACTION_EXPIRE = PREFIX + "EXPIRE";
    /** Los puntitos del widget sin entreno: la otra pantalla. */
    public static final String ACTION_PAGE = PREFIX + "PAGE";
    /** Medianoche: «hace 2 días» pasa a 3 y los pasos de ayer dejan de ser de hoy. */
    public static final String ACTION_DAY = PREFIX + "DAY";

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
        RestChime.cancel(context);
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
        store.saveControl(control);
        refresh(context, control, now);
    }

    public static void handle(Context context, Intent intent, long now) {
        String action = intent.getAction();
        if (action == null) return;
        SessionStore store = Session.store(context);
        // Lo del widget sin entreno no tiene control al que preguntar.
        if (ACTION_PAGE.equals(action)) {
            store.flipIdlePage();
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
                    // vibra, pero es aviso, no toque: RestChime.)
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
                case ACTION_END:
                    end(context);
                    break;
                case ACTION_REST_OVER:
                    refresh(context, control, now);
                    RestChime.ring(context, control, now);
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

    /** Una pulsación corta. */
    private static void pulse(Context context) {
        Vibrator vibrator = context.getSystemService(Vibrator.class);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        vibrator.vibrate(VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE));
    }
}
