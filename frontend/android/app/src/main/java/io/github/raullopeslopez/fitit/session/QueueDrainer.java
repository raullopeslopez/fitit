package io.github.raullopeslopez.fitit.session;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Vacía la cola contra {@code POST /workouts/{id}/sets}, la más antigua primero.
 *
 * <p>Las reglas son las de {@code retryable()} en {@code offline.js}, para que la
 * web y el APK decidan igual:
 *
 * <ul>
 *   <li>2xx: enviada (un 200 es el servidor reconociendo un reintento por su
 *       {@code client_id}), sale de la cola.
 *   <li>Sin red, 5xx, 429, 408: se para y pide reintento. Lo de detrás conserva
 *       su sitio, porque {@code set_index} se asigna al llegar.
 *   <li>401: se para y espera a un token nuevo; reintentar con el mismo no sirve.
 *       Lo apunta ({@link SessionStore#markExpired()}) para que los widgets lo digan.
 *   <li>Otro 4xx: el servidor la juzgó y la rechazó. Sale de la cola y se cuenta,
 *       o bloquearía todo lo de detrás para siempre.
 * </ul>
 *
 * <p>Relee la cabeza en cada vuelta: lo que se encola mientras envía sale en el
 * mismo envío. Sin Android dentro, salvo lo que ya trae {@link SessionStore}, para
 * que se pueda probar con un servidor de mentira.
 */
public final class QueueDrainer {

    /** Lo único que necesita de la red. */
    public interface Http {
        Response post(String url, Map<String, String> headers, String body) throws IOException;
    }

    public static final class Response {
        final int status;
        final String body;

        public Response(int status, String body) {
            this.status = status;
            this.body = body;
        }
    }

    public enum Status {
        /** La cola quedó vacía. */
        DONE,
        /** Algo merece otro intento más tarde (red, servidor caído). */
        RETRY,
        /** No se puede enviar hasta que la app dé un token (no hay, o caducó). */
        WAIT
    }

    public static final class Outcome {
        public final Status status;
        public final int sent;
        public final int rejected;
        /** El entreno con el que contestó el servidor al último envío, o null. */
        public final JSONObject lastWorkout;

        Outcome(Status status, int sent, int rejected, JSONObject lastWorkout) {
            this.status = status;
            this.sent = sent;
            this.rejected = rejected;
            this.lastWorkout = lastWorkout;
        }
    }

    private final SessionStore store;
    private final Http http;

    public QueueDrainer(SessionStore store, Http http) {
        this.store = store;
        this.http = http;
    }

    public Outcome drain() {
        int sent = 0;
        int rejected = 0;
        JSONObject lastWorkout = null;
        for (;;) {
            JSONObject entry = store.head();
            if (entry == null) return new Outcome(Status.DONE, sent, rejected, lastWorkout);

            String token = store.token();
            String apiBase = store.apiBase();
            if (token == null || apiBase == null) {
                return new Outcome(Status.WAIT, sent, rejected, lastWorkout);
            }

            String tmpId = entry.optString("tmpId");
            JSONObject payload = entry.optJSONObject("payload");
            if (payload == null) {
                // Una entrada sin serie no se puede enviar nunca.
                store.drop(tmpId);
                continue;
            }

            Map<String, String> headers = new HashMap<>();
            headers.put("Content-Type", "application/json");
            headers.put("Authorization", "Bearer " + token);
            String version = store.clientVersion();
            if (version != null) headers.put("X-Client-Version", version);
            String url = apiBase + "/workouts/" + entry.optInt("workoutId") + "/sets";

            Response response;
            try {
                response = http.post(url, headers, payload.toString());
            } catch (IOException e) {
                return new Outcome(Status.RETRY, sent, rejected, lastWorkout);
            }

            int status = response.status;
            if (status >= 200 && status < 300) {
                store.drop(tmpId);
                sent++;
                JSONObject workout = parse(response.body);
                if (workout != null) lastWorkout = workout;
            } else if (status == 401) {
                store.markExpired();
                return new Outcome(Status.WAIT, sent, rejected, lastWorkout);
            } else if (status >= 500 || status == 429 || status == 408) {
                return new Outcome(Status.RETRY, sent, rejected, lastWorkout);
            } else {
                store.drop(tmpId);
                store.recordRejected();
                rejected++;
            }
        }
    }

    private static JSONObject parse(String body) {
        if (body == null || body.isEmpty()) return null;
        try {
            return new JSONObject(body);
        } catch (JSONException e) {
            return null;
        }
    }
}
