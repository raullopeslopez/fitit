Feature: The supermarket ticket says what I have at home
  After shopping I upload the ticket. A model reads only the food lines, with how
  much was bought; they are matched to foods like the lines of a plan, and what I
  review is kept as what I have at home. Saving it says how the shopping went
  against the list: what was on it, what was not, and what is still missing
  (registro sin huecos, fase 6.1).

  Scenario: Reading a ticket matches its food lines and writes nothing
    Given the foods "Pollo" and "Leche semidesnatada"
    And the model reads the ticket as "1000 g pollo" and "6000 g leche semidesnatada"
    When I upload the ticket
    Then the ticket has the line "1000 g pollo" matched to "Pollo" with 1000 g
    And I have nothing at home

  Scenario: Saving the ticket keeps it at home and compares it with the list
    Given a planned week of 12 dishes with 150 g of "Pollo"
    And the food "Leche semidesnatada"
    When I save from the ticket 1000 g of "Pollo" and 6000 g of "Leche semidesnatada"
    Then the shopping had 1 on the list, 1 off the list and nothing missing
    And I have at home 1000 g of "Pollo" and 6000 g of "Leche semidesnatada"

  Scenario: What was on the list and not bought is missing
    Given a planned week of 12 dishes with 150 g of "Pollo"
    And the food "Leche semidesnatada"
    When I save from the ticket only 6000 g of "Leche semidesnatada"
    Then the shopping had 0 on the list, 1 off the list and "Pollo" missing

  Scenario: Without a planned week there is nothing to compare with
    Given the food "Leche semidesnatada"
    When I save from the ticket only 6000 g of "Leche semidesnatada"
    Then the shopping is not compared with any list

  Scenario: Only a PDF is read
    Given the model reads the ticket as "1000 g pollo" and "6000 g leche semidesnatada"
    When I upload a photo as the ticket
    Then it is refused as not a PDF

  Scenario: Without a model the ticket is not read
    Given no model to read tickets
    When I try to upload the ticket
    Then it says reading tickets is not available

  # Fase 6.2: lo que hay en casa se nota en tus platos. Un plato dice cuántos de
  # sus ingredientes compraste en las dos últimas semanas, que es lo que
  # «Lo cambié» pone arriba y lo que hace pesar al generador.
  Scenario: A dish says how many of its ingredients I have at home
    Given the foods "Pollo" and "Patata"
    And a dish "Pollo con patatas" with "Pollo" and "Patata"
    When I save from the ticket only 1000 g of "Pollo"
    Then "Pollo con patatas" has 1 of its 2 ingredients at home

  Scenario: What I bought more than two weeks ago is no longer at home
    Given the foods "Pollo" and "Patata"
    And a dish "Pollo con patatas" with "Pollo" and "Patata"
    When I save from the ticket 1000 g of "Pollo" bought 15 days ago
    Then "Pollo con patatas" has 0 of its 2 ingredients at home
    And I have nothing at home

  # Plan v2: el ticket cierra la compra de la semana que se mandó a Taski.
  Scenario: Saving the ticket of a sent week closes its shopping
    Given a planned week of 12 dishes with 150 g of "Pollo"
    And that week's list was sent to Taski
    When I save from the ticket only 1000 g of "Pollo"
    Then that week is no longer waiting for its ticket

  Scenario: Sending again after the ticket waits for a new ticket
    Given a planned week of 12 dishes with 150 g of "Pollo"
    And that week's list was sent to Taski
    When I save from the ticket only 1000 g of "Pollo"
    And that week's list is sent to Taski again
    Then that week is waiting for its ticket

  Scenario: A ticket with nothing sent closes nothing
    Given a planned week of 12 dishes with 150 g of "Pollo"
    When I save from the ticket only 1000 g of "Pollo"
    Then that week is not waiting for any ticket
