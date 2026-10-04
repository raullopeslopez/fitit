package io.github.raullopeslopez.fitit.session;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

// La cola de series del APK y lo que el nativo necesita para enviarla solo.
// Spec: docs/widgets-entreno.md, fase 1.
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class SessionStoreTest {

    /** Reversible y distinto del texto claro: basta para ver qué llega al disco. */
    static final class FakeCipher implements TokenCipher {
        boolean broken = false;

        @Override
        public byte[] encrypt(byte[] plain) {
            byte[] out = new byte[plain.length];
            for (int i = 0; i < plain.length; i++) out[i] = (byte) (plain[i] ^ 0x5a);
            return out;
        }

        @Override
        public byte[] decrypt(byte[] sealed) throws GeneralSecurityException {
            if (broken) throw new GeneralSecurityException("key invalidated");
            return encrypt(sealed);
        }
    }

    private Context context;
    private FakeCipher cipher;
    private SessionStore store;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        cipher = new FakeCipher();
        store = new SessionStore(context, cipher);
    }

    private static JSONObject bench(String tmpId, double weight) throws Exception {
        return new JSONObject()
                .put("tmpId", tmpId)
                .put("workoutId", 1)
                .put("payload", new JSONObject()
                        .put("exercise_name", "Bench Press")
                        .put("reps", 8)
                        .put("weight", weight));
    }

    private static List<String> tmpIds(List<JSONObject> queue) {
        List<String> ids = new ArrayList<>();
        for (JSONObject e : queue) ids.add(e.optString("tmpId"));
        return ids;
    }

    @Test
    public void handsBackTheQueueInTheOrderItWasQueued() throws Exception {
        store.enqueue(bench("tmp-1", 60));
        store.enqueue(bench("tmp-2", 65));

        // set_index lo asigna el servidor al llegar: una cola desordenada
        // reescribe la sesión.
        assertEquals(List.of("tmp-1", "tmp-2"), tmpIds(store.queue()));
        assertEquals("tmp-1", store.head().getString("tmpId"));
    }

    @Test
    public void survivesTheProcessDying() throws Exception {
        store.enqueue(bench("tmp-1", 60));

        SessionStore reborn = new SessionStore(context, cipher);
        assertEquals(List.of("tmp-1"), tmpIds(reborn.queue()));
        assertEquals(60, reborn.head().getJSONObject("payload").getDouble("weight"), 0);
    }

    @Test
    public void anEmptyQueueHasNoHead() {
        assertNull(store.head());
        assertTrue(store.queue().isEmpty());
    }

    @Test
    public void stampsAClientIdOnASetThatHasNone() throws Exception {
        store.enqueue(bench("tmp-1", 60));
        store.enqueue(bench("tmp-2", 60));

        String first = store.queue().get(0).getJSONObject("payload").getString("client_id");
        String second = store.queue().get(1).getJSONObject("payload").getString("client_id");
        assertTrue(first.matches("[0-9a-f-]{36}"));
        assertNotEquals(first, second);
    }

    @Test
    public void keepsTheClientIdASetAlreadyHas() throws Exception {
        JSONObject entry = bench("tmp-1", 60);
        entry.getJSONObject("payload").put("client_id", "from-the-page");
        store.enqueue(entry);

        assertEquals(
                "from-the-page",
                store.head().getJSONObject("payload").getString("client_id"));
    }

    @Test
    public void takingTheSameSetTwiceQueuesItOnce() throws Exception {
        // La página entrega su cola al arrancar, y puede hacerlo más de una vez.
        store.enqueue(bench("tmp-1", 60));
        store.enqueue(bench("tmp-1", 60));

        assertEquals(1, store.queue().size());
    }

    @Test
    public void dropsOneEntryWithoutDisturbingTheRest() throws Exception {
        store.enqueue(bench("tmp-1", 60));
        store.enqueue(bench("tmp-2", 65));
        store.enqueue(bench("tmp-3", 70));
        store.drop("tmp-2");

        assertEquals(List.of("tmp-1", "tmp-3"), tmpIds(store.queue()));
    }

    @Test
    public void renamesTheExerciseOfEveryQueuedSetThatNamesIt() throws Exception {
        store.enqueue(bench("tmp-1", 60));
        JSONObject pull = bench("tmp-2", 0);
        pull.getJSONObject("payload").put("exercise_name", "Dominadas");
        store.enqueue(pull);

        store.rename("Bench Press", "Press banca");

        assertEquals(
                "Press banca",
                store.queue().get(0).getJSONObject("payload").getString("exercise_name"));
        assertEquals(
                "Dominadas",
                store.queue().get(1).getJSONObject("payload").getString("exercise_name"));
    }

    @Test
    public void dropsEverySetOfADeletedExercise() throws Exception {
        store.enqueue(bench("tmp-1", 60));
        JSONObject pull = bench("tmp-2", 0);
        pull.getJSONObject("payload").put("exercise_name", "Dominadas");
        store.enqueue(pull);
        store.enqueue(bench("tmp-3", 65));

        store.dropFor("Bench Press");

        assertEquals(List.of("tmp-2"), tmpIds(store.queue()));
    }

    @Test
    public void forgetsEverySetOfADeletedWorkoutAndOnlyThose() throws Exception {
        // Un entreno borrado: sus series sólo ganarían un 404. Las de otro
        // entreno siguen debiéndose al servidor.
        store.enqueue(bench("tmp-1", 60));
        store.enqueue(bench("tmp-2", 65).put("workoutId", 2));
        store.enqueue(bench("tmp-3", 70));

        store.forgetWorkout(1);

        assertEquals(List.of("tmp-2"), tmpIds(store.queue()));
    }

    @Test
    public void forgettingTheWorkoutOfTheControlEndsTheControl() throws Exception {
        store.saveControl(new JSONObject().put("workoutId", 1).put("exercise", "Press banca"));

        assertFalse(store.forgetWorkout(2));
        assertNotNull(store.control());

        assertTrue(store.forgetWorkout(1));
        assertNull(store.control());
    }

    @Test
    public void keepsTheTokenAndWhereToSendIt() {
        store.setSession("jwt-abc", "https://fitit.example/api", "0.5.0");

        SessionStore reborn = new SessionStore(context, cipher);
        assertEquals("jwt-abc", reborn.token());
        assertEquals("https://fitit.example/api", reborn.apiBase());
        assertEquals("0.5.0", reborn.clientVersion());
    }

    @Test
    public void neverWritesTheTokenInTheClear() {
        store.setSession("jwt-abc", "https://fitit.example/api", "0.5.0");

        String onDisk = context.getSharedPreferences(SessionStore.PREFS, Context.MODE_PRIVATE)
                .getAll().toString();
        assertFalse(onDisk.contains("jwt-abc"));
    }

    @Test
    public void aTokenThatCannotBeReadIsForgottenNotFatal() {
        // Clave invalidada (restaurar el teléfono): se tira el token y se espera
        // a que la app, al abrirse, lo vuelva a copiar. Las series esperan.
        store.setSession("jwt-abc", "https://fitit.example/api", "0.5.0");
        cipher.broken = true;

        assertNull(store.token());
        cipher.broken = false;
        assertNull(store.token());
    }

    @Test
    public void signingOutForgetsTheTokenButNotTheSets() throws Exception {
        // Igual que la web: cerrar sesión no vacía la cola.
        store.setSession("jwt-abc", "https://fitit.example/api", "0.5.0");
        store.enqueue(bench("tmp-1", 60));

        store.clearToken();

        assertNull(store.token());
        assertEquals(1, store.queue().size());
    }

    @Test
    public void keepsTheControlAcrossAProcessDeath() throws Exception {
        store.saveControl(new JSONObject().put("exercise", "Press banca").put("count", 4));

        JSONObject control = new SessionStore(context, cipher).control();
        assertEquals("Press banca", control.getString("exercise"));
        assertEquals(4, control.getInt("count"));
    }

    @Test
    public void withNoSessionThereIsNoControl() throws Exception {
        assertNull(store.control());
        store.saveControl(new JSONObject().put("exercise", "Press banca"));
        store.clearControl();
        assertNull(store.control());
    }

    @Test
    public void signingOutEndsTheControlToo() throws Exception {
        // Spec: «Cerrar sesión en la app → se borra el token nativo y el control».
        store.setSession("jwt-abc", "https://fitit.example/api", "0.5.0");
        store.saveControl(new JSONObject().put("exercise", "Press banca"));

        store.clearToken();

        assertNull(store.control());
    }

    // --- Lo que enseña el widget sin entreno (DESIGN.md, «Sin entreno») -------

    @Test
    public void theSummaryArrivesInPiecesAndEachPieceKeepsTheOthers() throws Exception {
        store.mergeSummary(new JSONObject().put("stepsGoal", 10000));
        store.mergeSummary(new JSONObject().put("steps",
                new JSONObject().put("date", "2026-09-27").put("today", 8432)));

        JSONObject summary = store.summary();
        assertEquals(10000, summary.getInt("stepsGoal"));
        assertEquals(8432, summary.getJSONObject("steps").getInt("today"));

        // Un null borra esa pieza y sólo ésa: sin objetivo, no hay barra.
        store.mergeSummary(new JSONObject().put("stepsGoal", JSONObject.NULL));
        assertTrue(store.summary().isNull("stepsGoal"));
        assertEquals(8432, store.summary().getJSONObject("steps").getInt("today"));
    }

    @Test
    public void signingOutForgetsTheSummary() throws Exception {
        // Los pasos y el último entreno son de quien estaba dentro.
        store.mergeSummary(new JSONObject().put("stepsGoal", 10000));
        store.clearToken();
        assertEquals(0, store.summary().length());
    }

    @Test
    public void theIdleTabIsRememberedByName() {
        assertNull("sin elegir, ninguna", store.idleTab());
        store.setIdleTab("FOOD");
        // Otro store sobre las mismas preferencias: lo que queda tras reiniciar.
        assertEquals("FOOD", new SessionStore(context, cipher).idleTab());
        store.setIdleTab(null);
        assertEquals("un toque sin pestaña no borra la elegida", "FOOD", store.idleTab());
    }

    @Test
    public void countsRefusedSetsUntilSomeoneAsks() {
        store.recordRejected();
        store.recordRejected();

        assertEquals(2, store.takeRejected());
        assertEquals(0, store.takeRejected());
    }
}
