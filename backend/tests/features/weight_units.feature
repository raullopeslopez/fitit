Feature: Weight units
  Everything is compared in kilos, whatever a set was typed in. This used to
  matter because the app offered a sticky kg/lb toggle; the toggle is gone, so
  from now on a set is logged in kilos and nothing else. What survives here is
  the storage rule — canonical kilos on every set — which is what keeps the
  pounds already in the log readable and comparable.

  # The relabel tool that used to live here has been removed with the toggle.
  # It existed to undo a mistake the toggle made possible, and it could not even
  # do that: it hid itself whenever a block mixed units, which is exactly the
  # shape the mistake takes when the toggle is flipped mid-session.

  Scenario: A set logged in pounds is comparable in kilos
    Given a logged set of 8 reps at 135 lb for "Bench Press"
    Then that set reports 61.2 kg

  Scenario: Records rank across mixed units
    Given a logged set of 5 reps at 100 kg for "Squat"
    And a logged set of 5 reps at 135 lb for "Squat"
    Then the best mark for "Squat" is 100 kg
