Feature: What I trained in the last couple of days
  A muscle worked yesterday is still recovering today. When I open a workout I want
  to be told which groups are still fresh — not blocked, not scolded, just told —
  so I can pick the session knowing it.

  The evidence puts recovery at roughly 48 hours, and "today or yesterday" is that
  window in the unit the log actually keeps. Deliberately not computed from the
  sets' `created_at`: that is when the row was written, and a session logged after
  the fact would report the wrong day. The training day is the field that means
  what it says.

  Scenario: A muscle worked yesterday is still recent
    Given I trained "Curl femoral" yesterday
    When I ask what I trained recently
    Then "Femoral" is listed

  Scenario: A muscle worked four days ago is not
    Given I trained "Curl femoral" 4 days ago
    When I ask what I trained recently
    Then nothing is listed

  # The boundary is the whole claim, so it is worth pinning.
  Scenario: The window stops after yesterday
    Given I trained "Curl femoral" yesterday
    And I trained "Press banca" 2 days ago
    When I ask what I trained recently
    Then "Femoral" is listed
    And "Pecho" is not listed

  # Opening the session I am standing in and being told I trained chest today is
  # the app reading its own notes back to me.
  Scenario: The workout I am in does not report itself
    Given I trained "Press banca" today
    When I ask what I trained recently excluding that workout
    Then nothing is listed

  # A bench press works triceps, but indirect work is not a reason to call them
  # unrecovered. Only what the exercise is *for* counts — the same rule the
  # calendar follows.
  Scenario: Indirect work does not make a muscle recent
    Given I trained "Press banca" yesterday
    When I ask what I trained recently
    Then "Pecho" is listed
    And "Tríceps" is not listed

  Scenario: The most recent muscle comes first
    Given I trained "Curl femoral" yesterday
    And I trained "Press banca" today
    When I ask what I trained recently
    Then the groups are "Pecho" then "Femoral"

  # One group can be hit on both days. It is one muscle with one answer, and the
  # answer is the most recent one.
  Scenario: A muscle trained twice reports the later day
    Given I trained "Press banca" yesterday
    And I trained "Press inclinado" today
    When I ask what I trained recently
    Then "Pecho" is listed once, dated today

  Scenario: Nothing logged at all reports nothing
    Given I have logged nothing
    When I ask what I trained recently
    Then nothing is listed
