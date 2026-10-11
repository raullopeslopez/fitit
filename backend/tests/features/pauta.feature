Feature: The plan from the nutritionist, followed every week
  What I reviewed from the PDF is saved in one go: the dishes it brought that I
  did not have, and the pauta — which dish goes in which meal of which day.
  From then on the week follows the pauta instead of the generator choosing,
  and the generator only fills what the pauta leaves empty. The amounts are
  still the app's job: the pauta says what to eat, not how much.

  Scenario: Saving what I reviewed creates the new dishes and reuses mine
    Given I already have the dish "Tortilla de patatas"
    When I save a pauta with "Tortilla de patatas" as mine and "Lentejas con chorizo" as new
    Then I have the dishes "Lentejas con chorizo" and "Tortilla de patatas"

  Scenario: The week follows the pauta
    Given a repertoire of 12 dishes
    And a pauta from 2026-09-21 with "Lentejas con chorizo" for the comida of every day
    When I generate the week of 2026-09-21
    Then every comida of the week is "Lentejas con chorizo"
    And every desayuno of the week is still chosen by the generator
    And the plan says it follows a pauta

  Scenario: A week before the pauta does not follow it
    Given a repertoire of 12 dishes
    And a pauta from 2026-09-21 with "Lentejas con chorizo" for the comida of every day
    When I generate the week of 2026-09-14
    Then no comida of the week is "Lentejas con chorizo"
    And the plan says it follows no pauta

  Scenario: The newest pauta replaces the older one
    Given a repertoire of 12 dishes
    And a pauta from 2026-09-21 with "Lentejas con chorizo" for the comida of every day
    And a pauta from 2026-09-21 with "Garbanzos con espinacas" for the comida of every day
    When I generate the week of 2026-09-21
    Then every comida of the week is "Garbanzos con espinacas"

  Scenario: A dish that is not mine cannot go in the pauta
    When I save a pauta with a dish that is not mine
    Then there is no such dish

  Scenario: A new dish without ingredients is not saved
    When I save a pauta with "Merluza al horno" as new and no ingredients
    Then it is refused as incomplete

  # La pauta dice qué comer, no cuánto: su receta da las proporciones, y el
  # ajustador mueve sus ingredientes —entre la mitad y el doble— hasta que el día
  # da sus kcal, aunque nadie le haya puesto banda a ninguno.
  Scenario: A pauta with fixed recipes still lands every day on its kcal
    Given my targets add up to 1800 kcal a day
    And a pauta from 2026-09-21 with a fixed recipe for every meal of every day
    When I generate the week of 2026-09-21
    Then every day of the week adds up to 1800 kcal, give or take 2%
    And every day says its carbs fall short and its protein runs over
    And no day says its kcal are off
