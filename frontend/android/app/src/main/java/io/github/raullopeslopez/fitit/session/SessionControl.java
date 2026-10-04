package io.github.raullopeslopez.fitit.session;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * El control del entreno sin Android dentro: qué serie registra un toque, cómo
 * la ajustan los {@code −}/{@code +} y qué texto enseñan el widget y la
 * notificación.
 *
 * <p>El control es un JSON que publica Entreno en cada serie de fuerza y que el
 * nativo actualiza con cada toque:
 *
 * <pre>
 * { workoutId, exercise, group, template: { exercise_name, reps, weight },
 *   count, restSeconds, restEndsAt, lastSetAt, restPausedMs? }
 * </pre>
 *
 * <p>{@code restEndsAt} y {@code lastSetAt} en milisegundos; {@code restEndsAt} 0
 * es «sin reloj». {@code restPausedMs}, sólo con el descanso en pausa: lo que
 * quedaba al pausarlo (y {@code restEndsAt} a 0, que en pausa no acaba nunca). {@code group} lo sigue mandando la app, pero desde la fase 5 no
 * se pinta. Escribir una serie o un ejercicio desde fuera de la app (fases 2 y 5)
 * se retiró con el rediseño de la fase 6: la notificación lleva el bloque de
 * ajuste en su sitio. Spec: docs/widgets-entreno.md y DESIGN.md, «Fuera de la app».
 */
public final class SessionControl {
    /** Sin registrar nada durante este tiempo, el control se cierra solo. */
    public static final long IDLE_MS = 2 * 60 * 60 * 1000L;

    public enum Rest { RUNNING, PAUSED, OVER, NONE }

    /** Una serie que entra en la cola, y el control como queda después. */
    public static final class Step {
        public final JSONObject entry;
        public final JSONObject control;

        Step(JSONObject entry, JSONObject control) {
            this.entry = entry;
            this.control = control;
        }
    }

    private SessionControl() {}

    /** «+1»: la plantilla otra vez, con su momento. */
    public static Step repeat(JSONObject control, long now) throws JSONException {
        JSONObject template = control.getJSONObject("template");
        JSONObject payload = new JSONObject(template.toString());
        payload.put("performed_at", Instant.ofEpochMilli(now).toString());
        payload.put("client_id", UUID.randomUUID().toString());
        JSONObject entry = new JSONObject()
                .put("tmpId", "n-" + UUID.randomUUID())
                .put("workoutId", control.getInt("workoutId"))
                .put("payload", payload);

        JSONObject after = new JSONObject(control.toString());
        after.put("count", control.optInt("count", 0) + 1);
        int restSeconds = control.optInt("restSeconds", 0);
        after.put("restEndsAt", restSeconds > 0 ? now + restSeconds * 1000L : 0);
        after.put("lastSetAt", now);
        // La pausa era de ese descanso; la serie empieza uno nuevo, corriendo.
        after.remove(PAUSED_KEY);
        return new Step(entry, after);
    }

    static final String PAUSED_KEY = "restPausedMs";

    /**
     * El botón de pausa del widget: un descanso que corre se para con lo que le
     * quedaba, y uno parado sigue desde ahí. Pasado de tiempo o sin reloj, nada.
     */
    public static JSONObject toggleRest(JSONObject control, long now) throws JSONException {
        switch (rest(control, now)) {
            case RUNNING:
                return pause(control, now);
            case PAUSED:
                return resume(control, now);
            default:
                return new JSONObject(control.toString());
        }
    }

    static JSONObject pause(JSONObject control, long now) throws JSONException {
        JSONObject after = new JSONObject(control.toString());
        if (rest(control, now) != Rest.RUNNING) return after;
        after.put(PAUSED_KEY, control.optLong("restEndsAt") - now);
        after.put("restEndsAt", 0);
        return after;
    }

    /** Reanudar: lo que quedaba, desde ahora. Sin pausa, como estaba. */
    public static JSONObject resume(JSONObject control, long now) throws JSONException {
        JSONObject after = new JSONObject(control.toString());
        if (rest(control, now) != Rest.PAUSED) return after;
        after.put("restEndsAt", now + control.optLong(PAUSED_KEY));
        after.remove(PAUSED_KEY);
        return after;
    }

    /** Lo que queda de un descanso en pausa, como el cronómetro: «01:23». */
    public static String pausedLabel(JSONObject control) {
        // Hacia arriba, como una cuenta atrás: con 0,4 s quedaba «00:01», no «00:00».
        long seconds = (control.optLong(PAUSED_KEY, 0) + 999) / 1000;
        long hours = seconds / 3600;
        String clock = String.format(java.util.Locale.ROOT, "%02d:%02d", (seconds / 60) % 60, seconds % 60);
        return hours > 0 ? hours + ":" + clock : clock;
    }

    /** Un paso de los botones de peso. */
    static final BigDecimal WEIGHT_STEP = new BigDecimal("2.5");
    private static final int MAX = 1000;

    /**
     * {@code −}/{@code +} de peso: 2,5 kg por toque, nunca por debajo de 0. No
     * registra nada: cambia la serie que registra el siguiente {@code +1}, venga
     * de donde venga. Un ejercicio sin peso se queda sin peso (ni se enseñan esos
     * botones).
     */
    public static JSONObject weight(JSONObject control, int steps) throws JSONException {
        JSONObject after = new JSONObject(control.toString());
        JSONObject template = after.getJSONObject("template");
        if (template.isNull("weight")) return after;
        BigDecimal next = BigDecimal.valueOf(template.getDouble("weight"))
                .add(WEIGHT_STEP.multiply(BigDecimal.valueOf(steps)))
                .max(BigDecimal.ZERO)
                .min(BigDecimal.valueOf(MAX));
        template.put("weight", next.doubleValue());
        return after;
    }

    /** {@code −}/{@code +} de reps: de una en una, nunca menos de 1. */
    public static JSONObject reps(JSONObject control, int steps) throws JSONException {
        JSONObject after = new JSONObject(control.toString());
        JSONObject template = after.getJSONObject("template");
        int next = Math.max(1, Math.min(MAX, template.optInt("reps", 1) + steps));
        template.put("reps", next);
        return after;
    }

    /** ¿Lleva peso la serie? Sin él, el bloque de ajuste esconde la fila de kg. */
    public static boolean hasWeight(JSONObject control) {
        JSONObject template = control.optJSONObject("template");
        return template != null && !template.isNull("weight");
    }

    /** El peso del bloque de ajuste, entre sus botones: «32,5» (la palabra «kg» va aparte). */
    public static String weightLabel(JSONObject control) {
        return hasWeight(control)
                ? kilos(control.optJSONObject("template").optDouble("weight"))
                : "";
    }

    /** Las reps del bloque de ajuste: «12» (la palabra «reps» va aparte). */
    public static String repsLabel(JSONObject control) {
        JSONObject template = control.optJSONObject("template");
        return String.valueOf(template == null ? 0 : template.optInt("reps", 0));
    }

    /** « · 1 sin enviar» detrás del contador de series, o nada si la cola está vacía. */
    public static String unsent(int queued) {
        return queued > 0 ? " · " + queued + " sin enviar" : "";
    }

    /**
     * «Press banca»: el ejercicio, sin el grupo muscular. Hasta la fase 5 era
     * «Press banca · Pecho»; el grupo ocupaba media línea para decir algo que el
     * nombre ya dice.
     */
    public static String title(JSONObject control) {
        return control.optString("exercise", "");
    }

    /** «32,5 kg × 12 · 4 series», o «8 reps · 4 series». */
    public static String line(JSONObject control) {
        return set(control) + " · " + series(control);
    }

    /** La serie que se repite: «32,5 kg × 12», o «8 reps» sin peso. */
    public static String set(JSONObject control) {
        JSONObject template = control.optJSONObject("template");
        int reps = template == null ? 0 : template.optInt("reps", 0);
        return template == null || template.isNull("weight")
                ? reps + " reps"
                : kilos(template.optDouble("weight")) + " kg × " + reps;
    }

    /** Cuántas van de este ejercicio: «1 serie», «4 series». */
    public static String series(JSONObject control) {
        int count = control.optInt("count", 0);
        return count + (count == 1 ? " serie" : " series");
    }

    /** El peso como lo escribe la app: coma decimal y sin ceros de más. */
    static String kilos(double weight) {
        return BigDecimal.valueOf(weight).stripTrailingZeros().toPlainString().replace('.', ',');
    }

    public static Rest rest(JSONObject control, long now) {
        if (control.optLong(PAUSED_KEY, 0) > 0) return Rest.PAUSED;
        long endsAt = control.optLong("restEndsAt", 0);
        if (endsAt <= 0) return Rest.NONE;
        return endsAt > now ? Rest.RUNNING : Rest.OVER;
    }

    /**
     * Lo que queda del descanso, en milésimas del descanso entero: 1000 recién
     * empezado, 0 al acabar. En pausa, lo que quedaba al pausar. Sin descanso o
     * pasado, 0. La barra del 4×1.
     */
    public static int restLeft(JSONObject control, long now) {
        long total = control.optInt("restSeconds", 0) * 1000L;
        if (total <= 0) return 0;
        long left;
        switch (rest(control, now)) {
            case RUNNING:
                left = control.optLong("restEndsAt") - now;
                break;
            case PAUSED:
                left = control.optLong(PAUSED_KEY);
                break;
            default:
                return 0;
        }
        return (int) Math.max(0, Math.min(1000, left * 1000 / total));
    }

    public static boolean expired(JSONObject control, long now) {
        return now - control.optLong("lastSetAt", now) >= IDLE_MS;
    }
}
