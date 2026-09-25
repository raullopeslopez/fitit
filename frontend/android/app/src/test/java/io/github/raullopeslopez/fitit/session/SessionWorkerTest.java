package io.github.raullopeslopez.fitit.session;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import androidx.work.ListenableWorker;
import androidx.work.testing.TestWorkerBuilder;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

// El trabajo de WorkManager: vacía la cola y avisa a quien escuche (la app, si
// está abierta). Lo que decide cada respuesta está en QueueDrainerTest; aquí,
// que el resultado llega a WorkManager y al aviso.
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class SessionWorkerTest {
    private Context context;
    private SessionStore store;
    private QueueDrainerTest.FakeHttp http;
    private final List<QueueDrainer.Outcome> heard = new ArrayList<>();
    private final SessionEvents.Listener listener = heard::add;

    @Before
    public void setUp() throws Exception {
        context = ApplicationProvider.getApplicationContext();
        store = new SessionStore(context, new SessionStoreTest.FakeCipher());
        store.setSession("jwt-abc", "https://fitit.example/api", "0.5.0");
        store.enqueue(new JSONObject()
                .put("tmpId", "tmp-1")
                .put("workoutId", 1)
                .put("payload", new JSONObject()
                        .put("exercise_name", "Bench Press")
                        .put("reps", 8)
                        .put("weight", 60)));
        http = new QueueDrainerTest.FakeHttp();
        Session.useForTests(store, http);
        SessionEvents.add(listener);
    }

    @After
    public void tearDown() {
        SessionEvents.remove(listener);
        Session.useForTests(null, null);
    }

    private ListenableWorker.Result run() {
        return TestWorkerBuilder.from(context, SessionWorker.class, Executors.newSingleThreadExecutor())
                .build()
                .doWork();
    }

    @Test
    public void sendsTheQueueAndTellsTheApp() {
        http.answer(201, "{\"id\":1,\"sets\":[]}");

        assertEquals(ListenableWorker.Result.success(), run());
        assertTrue(store.queue().isEmpty());
        assertEquals(1, heard.size());
        assertEquals(1, heard.get(0).sent);
        assertNotNull(heard.get(0).lastWorkout);
    }

    @Test
    public void noSignalAsksWorkManagerToTryAgain() {
        http.noSignal();

        assertEquals(ListenableWorker.Result.retry(), run());
        assertEquals(1, store.queue().size());
    }

    @Test
    public void waitingForATokenIsNotAFailureToRetry() {
        // Sin token, reintentar con espera no arregla nada: lo arregla la app
        // al volver a entrar, que pide otro envío.
        store.clearToken();

        assertEquals(ListenableWorker.Result.success(), run());
        assertEquals(1, store.queue().size());
    }
}
