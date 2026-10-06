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

  # Platos desde tu súper (docs/catalogo-supermercado.md): el modelo dice para
  # qué comidas es cada plato, y una regla determinista decide si una comida o
  # una cena aporta la proteína que pide tu objetivo. El modelo propone; la
  # aritmética tumba.
  Scenario: A proposed dish keeps the meals it is for
    Given I have "Pollo, pechuga, cruda" with 23 g of protein and 110 kcal per 100 g
    And the model proposes "Pechuga a la air fryer" with 200 g of "Pollo, pechuga, cruda" for "comida,cena"
    When I ask for dishes
    Then "Pechuga a la air fryer" serves "comida,cena"

  Scenario: A lunch short of protein for my target does not enter
    Given my protein target is 200 g a day
    And I have "Pasta seca" with 12 g of protein and 350 kcal per 100 g
    And the model proposes "Pasta con tomate" with 100 g of "Pasta seca" for "comida"
    When I ask for dishes
    Then "Pasta con tomate" is not in my dishes
    And "Pasta con tomate" is discarded with 12 g of protein against a floor of 40 g

  Scenario: A lunch that reaches the floor enters
    Given my protein target is 200 g a day
    And I have "Pollo, pechuga, cruda" with 23 g of protein and 110 kcal per 100 g
    And the model proposes "Pechuga a la air fryer" with 200 g of "Pollo, pechuga, cruda" for "comida"
    When I ask for dishes
    Then "Pechuga a la air fryer" is in my dishes

  Scenario: A breakfast is not held to the lunch floor
    Given my protein target is 200 g a day
    And I have "Pasta seca" with 12 g of protein and 350 kcal per 100 g
    And the model proposes "Tostada" with 100 g of "Pasta seca" for "desayuno"
    When I ask for dishes
    Then "Tostada" is in my dishes

  # Sin comidas dichas, el plan puede ponerlo en cualquiera — también en una
  # comida o una cena, así que se juzga como si fuera una.
  Scenario: A dish proposed for no meal in particular is judged as a main meal
    Given my protein target is 200 g a day
    And I have "Pasta seca" with 12 g of protein and 350 kcal per 100 g
    And the model proposes "Pasta con tomate" with 100 g of "Pasta seca"
    When I ask for dishes
    Then "Pasta con tomate" is not in my dishes

  # `NULL` no es `0`, y tampoco es «suficiente»: sin la cifra no se puede
  # prometer que llega.
  Scenario: A lunch whose protein is unknown does not enter
    Given my protein target is 200 g a day
    And I have logged "Pollo, pechuga, cruda" and "Arroz blanco cocido"
    And the model proposes "Pechuga a la air fryer" with 200 g of "Pollo, pechuga, cruda" for "comida"
    When I ask for dishes
    Then "Pechuga a la air fryer" is not in my dishes
    And "Pechuga a la air fryer" is discarded with unknown protein

  Scenario: Without a protein target there is no floor
    Given I have "Pasta seca" with 12 g of protein and 350 kcal per 100 g
    And the model proposes "Pasta con tomate" with 100 g of "Pasta seca" for "comida"
    When I ask for dishes
    Then "Pasta con tomate" is in my dishes

  # Opción A (6 oct): la despensa sola es lo que ya comes. Para proponer desde
  # tu súper, el modelo recibe además una selección de básicos de definición:
  # proteína cruda del catálogo con buena proteína por caloría, y los básicos
  # que completan un plato.
  Scenario: The model is offered lean protein I have never logged
    Given I have logged "Pollo, pechuga, cruda" and "Arroz blanco cocido"
    And the catalogue has raw meat "Pavo, filete, crudo" with 24 g of protein and 109 kcal per 100 g
    When I ask for dishes and the model sees the list
    Then the model was offered "Pavo, filete, crudo"

  Scenario: Fatty protein is not offered as a basic
    Given I have logged "Pollo, pechuga, cruda" and "Arroz blanco cocido"
    And the catalogue has raw meat "Cerdo, panceta, cruda" with 15 g of protein and 400 kcal per 100 g
    When I ask for dishes and the model sees the list
    Then the model was not offered "Cerdo, panceta, cruda"

  Scenario: The staples that complete a plate are offered
    Given I have logged "Pollo, pechuga, cruda" and "Arroz blanco cocido"
    And the catalogue has the staple "Brócoli, crudo"
    When I ask for dishes and the model sees the list
    Then the model was offered "Brócoli, crudo"

  Scenario: A dish built with a basic saves itself
    Given I have logged "Pollo, pechuga, cruda" and "Arroz blanco cocido"
    And the catalogue has raw meat "Pavo, filete, crudo" with 24 g of protein and 109 kcal per 100 g
    And the model proposes "Pavo a la plancha" with 200 g of "Pavo, filete, crudo"
    When I ask for dishes
    Then "Pavo a la plancha" is in my dishes
