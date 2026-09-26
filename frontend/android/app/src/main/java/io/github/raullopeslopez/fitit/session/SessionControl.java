package io.github.raullopeslopez.fitit.session;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
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
 *   count, restSeconds, restEndsAt, lastSetAt, notice?,
 *   candidates?: [{ exercise, template | null, count }] }
 * </pre>
 *
 * <p>{@code restEndsAt} y {@code lastSetAt} en milisegundos; {@code restEndsAt} 0
 * es «sin reloj». {@code notice} es el aviso de una entrada que no se entendió, y
 * dura hasta la siguiente serie. {@code group} lo sigue mandando la app, pero desde
 * la fase 5 no se pinta. {@code candidates} son los ejercicios a los que se puede
 * cambiar escribiendo sólo el nombre en la notificación (los publica la app: el
 * nativo no tiene red para elegir). Spec: docs/widgets-entreno.md, «1 · Notificación en curso» y fase 5.
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

    // --- Cambiar de ejercicio (fase 5) -------------------------------------

    /** Cuántos candidatos cuentan (los que cabían en la lista del 4×2, ya retirada). */
    static final int CANDIDATES = 4;
    /** Lo que repite un candidato sin marca: 10 reps y sin peso (ver {@link #switchTo}). */
    static final int DEFAULT_REPS = 10;

    // «Remo 40x10», «Remo 40,5 x 10», «Remo 10» o sólo «Remo». El nombre lleva al
    // menos dos letras seguidas: «40x10» o «x10» a secas son «Otra serie» (bien o
    // mal escrita), no un ejercicio que se llame «x».
    private static final Pattern NAMED = Pattern.compile(
            "^(.*?\\p{L}{2}.*?)(?:\\s+(?:(\\d+(?:[.,]\\d+)?)\\s*[xX×]\\s*)?(\\d+))?$");

    static final String UNKNOWN_NAME = "Escríbelo con la serie, como Remo 40x10.";

    /**
     * Los ejercicios a los que se puede cambiar, en el orden que publicó la app,
     * sin el que está en curso y como mucho {@link #CANDIDATES}.
     */
    public static List<JSONObject> candidates(JSONObject control) {
        List<JSONObject> list = new ArrayList<>();
        JSONArray all = control.optJSONArray("candidates");
        if (all == null) return list;
        String current = fold(control.optString("exercise", ""));
        for (int i = 0; i < all.length() && list.size() < CANDIDATES; i++) {
            JSONObject candidate = all.optJSONObject(i);
            if (candidate == null) continue;
            String name = candidate.optString("exercise", "");
            if (name.isEmpty() || fold(name).equals(current)) continue;
            list.add(candidate);
        }
        return list;
    }

    /** La marca de un candidato: «40 kg × 10», «8 reps», o nada si no la tiene. */
    public static String mark(JSONObject candidate) {
        return candidate.optJSONObject("template") == null ? "" : set(candidate);
    }

    /**
     * Tocar un candidato: pasa a ser el ejercicio en curso **sin registrar nada**.
     * Su plantilla es su marca; sin marca, {@link #DEFAULT_REPS} reps y sin peso
     * (un peso inventado se registraría con el primer «+1 serie», y sin peso al
     * menos no miente: se corrige con «Otra serie»). Las series que cuenta son las
     * que ya lleva en este entreno. El descanso sigue, y el cierre de dos horas no
     * se mueve: cambiar no es entrenar. El de antes pasa a ser candidato, para
     * poder volver. Null si no es un candidato.
     */
    public static JSONObject switchTo(JSONObject control, String exercise) throws JSONException {
        JSONObject chosen = null;
        for (JSONObject candidate : candidates(control)) {
            if (fold(candidate.optString("exercise")).equals(fold(exercise))) chosen = candidate;
        }
        if (chosen == null) return null;
        String name = chosen.getString("exercise");
        JSONObject template = chosen.optJSONObject("template");
        template = template == null
                ? new JSONObject().put("reps", DEFAULT_REPS).put("weight", JSONObject.NULL)
                : new JSONObject(template.toString());
        template.put("exercise_name", name);
        return become(control, name, template, chosen.optInt("count", 0));
    }

    // El control con otro ejercicio en curso. El que deja pasa a la lista: detrás
    // de los que aún no tienen series (lo que queda por hacer va primero, como en
    // la app) y delante de los ya hechos, porque es el último que se hizo.
    private static JSONObject become(JSONObject control, String name, JSONObject template, int count)
            throws JSONException {
        JSONObject after = new JSONObject(control.toString());
        JSONObject previous = new JSONObject()
                .put("exercise", control.optString("exercise", ""))
                .put("template", new JSONObject(control.getJSONObject("template").toString()))
                .put("count", control.optInt("count", 0));

        List<JSONObject> rest = new ArrayList<>();
        JSONArray all = control.optJSONArray("candidates");
        for (int i = 0; all != null && i < all.length(); i++) {
            JSONObject candidate = all.optJSONObject(i);
            if (candidate == null) continue;
            String other = fold(candidate.optString("exercise", ""));
            if (other.equals(fold(name)) || other.equals(fold(previous.getString("exercise")))) continue;
            rest.add(candidate);
        }
        int at = 0;
        if (previous.getInt("count") > 0) {
            while (at < rest.size() && rest.get(at).optInt("count", 0) == 0) at++;
        }
        if (!previous.getString("exercise").isEmpty()) rest.add(at, previous);
        JSONArray candidates = new JSONArray();
        for (JSONObject candidate : rest) candidates.put(candidate);

        after.put("exercise", name);
        after.put("template", template);
        after.put("count", count);
        after.put("candidates", candidates);
        after.remove("group");
        after.remove("notice");
        return after;
    }

    /**
     * Lo escrito en «Otro ejercicio» (y en «Otra serie», que entiende lo mismo):
     * «Remo 40x10» registra esa serie de Remo y lo pone en curso; «Remo» a secas lo
     * pone en curso sin registrar si es un candidato; «40x10» es otra serie del
     * que está en curso. El nombre se escribe tal cual, salvo que coincida (sin
     * mayúsculas ni tildes) con el ejercicio en curso o con un candidato: entonces
     * vale el suyo, para no partir un ejercicio en dos por una tilde. Lo que no se
     * entiende no registra nada y lo dice en la segunda línea.
     */
    public static Step typed(JSONObject control, String typed, long now) throws JSONException {
        String text = typed == null ? "" : typed.trim().replaceAll("\\s+", " ");
        JSONObject template = control.getJSONObject("template");
        Matcher named = NAMED.matcher(text);
        if (!named.matches()) {
            Parsed parsed = parse(text, template);
            if (parsed.error != null) return new Step(null, noticed(control, parsed.error));
            return other(control, parsed, now);
        }

        String name = named.group(1).trim();
        boolean withSet = named.group(3) != null;
        String current = control.optString("exercise", "");
        if (fold(name).equals(fold(current))) {
            if (!withSet) return new Step(null, adjusting(control));
            Parsed parsed = parse(text.substring(named.start(2) >= 0 ? named.start(2) : named.start(3)), template);
            if (parsed.error != null) return new Step(null, noticed(control, parsed.error));
            return other(control, parsed, now);
        }

        JSONObject switched = switchTo(control, name);
        if (!withSet) {
            if (switched == null) return new Step(null, noticed(control, UNKNOWN_NAME));
            return new Step(null, switched);
        }

        int reps;
        Double weight;
        try {
            reps = Integer.parseInt(named.group(3));
            weight = named.group(2) == null ? null : Double.valueOf(named.group(2).replace(',', '.'));
        } catch (NumberFormatException e) {
            return new Step(null, noticed(control, UNKNOWN_NAME));
        }
        if (reps < 1 || reps > MAX || (weight != null && (weight < 0 || weight > MAX))) {
            return new Step(null, noticed(control, UNKNOWN_NAME));
        }
        JSONObject base = switched != null
                ? switched
                : become(control, name, new JSONObject(), 0);
        String exercise = base.getString("exercise");
        JSONObject set = new JSONObject()
                .put("exercise_name", exercise)
                .put("reps", reps)
                .put("weight", weight == null ? JSONObject.NULL : weight);
        return log(base, set, now);
    }

    private static JSONObject noticed(JSONObject control, String notice) throws JSONException {
        JSONObject after = new JSONObject(control.toString());
        after.put("notice", notice);
        return after;
    }

    /** Sin mayúsculas, sin tildes y con los espacios de uno en uno: «Remo con barra». */
    static String fold(String name) {
        String decomposed = Normalizer.normalize(name == null ? "" : name, Normalizer.Form.NFD);
        return decomposed.replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .trim()
                .replaceAll("\\s+", " ");
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

    /**
     * «Press banca»: el ejercicio, sin el grupo muscular. Hasta la fase 5 era
     * «Press banca · Pecho»; el grupo ocupaba media línea para decir algo que el
     * nombre ya dice.
     */
    public static String title(JSONObject control) {
        return control.optString("exercise", "");
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
