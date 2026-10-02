package io.github.raullopeslopez.fitit.session;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.time.Duration;
import java.time.LocalDateTime;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

// La decisión de avisar: pendiente, de hoy y sin avisar ya. Robolectric sólo
// porque org.json es de Android y en JUnit a secas no está.
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class ReviewCheckTest {
    private static String body(boolean due, String reviewDate) {
        return "{\"review_date\":\"" + reviewDate + "\",\"period_from\":\"2026-09-27\","
                + "\"period_to\":\"2026-10-03\",\"due\":" + due + ",\"answer\":null}";
    }

    @Test
    public void notifiesWhenDueTodayAndNotNotifiedYet() {
        assertTrue(ReviewCheck.decide(body(true, "2026-10-04"), "2026-10-04", null));
        assertTrue(ReviewCheck.decide(body(true, "2026-10-04"), "2026-10-04", "2026-09-27"));
    }

    @Test
    public void staysQuietWhenNotDue() {
        assertFalse(ReviewCheck.decide(body(false, "2026-10-04"), "2026-10-04", null));
    }

    @Test
    public void staysQuietWhenTheReviewDayIsNotToday() {
        // due sigue en true hasta que se responde: el lunes ya no es el día del aviso.
        assertFalse(ReviewCheck.decide(body(true, "2026-10-04"), "2026-10-05", null));
        assertFalse(ReviewCheck.decide(body(true, "2026-10-04"), "2026-10-03", null));
    }

    @Test
    public void staysQuietWhenAlreadyNotifiedForThatReview() {
        assertFalse(ReviewCheck.decide(body(true, "2026-10-04"), "2026-10-04", "2026-10-04"));
    }

    @Test
    public void staysQuietOnAnythingItCannotRead() {
        assertFalse(ReviewCheck.decide("not json", "2026-10-04", null));
        assertFalse(ReviewCheck.decide("", "2026-10-04", null));
        assertFalse(ReviewCheck.decide(null, "2026-10-04", null));
        assertFalse(ReviewCheck.decide("{}", "2026-10-04", null));
        assertFalse(ReviewCheck.decide("{\"due\":true}", "2026-10-04", null));
        assertFalse(ReviewCheck.decide(
                "{\"due\":\"true\",\"review_date\":\"2026-10-04\"}", "2026-10-04", null));
    }

    @Test
    public void firstRunIsTheNextNineAm() {
        assertEquals(Duration.ofHours(3),
                ReviewScheduler.delayUntilNine(LocalDateTime.of(2026, 10, 2, 6, 0)));
        assertEquals(Duration.ofHours(23),
                ReviewScheduler.delayUntilNine(LocalDateTime.of(2026, 10, 2, 10, 0)));
        assertEquals(Duration.ofHours(24),
                ReviewScheduler.delayUntilNine(LocalDateTime.of(2026, 10, 2, 9, 0)));
    }
}
