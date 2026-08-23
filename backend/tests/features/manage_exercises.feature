Feature: Clean up the exercise list
  A name typed wrong on a busy gym floor becomes a second exercise, and its sets
  land on the duplicate instead of the real lift. Two ways out: fold the
  duplicate into the real one, or delete it outright with everything it holds.
  Renaming the duplicate onto the real name is refused — and the refusal has to
  say which exercise took the name and how much it holds, or the offer to merge
  is a leap in the dark.

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

  Scenario: A refused rename names the exercise that holds the name
    Given an exercise "Fondos"
    And an exercise "Fondo"
    And a workout started today
    When I log a set of 5 reps at 30 kg for "Fondos"
    And I log a set of 8 reps at 20 kg for "Fondos"
    And I try to rename "Fondo" to "fondos"
    Then the rename is refused, pointing at "Fondos"
    And merging there would move 2 sets

  Scenario: An accent typed or left out is the same name
    Given an exercise "Extensión de tríceps"
    And an exercise "Curl"
    When I try to rename "Curl" to "Extension de triceps"
    Then the rename is refused, pointing at "Extensión de tríceps"

  Scenario: Logging without the accents lands on the exercise I already have
    Given an exercise "Extensión de tríceps"
    And a workout started today
    When I log a set of 12 reps at 25 kg for "Extension de triceps"
    Then "Extensión de tríceps" has 1 set
    And "Extension de triceps" is not in my exercises
