package io.github.raullopeslopez.fitit.session;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import androidx.work.NetworkType;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;
import androidx.work.testing.WorkManagerTestInitHelper;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

// Pedir un envío: con red, y uno detrás de otro, nunca dos a la vez sobre la
// misma cola (mandarían la misma serie dos veces).
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class SessionSenderTest {
    private Context context;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        WorkManagerTestInitHelper.initializeTestWorkManager(context);
    }

    private List<WorkInfo> sends() throws Exception {
        return WorkManager.getInstance(context)
                .getWorkInfosForUniqueWork(SessionSender.UNIQUE_WORK)
                .get();
    }

    @Test
    public void asksForASendThatWaitsForTheNetwork() throws Exception {
        SessionSender.schedule(context);

        List<WorkInfo> sends = sends();
        assertEquals(1, sends.size());
        assertEquals(
                NetworkType.CONNECTED,
                sends.get(0).getConstraints().getRequiredNetworkType());
    }

    @Test
    public void aSecondRequestQueuesBehindTheFirstInsteadOfRunningAlongside() throws Exception {
        SessionSender.schedule(context);
        SessionSender.schedule(context);

        // Una cadena, no dos trabajos sueltos: sólo uno puede estar en marcha.
        List<WorkInfo> sends = sends();
        assertEquals(2, sends.size());
        long running = sends.stream()
                .filter(w -> w.getState() == WorkInfo.State.ENQUEUED)
                .count();
        assertTrue("at most one ready to run, got " + running, running <= 1);
    }
}
