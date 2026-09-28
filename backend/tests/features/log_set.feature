Feature: Log a workout set
  As someone tracking workouts, I can log a set so my history is recorded.

  Scenario: Log a set for an exercise
    Given an exercise "Bench Press"
    And a workout started today
    When I log a set of 8 reps at 60 kg for "Bench Press"
    Then the workout contains 1 set for "Bench Press"
    And that set records 8 reps at 60 kg

  # A set queued offline is retried until an answer arrives. When the server
  # saved it but the answer was lost, the retry must not log it a second time:
  # the phone stamps each set with its own id, and the server recognises it.
  Scenario: A retried set is logged only once
    Given an exercise "Bench Press"
    And a workout started today
    When I log a set of 8 reps at 60 kg for "Bench Press" with client id "a1b2"
    And I log a set of 8 reps at 60 kg for "Bench Press" with client id "a1b2"
    Then the retry is answered as already logged
    And the workout contains 1 set for "Bench Press"

  Scenario: Different client ids are different sets
    Given an exercise "Bench Press"
    And a workout started today
    When I log a set of 8 reps at 60 kg for "Bench Press" with client id "a1b2"
    And I log a set of 8 reps at 60 kg for "Bench Press" with client id "c3d4"
    Then the workout contains 2 sets for "Bench Press"

  # An older client sends no id at all, and two identical sets are two sets.
  Scenario: Sets without a client id are never merged
    Given an exercise "Bench Press"
    And a workout started today
    When I log a set of 8 reps at 60 kg for "Bench Press"
    And I log a set of 8 reps at 60 kg for "Bench Press"
    Then the workout contains 2 sets for "Bench Press"

  # The phone knows a queued set only by its own id. Answering with it is what
  # lets something said about the set before it arrived — how many reps were
  # left in reserve — find the set once it has a server id.
  Scenario: The logged set carries its client id back
    Given an exercise "Bench Press"
    And a workout started today
    When I log a set of 8 reps at 60 kg for "Bench Press" with client id "a1b2"
    Then that set carries the client id "a1b2"
