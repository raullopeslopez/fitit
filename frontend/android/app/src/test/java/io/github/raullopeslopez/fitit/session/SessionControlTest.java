package io.github.raullopeslopez.fitit.session;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

// Lo que decide el control sin tocar Android: qué serie registra un toque, cómo
// se ajusta y qué texto se enseña. Spec: docs/widgets-entreno.md y DESIGN.md,
// «Fuera de la app».
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

    // --- +1 -------------------------------------------------------------------

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
    public void aBodyweightSetCarriesNoWeight() throws Exception {
        JSONObject payload = SessionControl.repeat(pullUps(), NOW).entry.getJSONObject("payload");

        assertTrue(payload.isNull("weight"));
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

    // --- El bloque de ajuste --------------------------------------------------

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
        JSONObject control = bench().put("restEndsAt", NOW + 30_000);

        JSONObject after = SessionControl.reps(SessionControl.weight(control, 1), 1);

        assertEquals(4, after.getInt("count"));
        assertEquals(NOW + 30_000, after.getLong("restEndsAt"));
        assertEquals(NOW - 60_000, after.getLong("lastSetAt"));
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
        // «32,5» y la unidad aparte, más pequeña y apagada, como «12 reps».
        assertEquals("32,5", SessionControl.weightLabel(bench()));
        assertEquals("12", SessionControl.repsLabel(bench()));
    }

    // --- Pausar el descanso (botón del 4×2 y del 3×2) -------------------------

    @Test
    public void pausingKeepsWhatWasLeftAndStopsTheClock() throws Exception {
        JSONObject running = bench().put("restEndsAt", NOW + 83_000);

        JSONObject paused = SessionControl.toggleRest(running, NOW);

        assertEquals(SessionControl.Rest.PAUSED, SessionControl.rest(paused, NOW + 600_000));
        assertEquals(83_000, paused.getLong("restPausedMs"));
        assertEquals(0, paused.getLong("restEndsAt"));
        assertEquals("01:23", SessionControl.pausedLabel(paused));
    }

    @Test
    public void resumingCountsWhatWasLeftFromNow() throws Exception {
        JSONObject paused = SessionControl.toggleRest(bench().put("restEndsAt", NOW + 83_000), NOW);

        JSONObject resumed = SessionControl.toggleRest(paused, NOW + 600_000);

        assertEquals(SessionControl.Rest.RUNNING, SessionControl.rest(resumed, NOW + 600_000));
        assertEquals(NOW + 600_000 + 83_000, resumed.getLong("restEndsAt"));
        assertFalse(resumed.has("restPausedMs"));
    }

    @Test
    public void overtimeOrNoRestHasNothingToPause() throws Exception {
        JSONObject over = bench().put("restEndsAt", NOW - 1_000);
        assertEquals(SessionControl.Rest.OVER, SessionControl.rest(SessionControl.toggleRest(over, NOW), NOW));
        assertEquals(SessionControl.Rest.NONE, SessionControl.rest(SessionControl.toggleRest(bench(), NOW), NOW));
    }

    @Test
    public void aRepeatWhilePausedStartsAFreshRunningRest() throws Exception {
        JSONObject paused = SessionControl.toggleRest(bench().put("restEndsAt", NOW + 83_000), NOW);

        JSONObject after = SessionControl.repeat(paused, NOW + 10_000).control;

        assertFalse(after.has("restPausedMs"));
        assertEquals(NOW + 10_000 + 90_000, after.getLong("restEndsAt"));
        assertEquals(SessionControl.Rest.RUNNING, SessionControl.rest(after, NOW + 10_000));
    }

    @Test
    public void thePausedLabelRoundsUpLikeACountdown() throws Exception {
        assertEquals("00:01", SessionControl.pausedLabel(bench().put("restPausedMs", 400)));
        assertEquals("02:00", SessionControl.pausedLabel(bench().put("restPausedMs", 120_000)));
    }
}
