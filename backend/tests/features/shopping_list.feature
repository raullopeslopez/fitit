Feature: The shopping list comes out of the planned week
  A plan nobody shops for is a wish: the week of 28 Sep was generated and one
  meal of 28 got eaten. So the list is the planned week added up — what each
  meal weighs, per food, as it is bought — grouped by aisle, and in packs when
  the supermarket sells the product in packs (docs/catalogo-supermercado.md, §4).

  Scenario: The list adds up what the week weighs, per food
    Given a planned week of 12 dishes with 150 g of "Pollo" from the meat aisle
    When I ask for the shopping list of that week
    Then "Pollo" is on the list with 4200 g
    And "Pollo" is in the aisle "Carne"

  Scenario: A product sold in packs is counted in packs
    Given a planned week of 12 dishes with 150 g of the catalogue product "Queso fresco batido 0%" sold in 500 g packs
    When I ask for the shopping list of that week
    Then "Queso fresco batido 0%" is on the list with 9 packs of 500 g

  # Lo que pesa la comida es la parte que se come; en el súper se compra con
  # hueso. Muslos con un 25 % de hueso: 4200 g comidos son 5600 g de bandeja.
  Scenario: A food with bone is bought with its bone
    Given a planned week of 12 dishes with 150 g of "Muslo de pollo" with 25 % bone
    When I ask for the shopping list of that week
    Then "Muslo de pollo" is on the list with 5600 g

  Scenario: A week never planned has no list
    When I ask for the shopping list of a week never planned
    Then there is no list
