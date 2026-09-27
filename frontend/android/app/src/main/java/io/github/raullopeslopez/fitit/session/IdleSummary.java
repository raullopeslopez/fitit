package io.github.raullopeslopez.fitit.session;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Lo que dicen el 4×2 y el 3×2 sin entreno en curso (DESIGN.md, «Sin entreno — dos
 * pantallas»), sin Android dentro. Los datos los publica la app (widgetSummary.js)
 * en piezas que {@link SessionStore#mergeSummary} junta:
 *
 * <pre>
 * { lastWorkout: { date: "2026-09-25", groups: ["Cuádriceps", "Glúteo"] },
 *   steps: { date: "2026-09-27", today: 8432, weekAverage: 7910 },
 *   stepsGoal: 10000 }
 * </pre>
 *
 * <p>El día se compara aquí, al pintar, y no en la app: «hace 2 días» tiene que
 * pasar a 3 aunque nadie abra Fitit, y unos pasos de ayer no son «pasos hoy». La
 * alarma de medianoche repinta para eso ({@link SessionAlarms#armDay}).
 */
final class IdleSummary {
    private IdleSummary() {}

    /** Los pasos de hoy, o null si no hay (sin leer, o leídos otro día). */
    static final class Steps {
        final int today;
        /** Null: ningún día de la semana tiene cifra, y no se inventa una. */
        final Integer weekAverage;
        /** Null: sin objetivo no hay barra ni «/ 10.000». */
        final Integer goal;

        Steps(int today, Integer weekAverage, Integer goal) {
            this.today = today;
            this.weekAverage = weekAverage;
            this.goal = goal;
        }

        /** La barra, de 0 a 1000: se llena hasta el objetivo y ahí se queda. */
        int progress() {
            if (goal == null || goal <= 0) return 0;
            return (int) Math.min(1000, Math.round(today * 1000.0 / goal));
        }
    }

    /** «Último: hace 2 días · Cuádriceps, Glúteo», o null si no hay último entreno. */
    static String lastLine(JSONObject summary, LocalDate today) {
        JSONObject last = summary == null ? null : summary.optJSONObject("lastWorkout");
        if (last == null) return null;
        LocalDate date = parse(last.optString("date", ""));
        if (date == null) return null;
        long ago = ChronoUnit.DAYS.between(date, today);
        String when = ago <= 0 ? "hoy" : ago == 1 ? "ayer" : "hace " + ago + " días";
        StringBuilder line = new StringBuilder("Último: ").append(when);
        JSONArray groups = last.optJSONArray("groups");
        if (groups != null && groups.length() > 0) {
            line.append(" · ");
            for (int i = 0; i < groups.length(); i++) {
                if (i > 0) line.append(", ");
                line.append(groups.optString(i));
            }
        }
        return line.toString();
    }

    static Steps steps(JSONObject summary, LocalDate today) {
        JSONObject steps = summary == null ? null : summary.optJSONObject("steps");
        if (steps == null || steps.isNull("today")) return null;
        if (!today.equals(parse(steps.optString("date", "")))) return null;
        return new Steps(
                steps.optInt("today"),
                steps.isNull("weekAverage") || !steps.has("weekAverage") ? null : steps.optInt("weekAverage"),
                summary.isNull("stepsGoal") || !summary.has("stepsGoal") ? null : summary.optInt("stepsGoal"));
    }

    /** «8.432»: punto de miles siempre, también con cuatro cifras (como formatSteps). */
    static String thousands(int n) {
        String digits = String.valueOf(Math.abs(n));
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < digits.length(); i++) {
            if (i > 0 && (digits.length() - i) % 3 == 0) out.append('.');
            out.append(digits.charAt(i));
        }
        return (n < 0 ? "-" : "") + out;
    }

    private static LocalDate parse(String iso) {
        try {
            return LocalDate.parse(iso);
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
