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

  # Reopening the app mid-session rebuilds the cards from the log, and each one
  # has to ask again what the mark to beat is. Without excluding the session I
  # am standing in, it answers with my own sets from ten minutes ago: the mark
  # to beat becomes today's best, which nothing today can beat.
  Scenario: The session I am in is not its own previous mark
    Given I logged "Bench Press" at 60 kg x 8 in a previous workout
    And I logged "Bench Press" at 80 kg x 8 in the workout I am in now
    When I ask for the previous marks of "Bench Press" excluding the workout I am in
    Then I see previous marks of 8 reps at 60 kg
    And the best estimated 1RM is 76.0
