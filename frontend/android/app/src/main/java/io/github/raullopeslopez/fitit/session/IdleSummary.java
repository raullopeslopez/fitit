package io.github.raullopeslopez.fitit.session;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Lo que dicen el 4×2 y el 3×2 sin entreno en curso (DESIGN.md, «Sin entreno —
 * pestañas»), sin Android dentro. Los datos los publica la app (widgetSummary.js)
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
        /** Null: sin objetivo no hay barra ni «faltan». */
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

        /** Lo que falta hasta el objetivo; null sin objetivo o con la meta cumplida. */
        Integer left() {
            if (goal == null || today >= goal) return null;
            return goal - today;
        }
    }

    /** Las pestañas del widget sin entreno, en su orden: Pasos, Comida, Entreno. */
    enum Page { STEPS, FOOD, START }

    /**
     * Pasos (si hay de hoy), Comida (si hay objetivo de proteína) y Entreno, que
     * está siempre. DESIGN.md, «Sin entreno»: los pasos van primero.
     */
    static List<Page> pages(JSONObject summary, LocalDate today, LocalDate foodToday) {
        List<Page> pages = new ArrayList<>();
        if (steps(summary, today) != null) pages.add(Page.STEPS);
        if (food(summary, foodToday) != null) pages.add(Page.FOOD);
        pages.add(Page.START);
        return pages;
    }

    /**
     * La pestaña que se ve: la que eligió el usuario ({@code chosen}, el nombre que
     * guarda {@link SessionStore#idleTab}), si sigue habiéndola; si no, la primera.
     * Por nombre y no por posición: si mañana a las 00:00 desaparece «Pasos», quien
     * estaba en Entreno sigue en Entreno.
     */
    static Page tab(String chosen, List<Page> pages) {
        for (Page page : pages) {
            if (page.name().equals(chosen)) return page;
        }
        return pages.get(0);
    }

    /**
     * El día de comida: corta a las 04:00 locales, como {@code food_log_date()} en
     * el servidor y {@code foodDayIso()} en la app. Una cena de la 01:00 es de ayer.
     */
    static LocalDate foodDay(LocalDateTime now) {
        return now.minusHours(4).toLocalDate();
    }

    /**
     * La pestaña Comida (DESIGN.md, «Pestaña Comida»): proteína y kcal de hoy frente
     * al objetivo. Cada cifra sale una vez, «118/202 G»; lo que falta ya no se
     * imprime, lo dicen los anillos.
     */
    static final class Food {
        /** Null: nada apuntado, o un total desconocido. Se imprime «—», no 0. */
        final Double protein;
        final double targetProtein;
        final Double kcal;
        /** Null: sin objetivo de kcal no hay anillo de dentro ni bloque KCAL. */
        final Double targetKcal;

        Food(Double protein, double targetProtein, Double kcal, Double targetKcal) {
            this.protein = protein;
            this.targetProtein = targetProtein;
            this.kcal = kcal;
            this.targetKcal = targetKcal;
        }

        boolean closed() {
            return protein != null && protein >= targetProtein;
        }

        /** Del anillo de fuera, de 0 a 1. Lo comido sin dato no llena nada. */
        float proteinDone() {
            return fraction(protein, targetProtein);
        }

        /** Del anillo de dentro, de 0 a 1; sin objetivo de kcal, 0. */
        float kcalDone() {
            return targetKcal == null ? 0f : fraction(kcal, targetKcal);
        }

        private static float fraction(Double eaten, double target) {
            if (eaten == null || target <= 0) return 0f;
            return (float) Math.max(0, Math.min(1, eaten / target));
        }
    }

    /**
     * La comida de hoy, o null si no hay objetivo de proteína (sin él no hay nada
     * que restar, y la pantalla no aparece). Si lo guardado es de otro día de
     * comida, la pantalla sale vacía con los mismos objetivos: a las 04:00 el día
     * empieza de cero aunque nadie abra Fitit.
     */
    static Food food(JSONObject summary, LocalDate foodToday) {
        JSONObject food = summary == null ? null : summary.optJSONObject("food");
        Double targetProtein = number(food, "targetProtein");
        if (targetProtein == null || targetProtein <= 0) return null;
        Double targetKcal = number(food, "targetKcal");
        if (!foodToday.equals(parse(food.optString("date", "")))) {
            return new Food(null, targetProtein, null, targetKcal);
        }
        return new Food(number(food, "protein"), targetProtein, number(food, "kcal"), targetKcal);
    }

    /**
     * Una cifra de macro como en la app ({@code formatMacro}): entera, sin punto
     * con cuatro cifras y con punto desde cinco (RAE). Null es «—».
     */
    static String macro(Double value) {
        if (value == null) return "—";
        long n = Math.round(value);
        return Math.abs(n) >= 10000 ? thousands((int) n) : String.valueOf(n);
    }

    private static Double number(JSONObject object, String key) {
        if (object == null || !object.has(key) || object.isNull(key)) return null;
        double value = object.optDouble(key, Double.NaN);
        return Double.isNaN(value) ? null : value;
    }

    /** El último entreno: cuántos días hace y sus grupos, del que más series tuvo al que menos. */
    static final class Last {
        final long days;
        final List<String> groups;

        Last(long days, List<String> groups) {
            this.days = days;
            this.groups = groups;
        }
    }

    /** El último entreno, o null si no hay (o la fecha no se lee). */
    static Last last(JSONObject summary, LocalDate today) {
        JSONObject last = summary == null ? null : summary.optJSONObject("lastWorkout");
        if (last == null) return null;
        LocalDate date = parse(last.optString("date", ""));
        if (date == null) return null;
        List<String> groups = new ArrayList<>();
        JSONArray names = last.optJSONArray("groups");
        for (int i = 0; names != null && i < names.length(); i++) {
            String name = names.optString(i, "");
            if (!name.isEmpty()) groups.add(name);
        }
        return new Last(Math.max(0, ChronoUnit.DAYS.between(date, today)), groups);
    }

    /**
     * El nombre de un grupo sin tildes y en minúsculas («Cuádriceps» → «cuadriceps»),
     * que es como se llaman sus colores (widget_m_cuadriceps). Como
     * {@code fold_exercise_name()} del servidor, en pequeño.
     */
    static String groupKey(String name) {
        String folded = java.text.Normalizer.normalize(name, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        return folded.toLowerCase(java.util.Locale.ROOT).trim();
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
