package io.github.raullopeslopez.fitit.session;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

// Lo que decide la notificación sin tocar Android: qué serie registra un toque,
// cómo se lee «Otra serie» y qué texto se enseña. Copia de la spec:
// docs/widgets-entreno.md, «1 · Notificación en curso».
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class SessionControlTest {
    private static final long NOW = 1_790_000_000_000L;

    private static JSONObject bench() throws Exception {
        return new JSONObject()
                .put("workoutId", 1)
                .put("exercise", "Press banca")
                .put("group", "Pecho")
                .put("template", new JSONObject()
                        .put("exercise_name", "Press banca")
                        .put("reps", 12)
                        .put("weight", 32.5))
                .put("count", 4)
                .put("restSeconds", 90)
                .put("restEndsAt", 0)
                .put("lastSetAt", NOW - 60_000);
    }

    private static JSONObject pullUps() throws Exception {
        JSONObject control = bench()
                .put("exercise", "Dominadas")
                .put("group", "Espalda");
        control.put("template", new JSONObject()
                .put("exercise_name", "Dominadas")
                .put("reps", 8)
                .put("weight", JSONObject.NULL));
        return control;
    }

    // --- +1 serie -------------------------------------------------------------

    @Test
    public void aRepeatLogsTheTemplateStampedWithItsMoment() throws Exception {
        SessionControl.Step step = SessionControl.repeat(bench(), NOW);

        JSONObject payload = step.entry.getJSONObject("payload");
        assertEquals(1, step.entry.getInt("workoutId"));
        assertTrue(step.entry.getString("tmpId").startsWith("n-"));
        assertEquals("Press banca", payload.getString("exercise_name"));
        assertEquals(12, payload.getInt("reps"));
        assertEquals(32.5, payload.getDouble("weight"), 0);
        assertEquals("2026-09-21T14:13:20Z", payload.getString("performed_at"));
        assertTrue(payload.getString("client_id").matches("[0-9a-f-]{36}"));
    }

    @Test
    public void aRepeatCountsTheSetAndStartsTheRest() throws Exception {
        JSONObject after = SessionControl.repeat(bench(), NOW).control;

        assertEquals(5, after.getInt("count"));
        assertEquals(NOW + 90_000, after.getLong("restEndsAt"));
        assertEquals(NOW, after.getLong("lastSetAt"));
    }

    @Test
    public void withRestOffARepeatStartsNoClock() throws Exception {
        JSONObject after = SessionControl.repeat(bench().put("restSeconds", 0), NOW).control;

        assertEquals(0, after.getLong("restEndsAt"));
    }

    @Test
    public void twoRepeatsAreTwoSets() throws Exception {
        SessionControl.Step first = SessionControl.repeat(bench(), NOW);
        SessionControl.Step second = SessionControl.repeat(first.control, NOW + 1);

        assertFalse(first.entry.getString("tmpId").equals(second.entry.getString("tmpId")));
        assertFalse(first.entry.getJSONObject("payload").getString("client_id")
                .equals(second.entry.getJSONObject("payload").getString("client_id")));
    }

    @Test
    public void aRepeatClearsAMessageAboutAnEntryItCouldNotRead() throws Exception {
        JSONObject after =
                SessionControl.repeat(bench().put("notice", "No entendí"), NOW).control;

        assertFalse(after.has("notice"));
    }

    @Test
    public void aBodyweightSetCarriesNoWeight() throws Exception {
        JSONObject payload = SessionControl.repeat(pullUps(), NOW).entry.getJSONObject("payload");

        assertTrue(payload.isNull("weight"));
    }

    // --- Otra serie -----------------------------------------------------------

    @Test
    public void readsWeightTimesRepsWithACommaAPointOrASign() throws Exception {
        for (String typed : new String[] {"32,5x10", "32.5x10", "32,5 x 10", "32,5×10", " 32,5X10 "}) {
            SessionControl.Parsed p = SessionControl.parse(typed, bench().getJSONObject("template"));
            assertNull(typed, p.error);
            assertEquals(typed, 32.5, p.weight, 0);
            assertEquals(typed, 10, p.reps);
        }
    }

    @Test
    public void aLoneNumberIsRepsAndKeepsTheWeight() throws Exception {
        SessionControl.Parsed p = SessionControl.parse("10", bench().getJSONObject("template"));

        assertNull(p.error);
        assertEquals(10, p.reps);
        assertEquals(32.5, p.weight, 0);
    }

    @Test
    public void aLoneNumberOnABodyweightExerciseIsJustReps() throws Exception {
        SessionControl.Parsed p = SessionControl.parse("12", pullUps().getJSONObject("template"));

        assertNull(p.error);
        assertEquals(12, p.reps);
        assertNull(p.weight);
    }

    @Test
    public void somethingItCannotReadIsExplainedNotLogged() throws Exception {
        for (String typed : new String[] {"12 32", "", "x10", "32,5x", "32,5x10,5", "abc", "0", "32,5x0"}) {
            SessionControl.Parsed p = SessionControl.parse(typed, bench().getJSONObject("template"));
            assertEquals(
                    typed,
                    "No entendí «" + typed.trim() + "». Escríbela como 32,5x12.",
                    p.error);
        }
    }

    @Test
    public void anotherSetBecomesWhatTheNextRepeatRepeats() throws Exception {
        JSONObject control = bench();
        SessionControl.Parsed p = SessionControl.parse("35x10", control.getJSONObject("template"));
        SessionControl.Step step = SessionControl.other(control, p, NOW);

        assertEquals(35, step.entry.getJSONObject("payload").getDouble("weight"), 0);
        JSONObject next = SessionControl.repeat(step.control, NOW + 1).entry.getJSONObject("payload");
        assertEquals(35, next.getDouble("weight"), 0);
        assertEquals(10, next.getInt("reps"));
    }

    // --- Lo que se lee --------------------------------------------------------

    @Test
    public void theTitleIsTheExerciseAlone() throws Exception {
        // Fase 5: el grupo muscular deja de pintarse; el nombre ya dice qué es.
        assertEquals("Press banca", SessionControl.title(bench()));
        assertEquals("Press banca", SessionControl.title(bench().put("group", JSONObject.NULL)));
    }

    @Test
    public void theLineIsTheSetToRepeatAndHowManySoFar() throws Exception {
        assertEquals("32,5 kg × 12 · 4 series", SessionControl.line(bench()));
        assertEquals("60 kg × 8 · 1 serie", SessionControl.line(bench()
                .put("count", 1)
                .put("template", new JSONObject()
                        .put("exercise_name", "Press banca")
                        .put("reps", 8)
                        .put("weight", 60.0))));
        assertEquals("8 reps · 4 series", SessionControl.line(pullUps()));
    }

    @Test
    public void aMessageTakesTheLineUntilTheNextSet() throws Exception {
        assertEquals(
                "No entendí «12 32». Escríbela como 32,5x12.",
                SessionControl.line(bench().put("notice", "No entendí «12 32». Escríbela como 32,5x12.")));
    }

    @Test
    public void theRestIsRunningOverOrNone() throws Exception {
        assertEquals(SessionControl.Rest.RUNNING,
                SessionControl.rest(bench().put("restEndsAt", NOW + 10_000), NOW));
        assertEquals(SessionControl.Rest.OVER,
                SessionControl.rest(bench().put("restEndsAt", NOW - 1), NOW));
        assertEquals(SessionControl.Rest.NONE,
                SessionControl.rest(bench().put("restEndsAt", 0), NOW));
    }

    @Test
    public void twoHoursWithoutASetEndsTheControl() throws Exception {
        JSONObject control = bench().put("lastSetAt", NOW);

        assertFalse(SessionControl.expired(control, NOW + SessionControl.IDLE_MS - 1));
        assertTrue(SessionControl.expired(control, NOW + SessionControl.IDLE_MS));
    }

    // --- Ajuste del widget 4×2 (fase 4) ---------------------------------------

    @Test
    public void thePlusOnWeightAddsTwoAndAHalfKilos() throws Exception {
        JSONObject once = SessionControl.weight(bench(), 1);
        JSONObject twice = SessionControl.weight(once, 1);

        assertEquals(35, once.getJSONObject("template").getDouble("weight"), 0);
        assertEquals(37.5, twice.getJSONObject("template").getDouble("weight"), 0);
        assertEquals("37,5 kg × 12", SessionControl.set(twice));
    }

    @Test
    public void theWeightDoesNotGoBelowZero() throws Exception {
        JSONObject control = bench();
        control.getJSONObject("template").put("weight", 1.5);

        JSONObject down = SessionControl.weight(control, -1);

        assertEquals(0, down.getJSONObject("template").getDouble("weight"), 0);
        assertEquals("0 kg × 12", SessionControl.set(down));
    }

    @Test
    public void repsGoOneByOneAndNeverBelowOne() throws Exception {
        JSONObject control = bench();
        control.getJSONObject("template").put("reps", 2);

        JSONObject up = SessionControl.reps(control, 1);
        JSONObject down = SessionControl.reps(SessionControl.reps(control, -1), -1);

        assertEquals(3, up.getJSONObject("template").getInt("reps"));
        assertEquals(1, down.getJSONObject("template").getInt("reps"));
    }

    @Test
    public void aBodyweightExerciseKeepsNoWeight() throws Exception {
        JSONObject up = SessionControl.weight(pullUps(), 1);

        assertTrue(up.getJSONObject("template").isNull("weight"));
        assertFalse(SessionControl.hasWeight(up));
        assertTrue(SessionControl.hasWeight(bench()));
    }

    @Test
    public void adjustingLogsNothingAndLeavesTheRestAlone() throws Exception {
        JSONObject control = bench().put("restEndsAt", NOW + 30_000).put("notice", "No entendí");

        JSONObject after = SessionControl.reps(SessionControl.weight(control, 1), 1);

        assertEquals(4, after.getInt("count"));
        assertEquals(NOW + 30_000, after.getLong("restEndsAt"));
        assertEquals(NOW - 60_000, after.getLong("lastSetAt"));
        // El aviso de una entrada mal escrita se va: ya hay otra serie a la vista.
        assertFalse(after.has("notice"));
        // Lo de antes no se toca: quien ajusta trabaja sobre una copia.
        assertEquals(32.5, control.getJSONObject("template").getDouble("weight"), 0);
    }

    @Test
    public void theAdjustedSetIsWhatTheNextRepeatLogs() throws Exception {
        JSONObject adjusted = SessionControl.weight(SessionControl.weight(bench(), 1), 1);

        SessionControl.Step step = SessionControl.repeat(adjusted, NOW);

        assertEquals(37.5, step.entry.getJSONObject("payload").getDouble("weight"), 0);
        assertEquals(37.5, step.control.getJSONObject("template").getDouble("weight"), 0);
    }

    @Test
    public void unsentSaysHowManyAndOnlyWhenThereAreAny() {
        assertEquals("", SessionControl.unsent(0));
        assertEquals(" · 1 sin enviar", SessionControl.unsent(1));
        assertEquals(" · 3 sin enviar", SessionControl.unsent(3));
    }

    @Test
    public void theWidgetReadsWeightAndRepsApart() throws Exception {
        assertEquals("32,5 kg", SessionControl.kilosLabel(bench()));
        assertEquals("12", SessionControl.repsLabel(bench()));
    }

    // --- Cambiar de ejercicio (fase 5) ----------------------------------------

    static JSONObject candidate(String name, Integer reps, Double weight, int count)
            throws Exception {
        JSONObject c = new JSONObject().put("exercise", name).put("count", count);
        if (reps == null) {
            c.put("template", JSONObject.NULL);
        } else {
            c.put("template", new JSONObject()
                    .put("exercise_name", name)
                    .put("reps", reps)
                    .put("weight", weight == null ? JSONObject.NULL : weight));
        }
        return c;
    }

    /** Press banca en curso, y lo que publicó la app para elegir. */
    private static JSONObject withCandidates() throws Exception {
        return bench().put("candidates", new JSONArray()
                .put(candidate("Remo", 10, 40.0, 0))
                .put(candidate("Dominadas", 8, null, 0))
                .put(candidate("Sentadilla", null, null, 0))
                .put(candidate("Curl", 12, 12.5, 3)));
    }

    @Test
    public void theCandidatesAreThoseTheAppPublishedWithoutTheCurrentOneAndAtMostFour()
            throws Exception {
        JSONObject control = bench().put("candidates", new JSONArray()
                .put(candidate("Press banca", 12, 32.5, 4))
                .put(candidate("Dominadas", 8, null, 0))
                .put(candidate("Sentadilla", null, null, 0))
                .put(candidate("Curl", 12, 12.5, 3))
                .put(candidate("Remo", 10, 40.0, 0))
                .put(candidate("Fondos", 10, null, 0)));

        List<JSONObject> list = SessionControl.candidates(control);

        assertEquals(4, list.size());
        assertEquals("Dominadas", list.get(0).getString("exercise"));
        assertEquals("Remo", list.get(3).getString("exercise"));
        assertTrue(SessionControl.candidates(bench()).isEmpty());
    }

    @Test
    public void eachCandidateSaysItsLastMark() throws Exception {
        List<JSONObject> list = SessionControl.candidates(withCandidates());

        assertEquals("40 kg × 10", SessionControl.mark(list.get(0)));
        assertEquals("8 reps", SessionControl.mark(list.get(1)));
        assertEquals("", SessionControl.mark(list.get(2)));
        assertEquals("12,5 kg × 12", SessionControl.mark(list.get(3)));
    }

    @Test
    public void switchingMakesTheCandidateTheCurrentOneAndLogsNothing() throws Exception {
        JSONObject control = withCandidates()
                .put("restEndsAt", NOW + 30_000)
                .put("choosing", true)
                .put("notice", "No entendí");

        JSONObject after = SessionControl.switchTo(control, "Remo");

        assertEquals("Remo", after.getString("exercise"));
        assertEquals("Remo", after.getJSONObject("template").getString("exercise_name"));
        assertEquals(10, after.getJSONObject("template").getInt("reps"));
        assertEquals(40, after.getJSONObject("template").getDouble("weight"), 0);
        assertEquals(0, after.getInt("count"));
        // El descanso sigue y no cuenta como serie: el cierre de dos horas no se mueve.
        assertEquals(NOW + 30_000, after.getLong("restEndsAt"));
        assertEquals(NOW - 60_000, after.getLong("lastSetAt"));
        assertFalse(after.has("choosing"));
        assertFalse(after.has("notice"));
        // Y el de antes pasa a ser un candidato, para poder volver.
        List<JSONObject> list = SessionControl.candidates(after);
        assertEquals(4, list.size());
        assertEquals("Press banca", list.get(2).getString("exercise"));
        assertEquals(4, list.get(2).getInt("count"));
        assertEquals("32,5 kg × 12", SessionControl.mark(list.get(2)));
        for (JSONObject c : list) assertFalse("Remo".equals(c.getString("exercise")));
    }

    @Test
    public void switchingKeepsTheCountOfWhatThisWorkoutAlreadyHas() throws Exception {
        JSONObject after = SessionControl.switchTo(withCandidates(), "Curl");

        assertEquals(3, after.getInt("count"));
        assertEquals("12,5 kg × 12 · 3 series", SessionControl.line(after));
    }

    @Test
    public void aCandidateWithNoMarkStartsAtTenRepsAndNoWeight() throws Exception {
        JSONObject after = SessionControl.switchTo(withCandidates(), "Sentadilla");

        assertEquals(10, after.getJSONObject("template").getInt("reps"));
        assertTrue(after.getJSONObject("template").isNull("weight"));
        assertEquals("10 reps · 0 series", SessionControl.line(after));
    }

    @Test
    public void switchingToSomethingThatIsNotACandidateChangesNothing() throws Exception {
        assertNull(SessionControl.switchTo(withCandidates(), "Peso muerto"));
    }

    // --- «Otro ejercicio» en la notificación ----------------------------------

    @Test
    public void anExerciseAndASetLogsTheFirstSetOfIt() throws Exception {
        for (String typed : new String[] {"Peso muerto 100x5", "Peso muerto 100 x 5", "Peso muerto 100×5"}) {
            SessionControl.Step step = SessionControl.typed(withCandidates(), typed, NOW);

            assertNotNull(typed, step.entry);
            JSONObject payload = step.entry.getJSONObject("payload");
            assertEquals(typed, "Peso muerto", payload.getString("exercise_name"));
            assertEquals(typed, 100, payload.getDouble("weight"), 0);
            assertEquals(typed, 5, payload.getInt("reps"));
            assertEquals("Peso muerto", step.control.getString("exercise"));
            assertEquals(1, step.control.getInt("count"));
            assertEquals(NOW + 90_000, step.control.getLong("restEndsAt"));
            assertEquals(NOW, step.control.getLong("lastSetAt"));
        }
    }

    @Test
    public void aDecimalWeightTakesACommaOrAPoint() throws Exception {
        SessionControl.Step step = SessionControl.typed(withCandidates(), "Remo 40,5 x 10", NOW);

        assertEquals(40.5, step.entry.getJSONObject("payload").getDouble("weight"), 0);
        assertEquals(40.5, SessionControl.typed(withCandidates(), "Remo 40.5x10", NOW)
                .entry.getJSONObject("payload").getDouble("weight"), 0);
    }

    @Test
    public void aNameThatMatchesACandidateTakesTheCandidatesNameAndCount() throws Exception {
        SessionControl.Step step = SessionControl.typed(withCandidates(), "curl 15x10", NOW);

        assertEquals("Curl", step.entry.getJSONObject("payload").getString("exercise_name"));
        assertEquals("Curl", step.control.getString("exercise"));
        assertEquals(4, step.control.getInt("count"));
        // Sin mayúsculas ni tildes también.
        JSONObject control = withCandidates();
        control.getJSONArray("candidates").put(0, candidate("Remo con barra", 10, 60.0, 0));
        SessionControl.Step accents = SessionControl.typed(control, "REMO CÓN BARRA 60x8", NOW);
        assertEquals("Remo con barra",
                accents.entry.getJSONObject("payload").getString("exercise_name"));
    }

    @Test
    public void onlyRepsIsABodyweightSet() throws Exception {
        SessionControl.Step step = SessionControl.typed(withCandidates(), "Fondos 12", NOW);

        JSONObject payload = step.entry.getJSONObject("payload");
        assertEquals("Fondos", payload.getString("exercise_name"));
        assertEquals(12, payload.getInt("reps"));
        assertTrue(payload.isNull("weight"));
    }

    @Test
    public void onlyTheNameOfACandidateSwitchesWithoutLogging() throws Exception {
        SessionControl.Step step = SessionControl.typed(withCandidates(), "remo", NOW);

        assertNull(step.entry);
        assertEquals("Remo", step.control.getString("exercise"));
        assertEquals(0, step.control.getInt("count"));
    }

    @Test
    public void onlyANameItDoesNotKnowIsExplainedNotLogged() throws Exception {
        SessionControl.Step step = SessionControl.typed(withCandidates(), "Peso muerto", NOW);

        assertNull(step.entry);
        assertEquals("Press banca", step.control.getString("exercise"));
        assertEquals("Escríbelo con la serie, como Remo 40x10.", SessionControl.line(step.control));
    }

    @Test
    public void theCurrentExerciseWithASetIsJustAnotherSet() throws Exception {
        SessionControl.Step step = SessionControl.typed(withCandidates(), "press banca 35x10", NOW);

        assertEquals("Press banca", step.control.getString("exercise"));
        assertEquals(5, step.control.getInt("count"));
        assertEquals(35, step.entry.getJSONObject("payload").getDouble("weight"), 0);
    }

    @Test
    public void aSetWithNoNameIsStillOtraSerie() throws Exception {
        SessionControl.Step step = SessionControl.typed(withCandidates(), "35x10", NOW);

        assertEquals("Press banca", step.entry.getJSONObject("payload").getString("exercise_name"));
        assertEquals(5, step.control.getInt("count"));
        SessionControl.Step wrong = SessionControl.typed(withCandidates(), "12 32", NOW);
        assertNull(wrong.entry);
        assertEquals("No entendí «12 32». Escríbela como 32,5x12.", SessionControl.line(wrong.control));
    }

    @Test
    public void choosingIsAStateOfTheWidgetThatASetEnds() throws Exception {
        JSONObject choosing = SessionControl.choosing(bench(), true);

        assertTrue(SessionControl.isChoosing(choosing));
        assertFalse(SessionControl.isChoosing(SessionControl.choosing(choosing, false)));
        assertFalse(SessionControl.isChoosing(SessionControl.repeat(choosing, NOW).control));
    }
}
