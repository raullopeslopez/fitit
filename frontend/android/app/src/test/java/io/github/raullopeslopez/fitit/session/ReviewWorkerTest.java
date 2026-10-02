package io.github.raullopeslopez.fitit.session;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import androidx.work.ListenableWorker;
import androidx.work.NetworkType;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;
import androidx.work.testing.TestWorkerBuilder;
import androidx.work.testing.WorkManagerTestInitHelper;
import java.io.IOException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

// El aviso de la revisión semanal: lo que decide está en ReviewCheckTest; aquí,
// que sin sesión no pregunta, que avisa una vez, y que un fallo no reintenta.
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class ReviewWorkerTest {
    private static final class FakeReviewHttp implements ReviewHttp {
        final List<String> urls = new ArrayList<>();
        final List<Map<String, String>> headers = new ArrayList<>();
        QueueDrainer.Response answer;
        IOException failure;

        @Override
        public QueueDrainer.Response get(String url, Map<String, String> h) throws IOException {
            urls.add(url);
            headers.add(h);
            if (failure != null) throw failure;
            return answer;
        }
    }

    private Context context;
    private SessionStore store;
    private FakeReviewHttp http;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        store = new SessionStore(context, new SessionStoreTest.FakeCipher());
        store.setSession("jwt-abc", "https://fitit.example/api", "0.11.0");
        http = new FakeReviewHttp();
        Session.useForTests(store, new QueueDrainerTest.FakeHttp());
        ReviewWorker.useForTests(http);
        // Un día limpio: lo avisado en otro test no cuenta.
        context.getSharedPreferences(SessionStore.PREFS, Context.MODE_PRIVATE)
                .edit().remove(ReviewWorker.LAST_NOTIFIED).apply();
        context.getSystemService(NotificationManager.class).cancelAll();
    }

    @After
    public void tearDown() {
        ReviewWorker.useForTests(null);
        Session.useForTests(null, null);
    }

    private ListenableWorker.Result run() {
        return TestWorkerBuilder.from(context, ReviewWorker.class, Executors.newSingleThreadExecutor())
                .build()
                .doWork();
    }

    private void answerDueToday() {
        http.answer = new QueueDrainer.Response(200, "{\"review_date\":\""
                + LocalDate.now() + "\",\"period_from\":\"x\",\"period_to\":\"y\","
                + "\"due\":true,\"answer\":null}");
    }

    private int shown() {
        return shadowOf(context.getSystemService(NotificationManager.class))
                .getAllNotifications().size();
    }

    @Test
    public void withoutATokenItAsksNothing() {
        store.clearToken();

        assertEquals(ListenableWorker.Result.success(), run());
        assertTrue(http.urls.isEmpty());
        assertEquals(0, shown());
    }

    @Test
    public void withAnExpiredSessionItAsksNothing() {
        store.markExpired();

        assertEquals(ListenableWorker.Result.success(), run());
        assertTrue(http.urls.isEmpty());
    }

    @Test
    public void dueTodayNotifiesOnceWithTheQueueHeaders() {
        answerDueToday();

        assertEquals(ListenableWorker.Result.success(), run());

        assertEquals("https://fitit.example/api/targets/review", http.urls.get(0));
        assertEquals("Bearer jwt-abc", http.headers.get(0).get("Authorization"));
        assertEquals("0.11.0", http.headers.get(0).get("X-Client-Version"));
        assertEquals(1, shown());
        Notification n = shadowOf(context.getSystemService(NotificationManager.class))
                .getAllNotifications().get(0);
        assertEquals("Revisión semanal", n.extras.getString(Notification.EXTRA_TITLE));
        assertEquals("Tu semana está lista. ¿Ajustamos el objetivo?",
                n.extras.getString(Notification.EXTRA_TEXT));
        assertEquals(ReviewWorker.CHANNEL, n.getChannelId());
        assertNotNull(n.contentIntent);
    }

    @Test
    public void aSecondRunTheSameDayDoesNotNotifyAgain() {
        answerDueToday();
        run();
        context.getSystemService(NotificationManager.class).cancelAll();

        assertEquals(ListenableWorker.Result.success(), run());

        assertEquals(0, shown());
    }

    @Test
    public void notDueDoesNotNotify() {
        http.answer = new QueueDrainer.Response(200, "{\"review_date\":\""
                + LocalDate.now() + "\",\"due\":false}");

        assertEquals(ListenableWorker.Result.success(), run());

        assertEquals(0, shown());
    }

    @Test
    public void aNetworkErrorIsSuccessNotARetry() {
        http.failure = new IOException("unreachable");

        assertEquals(ListenableWorker.Result.success(), run());
        assertEquals(0, shown());
    }

    @Test
    public void aServerErrorOrA401IsSuccessAndSilent() {
        http.answer = new QueueDrainer.Response(500, "oops");
        assertEquals(ListenableWorker.Result.success(), run());

        http.answer = new QueueDrainer.Response(401, "{\"detail\":\"nope\"}");
        assertEquals(ListenableWorker.Result.success(), run());

        assertEquals(0, shown());
        // Un 401 aquí no marca la sesión como caducada: eso es cosa de la cola.
        assertEquals(false, store.sessionExpired());
    }

    @Test
    public void schedulingIsOneDailyJobThatKeepsItsClockAndNeedsNetwork() throws Exception {
        WorkManagerTestInitHelper.initializeTestWorkManager(context);

        ReviewScheduler.schedule(context);
        ReviewScheduler.schedule(context);

        List<WorkInfo> infos = WorkManager.getInstance(context)
                .getWorkInfosForUniqueWork(ReviewScheduler.UNIQUE_WORK).get();
        assertEquals(1, infos.size());
        assertEquals(NetworkType.CONNECTED, infos.get(0).getConstraints().getRequiredNetworkType());
    }
}
