Feature: Log a set with no weight
  Dominadas, fondos and abs carry no weight at all. Logging them as 0 kg made a
  real number out of the absence of one: it charted as a weight, it could beat a
  record, and the row read "0×12". A set with no weight is logged without one.

  Scenario: Log a bodyweight set
    Given an exercise "Fondos"
    And a workout started today
    When I log a set of 12 reps with no weight for "Fondos"
    Then the workout contains 1 set for "Fondos"
    And that set records 12 reps and no weight

  Scenario: A weightless set is not a record
    Given an exercise "Fondos"
    And a workout started today
    When I log a set of 12 reps with no weight for "Fondos"
    Then "Fondos" has no best mark

  Scenario: Reps are still required
    Given an exercise "Fondos"
    And a workout started today
    When I log a set with neither reps nor weight for "Fondos"
    Then the set is refused
