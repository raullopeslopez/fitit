package io.github.raullopeslopez.fitit.session;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.RemoteInput;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Lo que pasa con cada toque de la notificación, y cuando Entreno publica o
 * termina el control. Todo pasa por aquí para que la notificación, las alarmas y
 * la app nunca cuenten cosas distintas.
 */
public final class SessionController {
    private static final String PREFIX = "io.github.raullopeslopez.fitit.session.";
    public static final String ACTION_REPEAT = PREFIX + "REPEAT";
    /** El mismo +1, desde el widget: además vibra. */
    public static final String ACTION_WIDGET_REPEAT = PREFIX + "WIDGET_REPEAT";
    public static final String ACTION_OTHER = PREFIX + "OTHER";
    /** «Otro ejercicio» de la notificación: «Remo 40x10», o sólo «Remo». */
    public static final String ACTION_OTHER_EXERCISE = PREFIX + "OTHER_EXERCISE";
    /** «Otro ejercicio» del 4×2: enseña los candidatos; «Cancelar» vuelve. */
    public static final String ACTION_CHOOSE = PREFIX + "CHOOSE";
    public static final String ACTION_CHOOSE_CANCEL = PREFIX + "CHOOSE_CANCEL";
    /** Un candidato del 4×2, con su nombre en {@link #EXTRA_EXERCISE}: pasa a estar en curso. */
    public static final String ACTION_SWITCH = PREFIX + "SWITCH";
    public static final String EXTRA_EXERCISE = "fitit_exercise";
    /** Los − y + del widget 4×2: cambian la serie que se repite, no registran. */
    public static final String ACTION_WEIGHT_DOWN = PREFIX + "WEIGHT_DOWN";
    public static final String ACTION_WEIGHT_UP = PREFIX + "WEIGHT_UP";
    public static final String ACTION_REPS_DOWN = PREFIX + "REPS_DOWN";
    public static final String ACTION_REPS_UP = PREFIX + "REPS_UP";
    /** «Terminar» del widget 4×2. */
    public static final String ACTION_END = PREFIX + "END";
    public static final String ACTION_SKIP = PREFIX + "SKIP";
    public static final String ACTION_REST_OVER = PREFIX + "REST_OVER";
    public static final String ACTION_EXPIRE = PREFIX + "EXPIRE";
    public static final String KEY_OTHER = "otra_serie";

    private SessionController() {}

    /** Entreno registró una serie de fuerza: éste es el control desde ahora. */
    public static void publish(Context context, JSONObject control, long now) {
        Session.store(context).saveControl(control);
        refresh(context, control, now);
    }

    /** «Terminar»: fuera la notificación y el control. Las series no se tocan. */
    public static void end(Context context) {
        Session.store(context).clearControl();
        SessionNotification.cancel(context);
        SessionAlarms.cancel(context);
        SessionWidget.updateAll(context);
        SessionEvents.changed();
    }

    /** Saltar el descanso, desde la notificación o desde la app. */
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
                    // Lo único que vibra en toda la función: el pulgar sobre el
                    // widget no ve nada más que confirme el toque.
                    log(context, store, SessionControl.repeat(control, now), now);
                    pulse(context);
                    break;
                case ACTION_OTHER:
                case ACTION_OTHER_EXERCISE:
                    // Los dos campos entienden lo mismo: Android pinta tres
                    // botones como mucho, y con el descanso corriendo el tercero
                    // es «Saltar», así que «Otra serie» acepta también «Remo 40x10».
                    other(context, store, control, typed(intent), now);
                    break;
                case ACTION_CHOOSE:
                    adjust(context, store, SessionControl.choosing(control, true), now);
                    break;
                case ACTION_CHOOSE_CANCEL:
                    adjust(context, store, SessionControl.choosing(control, false), now);
                    break;
                case ACTION_SWITCH: {
                    JSONObject switched =
                            SessionControl.switchTo(control, intent.getStringExtra(EXTRA_EXERCISE));
                    // Un candidato que ya no está (la app publicó otra lista entre
                    // pintar y tocar): se cierra la lista y no cambia nada.
                    adjust(context, store,
                            switched != null ? switched : SessionControl.choosing(control, false), now);
                    if (switched != null) SessionEvents.changed();
                    break;
                }
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
                case ACTION_SKIP:
                    skipRest(context, now);
                    SessionEvents.changed();
                    break;
                case ACTION_REST_OVER:
                    refresh(context, control, now);
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

    private static void other(
            Context context, SessionStore store, JSONObject control, String typed, long now)
            throws JSONException {
        SessionControl.Step step = SessionControl.typed(control, typed, now);
        if (step.entry != null) {
            log(context, store, step, now);
            return;
        }
        // Nada que registrar: un aviso, o un cambio de ejercicio sin serie.
        adjust(context, store, step.control, now);
        if (!step.control.optString("exercise").equals(control.optString("exercise"))) {
            SessionEvents.changed();
        }
    }

    /**
     * La app publica a qué ejercicios se puede cambiar (al añadir uno, al
     * registrar): sólo cambia la lista del control en curso, y sólo si es de ese
     * entreno. No toca la serie, el contador ni el descanso, así que no pisa un
     * toque del widget que llegase mientras tanto.
     */
    public static void candidates(Context context, int workoutId, org.json.JSONArray list, long now) {
        SessionStore store = Session.store(context);
        JSONObject control = store.control();
        if (control == null || control.optInt("workoutId", -1) != workoutId) return;
        try {
            control.put("candidates", list);
        } catch (JSONException e) {
            return;
        }
        store.saveControl(control);
        SessionWidget.updateAll(context);
    }

    /** La app se abrió con «Nuevo…»: el 4×2 deja de enseñar la lista. */
    public static void stopChoosing(Context context, long now) {
        SessionStore store = Session.store(context);
        JSONObject control = store.control();
        if (control == null || !SessionControl.isChoosing(control)) return;
        try {
            adjust(context, store, SessionControl.choosing(control, false), now);
        } catch (JSONException e) {
            // Sin lista que cerrar.
        }
    }

    /** Un − o + del 4×2: la serie que repetirán los siguientes toques, a la vista en todas partes. */
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

    private static String typed(Intent intent) {
        Bundle results = RemoteInput.getResultsFromIntent(intent);
        if (results == null) return "";
        CharSequence text = results.getCharSequence(KEY_OTHER);
        return text == null ? "" : text.toString();
    }
}
