Feature: Putting a dish from an idea into this week's plan
  The idea ends where the week is decided. A dish saved from an idea is an
  ordinary dish, so the plan already knows how to take it: swapping an entry
  for another dish is what «Cambiar» does. What is new is arriving there from
  the idea instead of from the plan.

  Background:
    Given the catalogue has "Acelga, cruda"
    And an idea "Acelgas esparragadas" for "Acelga, cruda" saved as a dish with 250 g of "Acelga, cruda"

  Scenario: The dish takes the place of an entry in this week's plan
    Given a plan for this week with a "comida" on Thursday
    When I put the dish from the idea in Thursday's "comida"
    Then Thursday's "comida" is "Acelgas esparragadas"
    And the entry it replaced is marked as swapped

  # Un plato de una idea no ha dicho en qué huecos sirve, y eso se lee como
  # «vale para cualquiera»: negárselo lo dejaría fuera del plan entero.
  Scenario: A dish from an idea fits any slot
    Given a plan for this week with a "cena" on Friday
    When I put the dish from the idea in Friday's "cena"
    Then Friday's "cena" is "Acelgas esparragadas"

  Scenario: With no plan this week the dish is still saved
    When I ask where the dish from the idea can go this week
    Then it says there is no plan for this week
    And "Acelgas esparragadas" is in my dishes

  # El pasado no se replanifica: cambiar un hueco que ya pasó reescribiría lo
  # que el plan decía que ibas a comer.
  Scenario: Only entries that have not happened yet are offered
    Given a plan for this week with a "comida" yesterday and a "comida" tomorrow
    When I ask where the dish from the idea can go this week
    Then tomorrow's "comida" is offered
    And yesterday's "comida" is not offered
