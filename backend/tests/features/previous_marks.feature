Feature: Show previous marks
  When I add an exercise to a workout, I see what I did last time so I know the
  numbers to beat.

  Scenario: Previous marks appear when I add an exercise
    Given I logged "Bench Press" at 60 kg x 8 in a previous workout
    When I ask for the previous marks of "Bench Press"
    Then I see previous marks of 8 reps at 60 kg

  Scenario: No previous marks for a brand-new exercise
    Given I have never logged "Face Pull"
    When I ask for the previous marks of "Face Pull"
    Then I see no previous marks
