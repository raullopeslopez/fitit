Feature: A set keeps the moment it was done
  Sets logged with no signal reach the server whenever the phone finds a
  network — minutes or hours after the lift. The server's arrival time is
  the wrong answer to "when did you do this", and everything downstream
  that measures a session's length reads it.

  Scenario: A set logged offline keeps the moment it was performed
    Given an exercise "Bench Press"
    And a workout started today
    When I log a set for "Bench Press" performed 40 minutes ago
    Then that set is recorded as performed 40 minutes ago

  Scenario: A set with no moment of its own is stamped on arrival
    Given an exercise "Bench Press"
    And a workout started today
    When I log a set for "Bench Press" with no moment
    Then that set is recorded as performed just now

  Scenario: A phone whose clock says tomorrow does not get to say so
    Given an exercise "Bench Press"
    And a workout started today
    When I log a set for "Bench Press" performed 60 minutes from now
    Then that set is recorded as performed just now

  Scenario: A moment older than the queue could plausibly hold is ignored
    Given an exercise "Bench Press"
    And a workout started today
    When I log a set for "Bench Press" performed 30 days ago
    Then that set is recorded as performed just now
