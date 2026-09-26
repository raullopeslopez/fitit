package io.github.raullopeslopez.fitit.session;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.List;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * El puente entre la página y la cola nativa. Lo usa {@code platform/session.js}.
 *
 * <p>La página encola, renombra y borra aquí con operaciones sueltas, nunca
 * mandando la cola entera: una foto de la cola escrita desde la página pisaría lo
 * que el nativo acaba de enviar. Tras cada cambio, y cuando un envío termina, la
 * página recibe la cola tal como la tiene el nativo, para pintar las filas «sin
 * enviar». Spec: docs/widgets-entreno.md, fase 1.
 */
@CapacitorPlugin(
        name = "FititSession",
        permissions = {
            @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
        })
public class SessionPlugin extends Plugin {
    private final SessionEvents.Listener listener = new SessionEvents.Listener() {
        @Override
        public void onSent(QueueDrainer.Outcome outcome) {
            SessionPlugin.this.onSent(outcome);
        }

        @Override
        public void onChanged() {
            // Algo entró o cambió desde la notificación: la página pinta la
            // serie nueva (pendiente) y sigue el descanso que empezó.
            JSObject data = withControl(queueOnly());
            // Sin control tras un cambio es que se terminó (widget, dos horas):
            // la página para su descanso. Un envío sin control no lo dice.
            if (store().control() == null) data.put("ended", true);
            notifyListeners("changed", data);
        }
    };

    private SessionStore store() {
        return Session.store(getContext());
    }

    @Override
    public void load() {
        SessionEvents.add(listener);
        // La app arrancó desde el widget o la notificación: la orden espera a
        // que la página se ponga a escuchar (retenida hasta entonces).
        announceLaunch(getActivity() == null ? null : getActivity().getIntent());
    }

    /** Con la app ya abierta, el mismo toque llega aquí. */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        announceLaunch(intent);
    }

    /** «Abre este entreno» o «empieza el de hoy», una sola vez: `launch`. */
    private void announceLaunch(Intent intent) {
        JSONObject order = SessionLaunch.take(intent);
        if (order == null) return;
        try {
            notifyListeners("launch", JSObject.fromJSONObject(order), true);
        } catch (JSONException e) {
            // Una orden ilegible se ignora: la app abre donde abriría.
        }
    }

    @Override
    protected void handleOnDestroy() {
        SessionEvents.remove(listener);
    }

    /** Un envío terminó: la cola que queda, lo que contestó el servidor y lo rechazado. */
    private void onSent(QueueDrainer.Outcome outcome) {
        JSObject data = withControl(withRejected(queueOnly()));
        data.put("sent", outcome.sent);
        if (outcome.lastWorkout != null) {
            try {
                data.put("workout", JSObject.fromJSONObject(outcome.lastWorkout));
            } catch (JSONException e) {
                // Sin entreno la página se queda con lo que tenía; la cola ya va.
            }
        }
        notifyListeners("changed", data);
    }

    /** La cola tal como la tiene el nativo. Lo que contesta cada operación. */
    private JSObject queueOnly() {
        List<JSONObject> queue = store().queue();
        JSObject data = new JSObject();
        data.put("queue", new JSArray(queue));
        return data;
    }

    /**
     * Y las series rechazadas desde la última vez, que se cuentan una sola vez:
     * sólo lo recogen el aviso de fin de envío y {@link #snapshot(PluginCall)}.
     * Si lo recogiera cualquier operación, la respuesta a un «encolar» se comería
     * el aviso de que el servidor rechazó una serie.
     */
    private JSObject withRejected(JSObject data) {
        data.put("rejected", store().takeRejected());
        return data;
    }

    /** Y el control en curso, o null: la página sigue su descanso. */
    private JSObject withControl(JSObject data) {
        JSONObject control = store().control();
        try {
            data.put("control", control == null ? JSONObject.NULL : JSObject.fromJSONObject(control));
        } catch (JSONException e) {
            data.put("control", JSONObject.NULL);
        }
        return data;
    }

    @PluginMethod
    public void enqueue(PluginCall call) {
        JSObject entry = call.getObject("entry");
        if (entry == null) {
            call.reject("entry is required");
            return;
        }
        try {
            store().enqueue(entry);
        } catch (JSONException e) {
            call.reject("malformed entry", e);
            return;
        }
        call.resolve(queueOnly());
    }

    /** La cola que la página tenía antes de que existiera ésta: se adopta, sin repetir. */
    @PluginMethod
    public void adopt(PluginCall call) {
        JSArray entries = call.getArray("entries", new JSArray());
        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.optJSONObject(i);
            if (entry == null) continue;
            try {
                store().enqueue(entry);
            } catch (JSONException e) {
                // Una entrada rota no puede dejar fuera a las demás.
            }
        }
        // Lo adoptado puede estar esperando desde antes de esta versión: sale ya.
        if (!store().queue().isEmpty()) SessionSender.schedule(getContext());
        call.resolve(queueOnly());
    }

    @PluginMethod
    public void drop(PluginCall call) {
        store().drop(call.getString("tmpId", ""));
        call.resolve(queueOnly());
    }

    @PluginMethod
    public void dropFor(PluginCall call) {
        store().dropFor(call.getString("name", ""));
        call.resolve(queueOnly());
    }

    @PluginMethod
    public void rename(PluginCall call) {
        try {
            store().rename(call.getString("from", ""), call.getString("to", ""));
        } catch (JSONException e) {
            call.reject("rename failed", e);
            return;
        }
        call.resolve(queueOnly());
    }

    @PluginMethod
    public void snapshot(PluginCall call) {
        call.resolve(withRejected(queueOnly()));
    }

    /** Vaciar la cola en cuanto haya red; el resultado llega como evento «changed». */
    @PluginMethod
    public void flush(PluginCall call) {
        SessionSender.schedule(getContext());
        call.resolve();
    }

    @PluginMethod
    public void setSession(PluginCall call) {
        String token = call.getString("token");
        String apiBase = call.getString("apiBase");
        if (token == null || apiBase == null) {
            call.reject("token and apiBase are required");
            return;
        }
        store().setSession(token, apiBase, call.getString("clientVersion"));
        // Un token nuevo es justo lo que esperaba una cola parada por un 401.
        SessionSender.schedule(getContext());
        call.resolve();
    }

    /** Cerrar sesión: el token y el control se van; la notificación con ellos. */
    @PluginMethod
    public void clearToken(PluginCall call) {
        store().clearToken();
        SessionController.end(getContext());
        call.resolve();
    }

    // --- El control del entreno (fase 2) -----------------------------------

    /** Entreno registró una serie de fuerza: la notificación pasa a enseñarla. */
    @PluginMethod
    public void publish(PluginCall call) {
        JSObject control = call.getObject("control");
        if (control == null) {
            call.reject("control is required");
            return;
        }
        SessionController.publish(getContext(), control, System.currentTimeMillis());
        call.resolve();
    }

    /** «Terminar entreno» en el menú de Entreno: lo mismo que «Terminar» en el widget. */
    @PluginMethod
    public void end(PluginCall call) {
        SessionController.end(getContext());
        call.resolve();
    }

    /** Saltar el descanso en la app: la notificación quita su reloj también. */
    @PluginMethod
    public void skipRest(PluginCall call) {
        SessionController.skipRest(getContext(), System.currentTimeMillis());
        call.resolve();
    }

    /**
     * El permiso de notificaciones, que Android 13+ pide una vez. Hasta 12 no es un
     * permiso que se pida: se contesta con si las notificaciones están activadas.
     */
    @PluginMethod
    public void ensureNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || getPermissionState("notifications") == PermissionState.GRANTED) {
            answerNotifications(call);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsAnswered");
    }

    @PermissionCallback
    private void notificationsAnswered(PluginCall call) {
        // Concedido después de publicar: la tarjeta que no pudo salir, sale ahora.
        JSONObject control = store().control();
        if (control != null) {
            SessionController.publish(getContext(), control, System.currentTimeMillis());
        }
        answerNotifications(call);
    }

    private void answerNotifications(PluginCall call) {
        JSObject answer = new JSObject();
        answer.put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        call.resolve(answer);
    }
}
