Feature: What I actually cook
  A plan made of loose foods is a shopping ticket, not a meal. What gets eaten
  is a dish — ingredients, a way of cooking them, and the servings it makes —
  and logging one has to leave the diary exactly as logging its parts would.

  Scenario: A dish's macros per serving are its ingredients, split by servings
    Given a food "Lenteja cocida" with 116 kcal and 9 g of protein per 100 g
    And a food "Chorizo" with 455 kcal and 24 g of protein per 100 g
    When I save a dish "Lentejas de mi madre" for 4 servings with 400 g of "Lenteja cocida" and 100 g of "Chorizo"
    Then "Lentejas de mi madre" has 229.75 kcal per serving
    And "Lentejas de mi madre" has 15 g of protein per serving

  Scenario: A nutrient nobody measured in one ingredient is unknown in the dish
    Given a food "Lenteja cocida" with 116 kcal and 9 g of protein per 100 g
    And a food "Sofrito de la abuela" with 90 kcal per 100 g and no fibre on record
    When I save a dish "Lentejas de mi madre" for 2 servings with 300 g of "Lenteja cocida" and 100 g of "Sofrito de la abuela"
    Then "Lentejas de mi madre" has unknown fibre per serving, not zero

  Scenario: Logging a dish writes one entry per ingredient
    Given a food "Lenteja cocida" with 116 kcal and 9 g of protein per 100 g
    And a food "Chorizo" with 455 kcal and 24 g of protein per 100 g
    And a dish "Lentejas de mi madre" for 4 servings with 400 g of "Lenteja cocida" and 100 g of "Chorizo"
    When I log 1 serving of "Lentejas de mi madre" at comida
    Then the diary holds 2 entries
    And comida totals 229.75 kcal

  Scenario: Two servings weigh twice as much
    Given a food "Lenteja cocida" with 116 kcal and 9 g of protein per 100 g
    And a dish "Lentejas simples" for 4 servings with 400 g of "Lenteja cocida"
    When I log 2 servings of "Lentejas simples" at comida
    Then the diary holds 1 entry
    And that entry records 200 g

  # La regla del congelado, sobre el objeto nuevo: el plato es de dónde salió la
  # propuesta, no una referencia viva.
  Scenario: Correcting the dish leaves what I already logged alone
    Given a food "Lenteja cocida" with 116 kcal and 9 g of protein per 100 g
    And a dish "Lentejas simples" for 4 servings with 400 g of "Lenteja cocida"
    And I log 1 serving of "Lentejas simples" at comida
    When I correct "Lentejas simples" to 8 servings
    Then comida still totals 116 kcal

  Scenario: A dish says how it is weighed, and how it was cooked
    Given a food "Pollo, pechuga, cruda" with 121 kcal per 100 g
    When I save a dish "Pechuga a la air fryer" weighed raw, cooked in the air fryer, for 1 serving with 200 g of "Pollo, pechuga, cruda"
    Then "Pechuga a la air fryer" is weighed raw
    And "Pechuga a la air fryer" was cooked in the air fryer

  Scenario: A dish is not a food
    Given a food "Lenteja cocida" with 116 kcal and 9 g of protein per 100 g
    And a dish "Lentejas simples" for 4 servings with 400 g of "Lenteja cocida"
    When I search the food catalogue for "Lentejas simples"
    Then the food catalogue has nothing by that name

  Scenario: A dish is not deleted, it is corrected
    Given a food "Lenteja cocida" with 116 kcal and 9 g of protein per 100 g
    And a dish "Lentejas simples" for 4 servings with 400 g of "Lenteja cocida"
    Then there is no way to delete "Lentejas simples"
