Feature: The shopping list goes to Taski
  The list is bought by two people, and the shared one lives in Taski. So one
  button sends the week there: one way only — Fitit sends, Taski never answers
  back — and only what Taski doesn't already have pending, so sending twice
  adds nothing the second time.

  Scenario: The week arrives in Taski with its quantity and category
    Given a planned week of 12 dishes with 150 g of the catalogue product "Queso fresco batido 0%" sold in 500 g packs
    And Taski is reachable with an empty list
    When I send the shopping list of that week to Taski
    Then Taski has "Queso fresco batido 0% Hacendado" with quantity "9 × 500 g" in "Lácteos"
    And the note on it says it comes from Fitit's plan
    And 1 item was added

  Scenario: Sending twice adds nothing the second time
    Given a planned week of 12 dishes with 150 g of "Pollo" from the meat aisle
    And Taski is reachable with an empty list
    When I send the shopping list of that week to Taski
    And I send the shopping list of that week to Taski
    Then Taski has "Pollo" once
    And 0 items were added

  Scenario: What I already have at home is not sent
    Given a planned week of 12 dishes with 150 g of "Pollo" from the meat aisle
    And Taski is reachable with an empty list
    When I send the shopping list of that week to Taski leaving out "Pollo"
    Then Taski has nothing

  Scenario: Something already ticked off in Taski is sent again
    Given a planned week of 12 dishes with 150 g of "Pollo" from the meat aisle
    And Taski already has "Pollo" ticked off
    When I send the shopping list of that week to Taski
    Then 1 item was added

  Scenario: Taski down is said, not swallowed
    Given a planned week of 12 dishes with 150 g of "Pollo" from the meat aisle
    And Taski cannot be reached
    When I try to send the shopping list of that week to Taski
    Then the answer is 502

  Scenario: Without a Taski key there is nothing to send to
    Given a planned week of 12 dishes with 150 g of "Pollo" from the meat aisle
    And Taski is not configured
    When I try to send the shopping list of that week to Taski
    Then the answer is 503
