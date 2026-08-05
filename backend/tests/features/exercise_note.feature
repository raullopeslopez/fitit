Feature: A note that stays with the exercise
  A note written on one set vanishes into the log: by the next session the thing
  worth remembering — the grip, the seat height, the shoulder that complains —
  is buried under twenty rows of a workout nobody scrolls back to. This note
  belongs to the exercise instead, so it is still there the next time the card
  opens, and there is only ever one of it.

  Scenario: The note outlives the session it was written in
    Given an exercise "Press banca"
    When I note "agarre ancho, banco en 3" on "Press banca"
    Then "Press banca" carries the note "agarre ancho, banco en 3"

  Scenario: Clearing a note
    Given an exercise "Press banca"
    When I note "agarre ancho" on "Press banca"
    And I clear the note on "Press banca"
    Then "Press banca" carries no note

  # The note and the muscle group are edited from the same fold, and a PATCH
  # only touches the fields it carries — correcting one must not wipe the other.
  Scenario: Re-tagging the muscle leaves the note alone
    Given an exercise "Press banca"
    When I note "agarre ancho" on "Press banca"
    And I re-tag "Press banca" as "Espalda"
    Then "Press banca" carries the note "agarre ancho"
