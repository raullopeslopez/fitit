package io.github.raullopeslopez.fitit.session;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * La cola de series del APK, y lo que el nativo necesita para enviarla solo.
 *
 * <p>En el APK ésta es la única cola: la página encola aquí, y lo que se registre
 * desde la notificación o el widget (fases 2–4) también, así que el orden es uno
 * y lo guarda el disco. Cada entrada es la misma que la de {@code fitit_outbox}
 * en la página: {@code {tmpId, workoutId, payload}}.
 *
 * <p>Todo va en un {@code SharedPreferences} privado, reescrito entero en cada
 * cambio: la cola es de unas pocas series, y un JSON entero no se queda nunca a
 * medio escribir. Spec: docs/widgets-entreno.md, fase 1.
 */
public final class SessionStore {
    static final String PREFS = "fitit_session";
    private static final String QUEUE = "queue";
    private static final String TOKEN = "token";
    private static final String API_BASE = "api_base";
    private static final String CLIENT_VERSION = "client_version";
    private static final String REJECTED = "rejected";
    private static final String CONTROL = "control";

    private final SharedPreferences prefs;
    private final TokenCipher cipher;

    public SessionStore(Context context, TokenCipher cipher) {
        this.prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        this.cipher = cipher;
    }

    // --- La cola -----------------------------------------------------------

    public synchronized List<JSONObject> queue() {
        List<JSONObject> entries = new ArrayList<>();
        try {
            JSONArray stored = new JSONArray(prefs.getString(QUEUE, "[]"));
            for (int i = 0; i < stored.length(); i++) {
                JSONObject entry = stored.optJSONObject(i);
                if (entry != null) entries.add(entry);
            }
        } catch (JSONException e) {
            // Una cola ilegible es una cola vacía, igual que en la página: no
            // hay nada que hacer con ella salvo no romper lo que venga detrás.
        }
        return entries;
    }

    public synchronized JSONObject head() {
        List<JSONObject> entries = queue();
        return entries.isEmpty() ? null : entries.get(0);
    }

    /**
     * Añade una serie al final. Si no trae {@code client_id} se lo pone: es lo que
     * permite al servidor reconocer un reintento. Un {@code tmpId} que ya está en
     * la cola no se añade otra vez; la página entrega su cola al arrancar, y
     * puede hacerlo más de una vez.
     */
    public synchronized void enqueue(JSONObject entry) throws JSONException {
        String tmpId = entry.getString("tmpId");
        List<JSONObject> entries = queue();
        for (JSONObject e : entries) {
            if (tmpId.equals(e.optString("tmpId"))) return;
        }
        JSONObject payload = entry.getJSONObject("payload");
        if (payload.optString("client_id", "").isEmpty()) {
            payload.put("client_id", UUID.randomUUID().toString());
        }
        entries.add(entry);
        write(entries);
    }

    public synchronized void drop(String tmpId) {
        List<JSONObject> left = new ArrayList<>();
        for (JSONObject e : queue()) {
            if (!tmpId.equals(e.optString("tmpId"))) left.add(e);
        }
        write(left);
    }

    /** Un ejercicio borrado con series sin enviar: mandarlas lo levantaría otra vez. */
    public synchronized void dropFor(String exerciseName) {
        List<JSONObject> left = new ArrayList<>();
        for (JSONObject e : queue()) {
            if (!exerciseName.equals(exerciseOf(e))) left.add(e);
        }
        write(left);
    }

    /** Un ejercicio renombrado: la cola lo nombra por su texto, y el servidor también. */
    public synchronized void rename(String from, String to) throws JSONException {
        List<JSONObject> entries = queue();
        for (JSONObject e : entries) {
            if (from.equals(exerciseOf(e))) {
                e.getJSONObject("payload").put("exercise_name", to);
            }
        }
        write(entries);
    }

    private static String exerciseOf(JSONObject entry) {
        JSONObject payload = entry.optJSONObject("payload");
        return payload == null ? null : payload.optString("exercise_name", null);
    }

    private void write(List<JSONObject> entries) {
        prefs.edit().putString(QUEUE, new JSONArray(entries).toString()).apply();
    }

    // --- A quién y dónde ---------------------------------------------------

    /** El token, cifrado; y a qué servidor y con qué versión hablar. */
    public synchronized void setSession(String token, String apiBase, String clientVersion) {
        SharedPreferences.Editor edit = prefs.edit()
                .putString(API_BASE, apiBase)
                .putString(CLIENT_VERSION, clientVersion);
        try {
            byte[] sealed = cipher.encrypt(token.getBytes(StandardCharsets.UTF_8));
            edit.putString(TOKEN, Base64.encodeToString(sealed, Base64.NO_WRAP));
        } catch (GeneralSecurityException e) {
            // Sin Keystore no hay token nativo: la cola espera a la app, que
            // sigue enviando como siempre. Nunca en claro.
            edit.remove(TOKEN);
        }
        edit.apply();
    }

    /** El token, o null si no hay o ya no se puede leer (y entonces se olvida). */
    public synchronized String token() {
        String stored = prefs.getString(TOKEN, null);
        if (stored == null) return null;
        try {
            byte[] plain = cipher.decrypt(Base64.decode(stored, Base64.NO_WRAP));
            return new String(plain, StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            prefs.edit().remove(TOKEN).apply();
            return null;
        }
    }

    public synchronized String apiBase() {
        return prefs.getString(API_BASE, null);
    }

    public synchronized String clientVersion() {
        return prefs.getString(CLIENT_VERSION, null);
    }

    /**
     * Cerrar sesión: el token se va, y el control con él (no puede quedar una
     * notificación de alguien que ya no está). Las series no, igual que en la web.
     */
    public synchronized void clearToken() {
        prefs.edit().remove(TOKEN).remove(CONTROL).apply();
    }

    // --- El control del entreno (fase 2) -----------------------------------

    /** El control tal como lo dejó la última serie; ver {@link SessionControl}. */
    public synchronized void saveControl(JSONObject control) {
        prefs.edit().putString(CONTROL, control.toString()).apply();
    }

    /** El control en curso, o null si no hay entreno que controlar. */
    public synchronized JSONObject control() {
        String stored = prefs.getString(CONTROL, null);
        if (stored == null) return null;
        try {
            return new JSONObject(stored);
        } catch (JSONException e) {
            return null;
        }
    }

    public synchronized void clearControl() {
        prefs.edit().remove(CONTROL).apply();
    }

    // --- Series rechazadas -------------------------------------------------

    /** Una serie que el servidor juzgó y rechazó (un 4xx que no es 401). */
    public synchronized void recordRejected() {
        prefs.edit().putInt(REJECTED, prefs.getInt(REJECTED, 0) + 1).apply();
    }

    /** Cuántas desde la última vez que alguien preguntó; y vuelve a cero. */
    public synchronized int takeRejected() {
        int count = prefs.getInt(REJECTED, 0);
        if (count > 0) prefs.edit().putInt(REJECTED, 0).apply();
        return count;
    }
}
