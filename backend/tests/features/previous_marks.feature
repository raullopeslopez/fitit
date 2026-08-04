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

  # The bar a set has to clear to be called a record. The card used to compare
  # against the sets of my last session alone, so a week where I went lighter
  # reset the bar and everything the week after wore a record badge. A record is
  # against everything I have ever done at that rep count, or it means nothing.
  Scenario: The bar to beat is my best ever, not my last session
    Given I logged "Bench Press" at 100 kg x 5 in a previous workout
    And I logged "Bench Press" at 80 kg x 5 in a previous workout
    When I ask for the previous marks of "Bench Press"
    Then the bar to beat at 5 reps is 100 kg

  # One bar per rep count, not one number: 120 x 2 says nothing about whether
  # 100 x 8 is a record, and collapsing them into a single estimated 1RM is how
  # a heavy double stops you ever setting a record for reps again.
  Scenario: Each rep count keeps its own bar
    Given I logged "Squat" at 120 kg x 2 in a previous workout
    And I logged "Squat" at 100 kg x 8 in a previous workout
    When I ask for the previous marks of "Squat"
    Then the bar to beat at 2 reps is 120 kg
    And the bar to beat at 8 reps is 100 kg

  Scenario: A lift I have never done has no bar to beat
    Given I have never logged "Face Pull"
    When I ask for the previous marks of "Face Pull"
    Then there is no bar to beat

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
    And the bar to beat at 8 reps is 60 kg

  # "Última vez · hace 3 días" was computed from the row's write timestamp, not
  # from the day I trained. The backend already picks the last workout by
  # training date, so the two disagree the moment I log a session on another
  # date: Monday's workout entered on Thursday read as "hoy".
  Scenario: The marks carry the day I trained, not the day I typed them
    Given I logged "Bench Press" at 60 kg x 8 on "2026-07-20"
    When I ask for the previous marks of "Bench Press"
    Then the previous marks are dated "2026-07-20"

  Scenario: A lift with no history has no date either
    Given I have never logged "Face Pull"
    When I ask for the previous marks of "Face Pull"
    Then the previous marks have no date
