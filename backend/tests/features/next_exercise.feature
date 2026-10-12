Feature: What I usually do after an exercise
  I don't plan sessions: I log exercises as I go. When I finish one, the next is
  almost always the one I did after it last time, so Entreno offers it at the
  bottom of the screen — «Después de press banca sueles hacer» — one tap away.

  "After" means the next exercise I started in that session, in the order of
  each one's first set. What I did most often after it comes first, and on a tie
  the most recent. Only the last 8 sessions that include it count: a habit I
  dropped months ago is not what I usually do.

  Scenario: What I did right after it last time is offered
    Given a session 3 days ago with "Press banca", "Fondos", "Aperturas"
    When I ask what I usually do after "Press banca"
    Then the suggestions are "Fondos"

  Scenario: What I did most often after it comes first
    Given a session 9 days ago with "Press banca", "Fondos"
    And a session 6 days ago with "Press banca", "Fondos"
    And a session 3 days ago with "Press banca", "Aperturas"
    When I ask what I usually do after "Press banca"
    Then the suggestions are "Fondos" then "Aperturas"

  Scenario: On a tie, the most recent comes first
    Given a session 6 days ago with "Press banca", "Fondos"
    And a session 3 days ago with "Press banca", "Aperturas"
    When I ask what I usually do after "Press banca"
    Then the suggestions are "Aperturas" then "Fondos"

  # The order is when each exercise started, not when its last set was written:
  # going back to bench for one more set after the dips doesn't put bench after
  # dips.
  Scenario: Going back for one more set does not change the order
    Given a session 3 days ago with "Press banca", "Fondos", then one more set of "Press banca"
    When I ask what I usually do after "Fondos"
    Then nothing is suggested

  Scenario: The last exercise of a session has nothing after it
    Given a session 3 days ago with "Press banca", "Fondos"
    When I ask what I usually do after "Fondos"
    Then nothing is suggested

  # The session I am standing in is today's, and it is still being written:
  # whatever I did after bench today is not a habit yet.
  Scenario: The session I am in does not count
    Given a session today with "Press banca", "Remo"
    When I ask what I usually do after "Press banca" excluding that session
    Then nothing is suggested

  Scenario: Only the last 8 sessions with it count
    Given 1 session long ago with "Press banca", "Aperturas"
    And 8 sessions after that with "Press banca", "Fondos"
    When I ask what I usually do after "Press banca"
    Then the suggestions are "Fondos"

  Scenario: At most three suggestions
    Given a session 12 days ago with "Press banca", "Fondos"
    And a session 9 days ago with "Press banca", "Aperturas"
    And a session 6 days ago with "Press banca", "Remo"
    And a session 3 days ago with "Press banca", "Curl"
    When I ask what I usually do after "Press banca"
    Then there are 3 suggestions

  # The name I type is the name I see; casing and accents are not a different
  # exercise, the same rule the rest of the log follows.
  Scenario: The name is matched the way the log matches names
    Given a session 3 days ago with "Press banca", "Fondos"
    When I ask what I usually do after "press BANCA"
    Then the suggestions are "Fondos"

  Scenario: An exercise I never did has nothing to suggest
    Given I have logged nothing
    When I ask what I usually do after "Press banca"
    Then nothing is suggested
