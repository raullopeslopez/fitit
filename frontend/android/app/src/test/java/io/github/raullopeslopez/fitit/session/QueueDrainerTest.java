package io.github.raullopeslopez.fitit.session;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

// Vaciar la cola contra el servidor: en orden, y sabiendo qué fallo merece
// esperar y cuál no. Las reglas son las de `retryable()` en offline.js.
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class QueueDrainerTest {

    /** Un servidor de mentira: contesta lo que se le haya puesto, en orden. */
    static final class FakeHttp implements QueueDrainer.Http {
        final Deque<Object> answers = new ArrayDeque<>();
        final List<String> urls = new ArrayList<>();
        final List<Map<String, String>> headers = new ArrayList<>();
        final List<JSONObject> bodies = new ArrayList<>();

        FakeHttp answer(int status, String body) {
            answers.add(new QueueDrainer.Response(status, body));
            return this;
        }

        FakeHttp noSignal() {
            answers.add(new IOException("unreachable"));
            return this;
        }

        @Override
        public QueueDrainer.Response post(String url, Map<String, String> h, String body)
                throws IOException {
            urls.add(url);
            headers.add(h);
            try {
                bodies.add(new JSONObject(body));
            } catch (Exception e) {
                throw new AssertionError(e);
            }
            Object next = answers.poll();
            if (next instanceof IOException) throw (IOException) next;
            if (next == null) throw new AssertionError("no answer queued for " + url);
            return (QueueDrainer.Response) next;
        }
    }

    private static final String WORKOUT = "{\"id\":1,\"sets\":[]}";

    private SessionStore store;
    private FakeHttp http;

    @Before
    public void setUp() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        store = new SessionStore(context, new SessionStoreTest.FakeCipher());
        store.setSession("jwt-abc", "https://fitit.example/api", "0.5.0");
        http = new FakeHttp();
    }

    private void queue(String tmpId, int workoutId, double weight) throws Exception {
        store.enqueue(new JSONObject()
                .put("tmpId", tmpId)
                .put("workoutId", workoutId)
                .put("payload", new JSONObject()
                        .put("exercise_name", "Bench Press")
                        .put("reps", 8)
                        .put("weight", weight)));
    }

    private QueueDrainer.Outcome drain() {
        return new QueueDrainer(store, http).drain();
    }

    @Test
    public void sendsEverySetInOrderAndEmptiesTheQueue() throws Exception {
        queue("tmp-1", 1, 60);
        queue("tmp-2", 1, 65);
        http.answer(201, WORKOUT).answer(201, WORKOUT);

        QueueDrainer.Outcome outcome = drain();

        assertEquals(QueueDrainer.Status.DONE, outcome.status);
        assertEquals(2, outcome.sent);
        assertEquals(60, http.bodies.get(0).getDouble("weight"), 0);
        assertEquals(65, http.bodies.get(1).getDouble("weight"), 0);
        assertTrue(store.queue().isEmpty());
    }

    @Test
    public void postsToTheWorkoutWithTheTokenAndTheClientVersion() throws Exception {
        queue("tmp-1", 7, 60);
        http.answer(201, WORKOUT);

        drain();

        assertEquals("https://fitit.example/api/workouts/7/sets", http.urls.get(0));
        assertEquals("Bearer jwt-abc", http.headers.get(0).get("Authorization"));
        assertEquals("0.5.0", http.headers.get(0).get("X-Client-Version"));
        assertEquals("application/json", http.headers.get(0).get("Content-Type"));
        // El client_id viaja: es lo que hace inofensivo un reintento.
        assertTrue(http.bodies.get(0).has("client_id"));
    }

    @Test
    public void handsBackTheLastWorkoutTheServerAnsweredWith() throws Exception {
        queue("tmp-1", 1, 60);
        http.answer(201, "{\"id\":1,\"sets\":[{\"id\":9}]}");

        QueueDrainer.Outcome outcome = drain();

        assertEquals(9, outcome.lastWorkout.getJSONArray("sets").getJSONObject(0).getInt("id"));
    }

    @Test
    public void aRetryTheServerRecognisesCountsAsSent() throws Exception {
        // 200 en vez de 201: ya la tenía (client_id). Sale de la cola igual.
        queue("tmp-1", 1, 60);
        http.answer(200, WORKOUT);

        assertEquals(1, drain().sent);
        assertTrue(store.queue().isEmpty());
    }

    @Test
    public void noSignalKeepsEverythingAndAsksToRetry() throws Exception {
        queue("tmp-1", 1, 60);
        queue("tmp-2", 1, 65);
        http.noSignal();

        QueueDrainer.Outcome outcome = drain();

        assertEquals(QueueDrainer.Status.RETRY, outcome.status);
        assertEquals(2, store.queue().size());
        // Se para en el primero: lo de detrás conserva su sitio.
        assertEquals(1, http.urls.size());
    }

    @Test
    public void aServerDownOrBusyIsWorthRetrying() throws Exception {
        for (int status : new int[] {500, 502, 503, 429, 408}) {
            store.drop("tmp-1");
            queue("tmp-1", 1, 60);
            http.answer(status, "");

            assertEquals("status " + status, QueueDrainer.Status.RETRY, drain().status);
            assertEquals(1, store.queue().size());
        }
    }

    @Test
    public void anExpiredTokenWaitsForANewOneInsteadOfRetrying() throws Exception {
        // Reintentar con el mismo token dará 401 siempre. La app, al volver a
        // entrar, copia el nuevo y pide otro envío.
        queue("tmp-1", 1, 60);
        http.answer(401, "");

        QueueDrainer.Outcome outcome = drain();

        assertEquals(QueueDrainer.Status.WAIT, outcome.status);
        assertEquals(1, store.queue().size());
        // Y se apunta: los widgets dicen «Sesión caducada» hasta que la app dé
        // una sesión nueva (DESIGN.md, «Sesión caducada»).
        assertTrue(store.sessionExpired());
    }

    @Test
    public void aFreshSessionFromTheAppForgetsTheExpiry() throws Exception {
        queue("tmp-1", 1, 60);
        http.answer(401, "");
        drain();

        store.setSession("jwt-new", "https://fitit.example/api", "0.10.0");

        assertFalse(store.sessionExpired());
        // Las series siguen ahí, esperando a ese token.
        assertEquals(1, store.queue().size());
    }

    @Test
    public void withNoTokenAtAllItIsNotExpired() throws Exception {
        // Sin token no hubo sesión que caducara: nada que decir en el widget.
        store.clearToken();
        queue("tmp-1", 1, 60);

        drain();

        assertFalse(store.sessionExpired());
    }

    @Test
    public void aRefusedSetIsDroppedCountedAndTheRestGoOn() throws Exception {
        // Un 422 será un 422 siempre; esperarlo bloquearía todo lo de detrás.
        queue("tmp-1", 1, 60);
        queue("tmp-2", 1, 65);
        http.answer(422, "{\"detail\":\"nope\"}").answer(201, WORKOUT);

        QueueDrainer.Outcome outcome = drain();

        assertEquals(QueueDrainer.Status.DONE, outcome.status);
        assertEquals(1, outcome.rejected);
        assertEquals(1, outcome.sent);
        assertTrue(store.queue().isEmpty());
        assertEquals(1, store.takeRejected());
    }

    @Test
    public void withNoTokenNothingIsSentAndNothingIsLost() throws Exception {
        store.clearToken();
        queue("tmp-1", 1, 60);

        QueueDrainer.Outcome outcome = drain();

        assertEquals(QueueDrainer.Status.WAIT, outcome.status);
        assertTrue(http.urls.isEmpty());
        assertEquals(1, store.queue().size());
    }

    @Test
    public void anEmptyQueueIsDoneWithoutTouchingTheNetwork() {
        QueueDrainer.Outcome outcome = drain();

        assertEquals(QueueDrainer.Status.DONE, outcome.status);
        assertTrue(http.urls.isEmpty());
        assertNull(outcome.lastWorkout);
    }

    @Test
    public void picksUpASetQueuedWhileItWasSending() throws Exception {
        // Relee la cabeza en cada vuelta: lo que entra durante el envío sale en
        // el mismo, no espera al siguiente aviso.
        queue("tmp-1", 1, 60);
        QueueDrainer.Http slow = (url, h, body) -> {
            if (store.queue().size() == 1 && http.urls.isEmpty()) {
                try {
                    queue("tmp-2", 1, 65);
                } catch (Exception e) {
                    throw new AssertionError(e);
                }
            }
            return http.post(url, h, body);
        };
        http.answer(201, WORKOUT).answer(201, WORKOUT);

        QueueDrainer.Outcome outcome = new QueueDrainer(store, slow).drain();

        assertEquals(2, outcome.sent);
        assertTrue(store.queue().isEmpty());
    }
}
