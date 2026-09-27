Feature: Remove an exercise from one workout
  Skipping a lift today is not deleting it. Taking an exercise out of a workout
  removes that workout's sets for it and nothing else: the exercise, and every
  set it has in other workouts, stay.

  Scenario: The other workouts keep their sets
    Given "Bench Press" logged in two workouts
    When I remove "Bench Press" from the first workout
    Then the first workout contains no sets for "Bench Press"
    And the second workout still has its sets for "Bench Press"
    And "Bench Press" is still an exercise

  Scenario: The other exercises in the same workout stay
    Given a workout with sets for "Bench Press" and "Row"
    When I remove "Bench Press" from that workout
    Then that workout still has its sets for "Row"

  # Idempotent, as a DELETE should be: a retry from the offline queue after the
  # first one landed finds nothing left and that is not an error.
  Scenario: Removing it twice is not an error
    Given "Bench Press" logged in two workouts
    When I remove "Bench Press" from the first workout
    And I remove "Bench Press" from the first workout
    Then the answer is 204
    And the second workout still has its sets for "Bench Press"

  Scenario: A workout that does not exist is a 404
    Given "Bench Press" logged in two workouts
    When I remove "Bench Press" from workout 999999
    Then the answer is 404

  Scenario: An exercise that does not exist is a 404
    Given "Bench Press" logged in two workouts
    When I remove exercise 999999 from the first workout
    Then the answer is 404
