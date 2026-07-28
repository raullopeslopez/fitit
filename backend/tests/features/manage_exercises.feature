Feature: Clean up the exercise list
  A name typed wrong on a busy gym floor becomes a second exercise, and its sets
  land on the duplicate instead of the real lift. Two ways out: fold the
  duplicate into the real one, or delete it outright with everything it holds.

  Scenario: Delete an exercise and its sets
    Given an exercise "Fondo"
    And a workout started today
    When I log a set of 5 reps at 30 kg for "Fondo"
    And I delete the exercise "Fondo"
    Then "Fondo" is not in my exercises
    And the workout has no sets left

  Scenario: Merge a duplicate into the real exercise
    Given an exercise "Fondos"
    And a workout started today
    When I log a set of 5 reps at 30 kg for "Fondos"
    And I log a set of 8 reps at 20 kg for "Fondo"
    And I merge "Fondo" into "Fondos"
    Then "Fondo" is not in my exercises
    And "Fondos" has 2 sets
