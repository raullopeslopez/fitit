Feature: Each meal adds up on its own
  The diary is read meal by meal, so each one carries its own subtotal — and
  each one keeps the same rule the whole day does: what nobody measured stays
  unknown, and an empty meal is not a zero.

  Scenario: Each meal carries its own subtotal
    Given a food "Huevo cocido" with 150 kcal per 100 g
    When I log 100 g of "Huevo cocido" at desayuno
    And I log 200 g of "Huevo cocido" at cena
    Then desayuno totals 150 kcal
    And cena totals 300 kcal

  Scenario: A meal nobody ate is not a zero
    Given a food "Huevo cocido" with 150 kcal per 100 g
    When I log 100 g of "Huevo cocido" at desayuno
    Then comida's kcal are unknown, not zero
    And comida is missing nothing, because there is nothing in it

  Scenario: An unknown in one meal does not spoil another
    Given a food "Huevo cocido" with 150 kcal per 100 g
    And a food "Piquillos de mi madre" with no kcal on record
    When I log 100 g of "Huevo cocido" at desayuno
    And I log 150 g of "Piquillos de mi madre" at cena
    Then desayuno totals 150 kcal
    And cena's kcal are unknown, not zero
    And cena is missing 1 entry's kcal

  Scenario: What was not assigned to a meal adds up too
    Given a food "Huevo cocido" with 150 kcal per 100 g
    When I log 100 g of "Huevo cocido" at no meal in particular
    Then the unassigned pile totals 150 kcal
    And desayuno's kcal are unknown, not zero
