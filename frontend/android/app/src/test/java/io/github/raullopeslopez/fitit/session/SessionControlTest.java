package io.github.raullopeslopez.fitit.session;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

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
    public void theTitleIsTheExerciseAndItsGroup() throws Exception {
        assertEquals("Press banca · Pecho", SessionControl.title(bench()));
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
}
