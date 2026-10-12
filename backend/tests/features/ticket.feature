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
