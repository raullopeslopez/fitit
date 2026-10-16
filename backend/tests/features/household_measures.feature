Feature: Household measures instead of grams
  Cooking and logging with spoons, without a scale. A measure weighs the same
  whatever the food: a cucharadita is 5 g, a cucharada 15 g, a taza 240 g and a
  vaso 200 g. That is approximate on purpose (docs/medidas-caseras.md), so the
  diary keeps both the measure and the grams it stood for.

  # --- Logging with a measure -------------------------------------------------

  Scenario: Two cucharadas of oil are logged as 30 g, and the measure is kept
    Given a food "Aceite de oliva" with 900 kcal per 100 g
    When I log 2 "cda" of "Aceite de oliva"
    Then the entry weighs 30 g
    And the entry's measure is 2 "cda"
    And the entry has 270 kcal

  Scenario: Half a taza is a measure too
    Given a food "Arroz" with 350 kcal per 100 g
    When I log 0.5 "taza" of "Arroz"
    Then the entry weighs 120 g
    And the entry's measure is 0.5 "taza"

  Scenario Outline: Each measure weighs the same whatever the food
    Given a food "Harina" with 350 kcal per 100 g
    When I log 1 "<measure>" of "Harina"
    Then the entry weighs <grams> g

    Examples:
      | measure | grams |
      | cdta    | 5     |
      | cda     | 15    |
      | taza    | 240   |
      | vaso    | 200   |

  Scenario: An entry logged in grams has no measure, not a made-up one
    Given a food "Aceite de oliva" with 900 kcal per 100 g
    When I log 27 g of "Aceite de oliva"
    Then the entry has no measure

  Scenario: Grams and a measure at once are two different amounts
    Given a food "Aceite de oliva" with 900 kcal per 100 g
    When I try to log 27 g and 2 "cda" of "Aceite de oliva" at once
    Then the request is rejected as invalid

  Scenario: A measure the app does not know is rejected
    Given a food "Ajo" with 140 kcal per 100 g
    When I try to log 1 "diente" of "Ajo"
    Then the request is rejected as invalid

  Scenario: Re-weighing in grams drops the measure
    Given a food "Aceite de oliva" with 900 kcal per 100 g
    And I logged 2 "cda" of "Aceite de oliva"
    When I re-weigh that entry to 27 g
    Then the entry weighs 27 g
    And the entry has no measure

  # --- Remembering the measure ------------------------------------------------

  Scenario: My usual amounts tell spoons apart from grams
    Given a food "Aceite de oliva" with 900 kcal per 100 g
    And I have logged 2 "cda" of "Aceite de oliva" twice and 30 g once
    When I ask for my amounts of "Aceite de oliva"
    Then the amounts are 2 cda ×2, 30 g ×1

  Scenario: The latest amount says which unit the sheet opens in
    Given a food "Aceite de oliva" with 900 kcal per 100 g
    And I have logged 30 g of "Aceite de oliva", then 1 "cda"
    When I ask for my amounts of "Aceite de oliva"
    Then the latest amount is 1 cda

  Scenario: A frequent food logged with spoons comes back with spoons
    Given a food "Aceite de oliva" with 900 kcal per 100 g
    And I have logged 2 "cda" of "Aceite de oliva" three times
    When I ask for my frequent foods
    Then "Aceite de oliva" is offered as 2 cda, 30 g

  # --- Recipes ----------------------------------------------------------------

  Scenario Outline: A small amount in a recipe is shown in spoons
    When I ask for the household measure of <grams> g
    Then the measure is "<shown>"

    Examples:
      | grams | shown    |
      | 3     | ½ cdta   |
      | 5     | 1 cdta   |
      | 9     | 2 cdtas  |
      | 10    | ½ cda    |
      | 27    | 2 cdas   |
      | 60    | 4 cdas   |

  Scenario Outline: No measure where a spoon would not help
    When I ask for the household measure of <grams> g
    Then there is no measure

    Examples:
      | grams |
      | 1     |
      | 61    |
      | 200   |

  Scenario: A recipe line in cucharadas arrives with its grams
    When a recipe line reads "2 cucharadas de aceite de oliva"
    Then the line weighs 30 g

  Scenario Outline: Every table measure gives a recipe line its grams
    When a recipe line reads "<line>"
    Then the line weighs <grams> g

    Examples:
      | line                      | grams |
      | 1 cucharadita de comino   | 5     |
      | 1 taza de arroz           | 240   |
      | 1 vaso de leche           | 200   |

  Scenario: A measure outside the table still has no weight
    When a recipe line reads "2 dientes de ajo"
    Then the line has no grams
