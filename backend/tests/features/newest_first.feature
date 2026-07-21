Feature: The newest work comes first
  I open Fitit mid-session with a phone in one hand. What I did most recently is
  what I am still working on, so it belongs at the top of the screen rather than
  buried under everything that came before it.

  Scenario: Days already read newest first
    Given a workout on 2026-07-19
    And a workout on 2026-07-21
    When I list my training days
    Then the days read 2026-07-21, 2026-07-19

  Scenario: The newest workout of a day is listed first
    Given a training day with workouts "Mañana" then "Tarde"
    When I list my training days
    Then that day's workouts read "Tarde", "Mañana"

  Scenario: A workout's own sets stay in the order they were logged
    Given a workout with sets logged for "Press banca" then "Dominadas"
    When I open that workout
    Then its sets read "Press banca", "Dominadas"
