Feature: Days I looked after myself
  The north star of the app is not a streak: it is how many days I looked after
  myself — said what I ate, or trained — counted over a window, so one bad day
  does not wipe anything out. The app only says which days count; the screens
  count them over the window they show.

  Scenario: A day with something eaten counts
    Given I ate something on 2026-10-14
    When I ask which days I looked after myself from 2026-10-12 to 2026-10-18
    Then the days are 2026-10-14

  Scenario: A day I trained counts, even with nothing eaten
    Given I trained on 2026-10-15
    When I ask which days I looked after myself from 2026-10-12 to 2026-10-18
    Then the days are 2026-10-15

  Scenario: A workout with no sets does not count
    Given I opened a workout on 2026-10-16 and logged nothing
    When I ask which days I looked after myself from 2026-10-12 to 2026-10-18
    Then no day counts

  Scenario: Days outside the window are not counted
    Given I ate something on 2026-10-10
    And I trained on 2026-10-15
    When I ask which days I looked after myself from 2026-10-12 to 2026-10-18
    Then the days are 2026-10-15
