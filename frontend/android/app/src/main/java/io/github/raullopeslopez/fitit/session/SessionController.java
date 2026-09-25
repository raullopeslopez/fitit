package io.github.raullopeslopez.fitit.session;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
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
    public static final String ACTION_OTHER = PREFIX + "OTHER";
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
            return;
        }
        try {
            switch (action) {
                case ACTION_REPEAT:
                    log(context, store, SessionControl.repeat(control, now), now);
                    break;
                case ACTION_OTHER:
                    other(context, store, control, typed(intent), now);
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
        SessionControl.Parsed parsed =
                SessionControl.parse(typed, control.getJSONObject("template"));
        if (parsed.error != null) {
            control.put("notice", parsed.error);
            store.saveControl(control);
            refresh(context, control, now);
            return;
        }
        log(context, store, SessionControl.other(control, parsed, now), now);
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
    }

    private static String typed(Intent intent) {
        Bundle results = RemoteInput.getResultsFromIntent(intent);
        if (results == null) return "";
        CharSequence text = results.getCharSequence(KEY_OTHER);
        return text == null ? "" : text.toString();
    }
}
