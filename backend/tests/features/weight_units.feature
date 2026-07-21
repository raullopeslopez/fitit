Feature: Weight units
  I train in kilos but the unit toggle is sticky, so sooner or later I log a
  whole exercise in the wrong one. Every mark is compared in kilos regardless of
  what I typed, and a mislabelled block is fixed in one go without retyping it.

  Scenario: A set logged in pounds is comparable in kilos
    Given a logged set of 8 reps at 135 lb for "Bench Press"
    Then that set reports 61.2 kg

  Scenario: Records rank across mixed units
    Given a logged set of 5 reps at 100 kg for "Squat"
    And a logged set of 5 reps at 135 lb for "Squat"
    Then the best mark for "Squat" is 100 kg

  Scenario: Relabel an exercise logged in the wrong unit
    Given a workout with 3 sets of 8 reps at 135 kg for "Bench Press"
    When I relabel "Bench Press" in that workout as lb
    Then those sets still read 135
    And those sets report 61.2 kg

  Scenario: Relabelling leaves other exercises alone
    Given a workout with 3 sets of 8 reps at 135 kg for "Bench Press"
    And that workout also has a set of 5 reps at 100 kg for "Squat"
    When I relabel "Bench Press" in that workout as lb
    Then the "Squat" set still reports 100 kg
