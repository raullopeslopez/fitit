Feature: The week, generated
  Instead of typing what I ate, the app proposes the week: four meals a day,
  seven days, built out of the dishes I already cook and adjusted so each day
  lands on its target. It never repeats a dish two days running, and it says
  which of my rules the week does not meet.

  Scenario: A week is seven days of four meals
    Given a repertoire of 12 dishes
    When I generate the week of 2026-09-21
    Then the plan has 28 entries
    And every day has a desayuno, a comida, a cena and a snack

  Scenario: The same week asked twice is the same week
    Given a repertoire of 12 dishes
    When I generate the week of 2026-09-21
    And I ask for the plan of 2026-09-21
    Then it is the same plan

  # §22: el plan tiene que ser el mismo el martes que el jueves.
  Scenario: Regenerating with another seed gives another week
    Given a repertoire of 12 dishes
    When I generate the week of 2026-09-21
    And I generate the week of 2026-09-21 with seed 99
    Then the week changed

  Scenario: No dish lands two days running
    Given a repertoire of 12 dishes
    When I generate the week of 2026-09-21
    Then no dish appears on two consecutive days

  Scenario: A dish only goes where it belongs
    Given a repertoire of 12 dishes
    And a dish "Tostada de aguacate" that only serves desayuno
    When I generate the week of 2026-09-21
    Then "Tostada de aguacate" never appears outside desayuno

  # Ni un 500: no poder llenar un hueco es una respuesta, no una avería.
  Scenario: With nothing to put in a slot, it says which slot
    Given a repertoire of 1 dish that only serves desayuno
    When I generate the week of 2026-09-21 and it cannot
    Then it names the slot it could not fill

  Scenario: The plan says which rules the week does not meet
    Given a repertoire of 12 dishes
    And a soft rule of pulses 3 times a week
    When I generate the week of 2026-09-21
    Then the plan reports the rule as broken

  Scenario: A week I never generated is not invented
    When I ask for the plan of 2026-10-05
    Then there is no plan
