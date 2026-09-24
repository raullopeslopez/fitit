Feature: Putting a dish from an idea into this week's plan
  The idea ends where the week is decided. A dish saved from an idea is an
  ordinary dish, so the plan already knows how to take it. What is new is
  arriving there from the idea instead of from the plan: choosing one of the
  week's slots that have not happened yet and putting the dish in it.

  # Las ideas (fases 1 y 2) todavía no existen en esta rama: el Background usa
  # un plato guardado corriente, que es exactamente lo que una idea deja al
  # guardarse. Cuando las fases 1–2 lleguen, este paso pasa a ser «an idea …
  # saved as a dish …» y los escenarios no cambian.
  Background:
    Given the catalogue has "Acelga, cruda"
    And a dish "Acelgas esparragadas" with 250 g of "Acelga, cruda"

  # No es el `swapped` del plan: ese dice «hoy comí otra cosa» y escribe el
  # diario, y sólo vale para el día que estás viviendo. Esto es cambiar lo que
  # el plan dice que vas a comer, así que la fila queda por confirmar igual que
  # cualquier otra: el jueves se confirma o se salta como siempre.
  Scenario: The dish takes the place of an entry in this week's plan
    Given a plan for this week with a "comida" on Thursday
    When I put the dish in Thursday's "comida"
    Then Thursday's "comida" is "Acelgas esparragadas"
    And Thursday's "comida" is still to be confirmed
    And nothing was written in the food diary

  # Un plato de una idea no ha dicho en qué huecos sirve, y eso se lee como
  # «vale para cualquiera»: negárselo lo dejaría fuera del plan entero.
  Scenario: A dish from an idea fits any slot
    Given a plan for this week with a "cena" on Friday
    When I put the dish in Friday's "cena"
    Then Friday's "cena" is "Acelgas esparragadas"

  Scenario: With no plan this week the dish is still saved
    When I ask where the dish can go this week
    Then it says there is no plan for this week
    And "Acelgas esparragadas" is in my dishes

  # El pasado no se replanifica: cambiar un hueco que ya pasó reescribiría lo
  # que el plan decía que ibas a comer.
  Scenario: Only entries that have not happened yet are offered
    Given a plan for this week with a "comida" yesterday and a "comida" tomorrow
    When I ask where the dish can go this week
    Then tomorrow's "comida" is offered
    And yesterday's "comida" is not offered

  Scenario: A slot that already passed cannot be replanned
    Given a plan for this week with a "comida" yesterday and a "comida" tomorrow
    When I try to put the dish in yesterday's "comida"
    Then it is refused because that day already passed
    And yesterday's "comida" is not "Acelgas esparragadas"
