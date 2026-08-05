Feature: How long a session took
  A workout carries the moment of each of its sets, so how long it took is
  already recorded — nobody has to start or stop a clock. What has to be
  decided is what counts: the training, not the hours the app was left open
  on a session somebody walked away from.

  Scenario: The session lasted from its first set to its last
    Given an exercise "Bench Press"
    And a workout started today
    And a set performed 50 minutes ago
    And a set performed 35 minutes ago
    And a set performed 20 minutes ago
    Then the workout took 30 minutes

  Scenario: A long break is not training
    Given an exercise "Bench Press"
    And a workout started today
    And a set performed 300 minutes ago
    And a set performed 280 minutes ago
    And a set performed 40 minutes ago
    And a set performed 25 minutes ago
    Then the workout took 35 minutes

  Scenario: One set is a set, not a session
    Given an exercise "Bench Press"
    And a workout started today
    And a set performed 20 minutes ago
    Then the workout has no length

  Scenario: A session typed in afterwards has no length of its own
    Given an exercise "Bench Press"
    And a workout on a day three days ago
    And a set performed 3 minutes ago
    And a set performed 2 minutes ago
    Then the workout has no length

  Scenario: The length travels with the day feed
    Given an exercise "Bench Press"
    And a workout started today
    And a set performed 50 minutes ago
    And a set performed 20 minutes ago
    Then the day feed reports a workout that took 30 minutes
