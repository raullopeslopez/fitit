"""How long a session took, from the moments its sets carry.

Nobody starts or stops a clock: every set records when it was performed
(see `SetIn.performed_at`), so the length is already in the data. What this
module decides is what counts as training.

Spec: tests/features/session_length.feature
"""

from collections.abc import Iterable
from datetime import UTC, date, datetime, time, timedelta

# The gap that ends a session. Rests run long — a heavy triple, a phone call,
# a queue for the rack — but past three quarters of an hour you are not resting
# between sets, you left. Without this cut, one forgotten session logged at 9:00
# and picked up again at 22:00 reads as a thirteen-hour workout.
GAP = timedelta(minutes=45)

# How far a set may sit from the day it belongs to and still date it. Sets are
# stamped in UTC and the day is a local calendar date, so a late-evening session
# legitimately lands on either side of midnight — twelve hours covers any
# timezone. Beyond that the sets weren't performed that day, they were typed in
# afterwards ("Otra fecha"), and their moments time the typing, not the lifting.
BACKFILL_WINDOW = timedelta(hours=12)


def _aware(moment: datetime) -> datetime:
    """SQLite hands back naive datetimes; every moment stored here is UTC."""
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def session_length(moments: Iterable[datetime], day: date) -> int | None:
    """Seconds of training in one session, or None when there is nothing to say.

    Sets separated by more than `GAP` belong to different blocks; the length is
    the sum of the blocks, so the walk to the car doesn't count as training.

    None, never 0: a lone set has no span, and a span of zero seconds is not a
    number worth printing under a session. None is "we don't know", which is
    what the screen needs in order to say nothing.
    """
    ordered = sorted(_aware(m) for m in moments)
    if len(ordered) < 2:
        return None

    opens = datetime.combine(day, time.min, tzinfo=UTC) - BACKFILL_WINDOW
    closes = datetime.combine(day, time.max, tzinfo=UTC) + BACKFILL_WINDOW
    if ordered[0] < opens or ordered[-1] > closes:
        return None

    total = timedelta()
    block_start = ordered[0]
    for previous, moment in zip(ordered, ordered[1:]):
        if moment - previous > GAP:
            total += previous - block_start
            block_start = moment
    total += ordered[-1] - block_start
    return int(total.total_seconds()) or None
