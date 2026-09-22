Feature: Filling the repertoire without typing it
  A rotation needs dishes to rotate, and typing fifteen of them with their
  ingredients is the afternoon where this kind of app gets abandoned. So the
  model proposes combinations of what is already in the catalogue — and only
  combinations: every number still comes from the catalogue.

  Scenario: A proposal made of foods I have saves itself
    Given I have logged "Pollo, pechuga, cruda" and "Arroz blanco cocido"
    And the model proposes "Pechuga a la air fryer" with 200 g of "Pollo, pechuga, cruda"
    When I ask for dishes
    Then "Pechuga a la air fryer" is in my dishes
    And nothing is waiting in the suggestions drawer

  # La defensa que hace seguro que un plato entre sin revisión.
  Scenario: The macros come from the catalogue, not from what the model said
    Given I have logged "Pollo, pechuga, cruda" and "Arroz blanco cocido"
    And the model proposes "Pechuga a la air fryer" with 200 g of "Pollo, pechuga, cruda" and claims 9999 kcal
    When I ask for dishes
    Then "Pechuga a la air fryer" has 242 kcal per serving

  Scenario: A proposal naming a food I do not have waits in the drawer
    Given I have logged "Pollo, pechuga, cruda" and "Arroz blanco cocido"
    And the model proposes "Tofu salteado" with 150 g of "Tofu ahumado"
    When I ask for dishes
    Then "Tofu salteado" is not in my dishes
    And the suggestions drawer holds "Tofu salteado"
    And it says "Tofu ahumado" is what I am missing

  Scenario: A dish I already have is not proposed twice
    Given I have logged "Pollo, pechuga, cruda" and "Arroz blanco cocido"
    And a dish "Pechuga a la air fryer" for 1 servings with 200 g of "Pollo, pechuga, cruda"
    And the model proposes "Pechuga a la air fryer" with 200 g of "Pollo, pechuga, cruda"
    When I ask for dishes
    Then I have 1 dish called "Pechuga a la air fryer"

  Scenario: With the day's quota gone, the app says so instead of failing
    Given I have logged "Pollo, pechuga, cruda" and "Arroz blanco cocido"
    And the model has no quota left for today
    When I ask for dishes
    Then it says the quota is gone for the day
    And my dishes are still there to read

  Scenario: With nothing logged yet there is nothing to combine
    When I ask for dishes
    Then it says there is nothing in the pantry yet
