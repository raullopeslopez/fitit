# SLICE 3 spec — not yet bound to step definitions.
# Bind it when you start this slice with /tdd, then implement PATCH/DELETE
# /workouts/sets/{id} to green.
Feature: Correct a logged set
  I fat-finger weights at the gym, so I can fix or delete a set.

  Scenario: Edit a set's weight
    Given a logged set of 8 reps at 60 kg for "Bench Press"
    When I change that set to 62.5 kg
    Then that set records 8 reps at 62.5 kg

  Scenario: Delete a set
    Given a logged set of 8 reps at 60 kg for "Bench Press"
    When I delete that set
    Then the workout contains no sets for "Bench Press"
