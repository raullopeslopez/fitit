Feature: Log a workout set
  As someone tracking workouts, I can log a set so my history is recorded.

  Scenario: Log a set for an exercise
    Given an exercise "Bench Press"
    And a workout started today
    When I log a set of 8 reps at 60 kg for "Bench Press"
    Then the workout contains 1 set for "Bench Press"
    And that set records 8 reps at 60 kg
