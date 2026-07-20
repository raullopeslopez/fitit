Feature: Show my best marks
  Progreso opens with the numbers I actually care about: my best lift per
  exercise, and whether it moved. A mark that has stood for months should look
  different from one I set last week.

  Scenario: My best mark per exercise, heaviest first
    Given I logged "Squat" at 100 kg x 5 in a previous workout
    And I logged "Bench Press" at 60 kg x 5 in a previous workout
    When I ask for my best marks
    Then I see "Squat" listed before "Bench Press"
    And the best mark for "Squat" is 5 reps at 100 kg

  Scenario: A mark that improved reports how much it moved
    Given I logged "Squat" at 100 kg x 5 in a previous workout
    And I logged "Squat" at 110 kg x 5 in a previous workout
    When I ask for my best marks
    Then the best mark for "Squat" is 5 reps at 110 kg
    And the best mark for "Squat" improved

  Scenario: A first-ever mark has nothing to improve on
    Given I logged "Deadlift" at 140 kg x 3 in a previous workout
    When I ask for my best marks
    Then the best mark for "Deadlift" has no improvement

  Scenario: A heavier day that is not a better mark leaves the record standing
    Given I logged "Squat" at 100 kg x 5 in a previous workout
    And I logged "Squat" at 105 kg x 1 in a previous workout
    When I ask for my best marks
    Then the best mark for "Squat" is 5 reps at 100 kg
    And the best mark for "Squat" has no improvement

  Scenario: Cardio has no best mark
    Given I ran "Treadmill" for 1800 seconds in a previous workout
    When I ask for my best marks
    Then "Treadmill" is not listed

  Scenario: No marks at all
    Given I have never logged "Face Pull"
    When I ask for my best marks
    Then I see no best marks
