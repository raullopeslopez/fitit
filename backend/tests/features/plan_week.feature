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

  # El plan propone; confirmar es lo que escribe en el diario.
  Scenario: Confirming a planned meal writes it in the diary
    Given a repertoire of 12 dishes
    When I generate this week
    And I confirm the comida of today
    Then the diary of today has that meal
    And the plan says that meal is done

  Scenario: Confirming twice does not write it twice
    Given a repertoire of 12 dishes
    When I generate this week
    And I confirm the comida of today
    And I confirm the comida of today again
    Then the diary of today has that meal only once

  Scenario: Skipping a meal writes nothing
    Given a repertoire of 12 dishes
    When I generate this week
    And I skip the comida of today
    Then the diary of today is empty
    And the plan says that meal is skipped

  # La regla del `NULL`, en el dominio nuevo: un plan que no confirmaste no es
  # un plan incumplido.
  Scenario: A meal I said nothing about is not skipped
    Given a repertoire of 12 dishes
    When I generate this week
    Then the comida of today says nothing yet

  Scenario: A day that is not the one I am living is not confirmed
    Given a repertoire of 12 dishes
    When I generate this week
    And I try to confirm the comida of the last day of the week
    Then it says that is not today

  Scenario: Every meal of the plan says what it adds up to
    Given a repertoire of 12 dishes
    When I generate the week of 2026-09-21
    Then every meal says its kcal
