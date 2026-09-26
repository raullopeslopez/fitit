package io.github.raullopeslopez.fitit.session;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * El control del entreno sin Android dentro: qué serie registra un toque, cómo se
 * lee «Otra serie» y qué texto enseña la notificación.
 *
 * <p>El control es un JSON que publica Entreno en cada serie de fuerza y que el
 * nativo actualiza con cada toque:
 *
 * <pre>
 * { workoutId, exercise, group, template: { exercise_name, reps, weight },
 *   count, restSeconds, restEndsAt, lastSetAt, notice? }
 * </pre>
 *
 * <p>{@code restEndsAt} y {@code lastSetAt} en milisegundos; {@code restEndsAt} 0
 * es «sin reloj». {@code notice} es el aviso de una entrada que no se entendió, y
 * dura hasta la siguiente serie. Spec: docs/widgets-entreno.md, «1 · Notificación
 * en curso».
 */
public final class SessionControl {
    /** Sin registrar nada durante este tiempo, el control se cierra solo. */
    public static final long IDLE_MS = 2 * 60 * 60 * 1000L;

    // 32,5x12 · 32.5x12 · 32,5 x 12 · 32,5×12 · o sólo 12 (las reps).
    private static final Pattern ENTRY =
            Pattern.compile("^(?:(\\d+(?:[.,]\\d+)?)\\s*[xX×]\\s*)?(\\d+)$");

    public enum Rest { RUNNING, OVER, NONE }

    /** Una serie que entra en la cola, y el control como queda después. */
    public static final class Step {
        public final JSONObject entry;
        public final JSONObject control;

        Step(JSONObject entry, JSONObject control) {
            this.entry = entry;
            this.control = control;
        }
    }

    /** Lo que se leyó de «Otra serie»: reps y peso, o por qué no. */
    public static final class Parsed {
        public final int reps;
        public final Double weight;
        public final String error;

        Parsed(int reps, Double weight, String error) {
            this.reps = reps;
            this.weight = weight;
            this.error = error;
        }
    }

    private SessionControl() {}

    /** «+1 serie»: la plantilla otra vez, con su momento. */
    public static Step repeat(JSONObject control, long now) throws JSONException {
        JSONObject template = control.getJSONObject("template");
        return log(control, template, now);
    }

    /** «Otra serie» ya leída: esa serie, y pasa a ser la que repite el siguiente toque. */
    public static Step other(JSONObject control, Parsed parsed, long now) throws JSONException {
        JSONObject template = new JSONObject(control.getJSONObject("template").toString());
        template.put("reps", parsed.reps);
        template.put("weight", parsed.weight == null ? JSONObject.NULL : parsed.weight);
        return log(control, template, now);
    }

    private static Step log(JSONObject control, JSONObject template, long now)
            throws JSONException {
        JSONObject payload = new JSONObject(template.toString());
        payload.put("performed_at", Instant.ofEpochMilli(now).toString());
        payload.put("client_id", UUID.randomUUID().toString());
        JSONObject entry = new JSONObject()
                .put("tmpId", "n-" + UUID.randomUUID())
                .put("workoutId", control.getInt("workoutId"))
                .put("payload", payload);

        JSONObject after = new JSONObject(control.toString());
        after.put("template", template);
        after.put("count", control.optInt("count", 0) + 1);
        int restSeconds = control.optInt("restSeconds", 0);
        after.put("restEndsAt", restSeconds > 0 ? now + restSeconds * 1000L : 0);
        after.put("lastSetAt", now);
        after.remove("notice");
        return new Step(entry, after);
    }

    /** Un paso de los botones de peso del widget 4×2. */
    static final BigDecimal WEIGHT_STEP = new BigDecimal("2.5");
    private static final int MAX = 1000;

    /**
     * {@code −}/{@code +} de peso en el 4×2: 2,5 kg por toque, nunca por debajo de 0.
     * No registra nada: cambia la serie que registra el siguiente toque, sea
     * «Registrar serie», «+1 serie» de la notificación o del 4×1. Un ejercicio sin
     * peso se queda sin peso (el widget ni enseña esos botones).
     */
    public static JSONObject weight(JSONObject control, int steps) throws JSONException {
        JSONObject after = adjusting(control);
        JSONObject template = after.getJSONObject("template");
        if (template.isNull("weight")) return after;
        BigDecimal next = BigDecimal.valueOf(template.getDouble("weight"))
                .add(WEIGHT_STEP.multiply(BigDecimal.valueOf(steps)))
                .max(BigDecimal.ZERO)
                .min(BigDecimal.valueOf(MAX));
        template.put("weight", next.doubleValue());
        return after;
    }

    /** {@code −}/{@code +} de reps en el 4×2: de una en una, nunca menos de 1. */
    public static JSONObject reps(JSONObject control, int steps) throws JSONException {
        JSONObject after = adjusting(control);
        JSONObject template = after.getJSONObject("template");
        int next = Math.max(1, Math.min(MAX, template.optInt("reps", 1) + steps));
        template.put("reps", next);
        return after;
    }

    // Una copia, para que quien ajusta no toque el control que le dieron. El aviso de
    // una entrada mal escrita se va: ya hay otra serie a la vista.
    private static JSONObject adjusting(JSONObject control) throws JSONException {
        JSONObject after = new JSONObject(control.toString());
        after.remove("notice");
        return after;
    }

    /** ¿Lleva peso la serie? Sin él, el 4×2 esconde los botones de kg. */
    public static boolean hasWeight(JSONObject control) {
        JSONObject template = control.optJSONObject("template");
        return template != null && !template.isNull("weight");
    }

    /** El peso del 4×2, entre sus botones: «32,5 kg». */
    public static String kilosLabel(JSONObject control) {
        return hasWeight(control)
                ? kilos(control.optJSONObject("template").optDouble("weight")) + " kg"
                : "";
    }

    /** Las reps del 4×2, entre sus botones: «12» (la palabra «reps» va aparte). */
    public static String repsLabel(JSONObject control) {
        JSONObject template = control.optJSONObject("template");
        return String.valueOf(template == null ? 0 : template.optInt("reps", 0));
    }

    /** « · 1 sin enviar» detrás del contador de series, o nada si la cola está vacía. */
    public static String unsent(int queued) {
        return queued > 0 ? " · " + queued + " sin enviar" : "";
    }

    /**
     * Lee «Otra serie». Un número solo son las reps y conserva el peso de la
     * plantilla (sin peso en un ejercicio que no lo lleva).
     */
    public static Parsed parse(String typed, JSONObject template) {
        String text = typed == null ? "" : typed.trim();
        Matcher m = ENTRY.matcher(text);
        if (m.matches()) {
            try {
                int reps = Integer.parseInt(m.group(2));
                Double weight = m.group(1) != null
                        ? Double.valueOf(m.group(1).replace(',', '.'))
                        : (template.isNull("weight") ? null : template.optDouble("weight"));
                boolean ok = reps >= 1 && reps <= 1000
                        && (weight == null || (weight >= 0 && weight <= 1000));
                if (ok) return new Parsed(reps, weight, null);
            } catch (NumberFormatException e) {
                // Cae al aviso de abajo.
            }
        }
        return new Parsed(0, null, "No entendí «" + text + "». Escríbela como 32,5x12.");
    }

    /** «Press banca · Pecho», o sólo el ejercicio si no se sabe el grupo. */
    public static String title(JSONObject control) {
        String exercise = control.optString("exercise", "");
        String group = control.isNull("group") ? "" : control.optString("group", "");
        return group.isEmpty() ? exercise : exercise + " · " + group;
    }

    /** «32,5 kg × 12 · 4 series», «8 reps · 4 series», o el aviso si lo hay. */
    public static String line(JSONObject control) {
        String notice = control.optString("notice", "");
        if (!notice.isEmpty()) return notice;
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
        long endsAt = control.optLong("restEndsAt", 0);
        if (endsAt <= 0) return Rest.NONE;
        return endsAt > now ? Rest.RUNNING : Rest.OVER;
    }

    public static boolean expired(JSONObject control, long now) {
        return now - control.optLong("lastSetAt", now) >= IDLE_MS;
    }
}
