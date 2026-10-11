Feature: Read a plan off a PDF
  The plan from the nutritionist, or a batch of dishes another AI wrote, comes as
  a PDF. Typing it in is the work this replaces: the app reads the document,
  says which dishes it found and which week, and saves nothing until I have
  looked at it — the figures were read by a model, and a plan read wrong is
  wrong every day until somebody notices.

  Scenario: A plan comes back as dishes and a week, and nothing is saved
    Given the PDF holds a week with "Lentejas con chorizo" for the comida on lunes
    When I upload the plan
    Then it proposes the dish "Lentejas con chorizo" as new
    And its line "80 g lentejas" is matched to "Lentejas"
    And the week puts "Lentejas con chorizo" in the comida of day 0
    And I still have no dishes

  Scenario: A dish I already have is recognised, not proposed again
    Given I already have the dish "Tortilla de patatas"
    And the PDF holds a week with "tortilla de patatas" for the desayuno on martes
    When I upload the plan
    Then it says "tortilla de patatas" is a dish I already have

  Scenario: A dish named in the week but never described still shows up
    Given the PDF names "Merluza al horno" for the cena on viernes without describing it
    When I upload the plan
    Then it proposes the dish "Merluza al horno" as new with no lines
    And the week puts "Merluza al horno" in the cena of day 4

  Scenario: A mid-morning meal and an afternoon one both land in the snack
    Given the PDF holds a week with "Yogur con nueces" for the merienda on lunes
    When I upload the plan
    Then the week puts "Yogur con nueces" in the snack of day 0

  Scenario: Only a PDF is read
    When I upload a photo instead of a PDF
    Then it is refused as not a PDF

  Scenario: A PDF the model cannot read says so, and saves nothing
    Given the model cannot read the PDF
    When I upload the plan
    Then it says the plan could not be read

  Scenario: An exhausted quota is told apart from an unreadable PDF
    Given the model is out of quota for the day
    When I upload the plan
    Then it says the quota is spent for the day

  Scenario: Without a model configured there is no reading
    Given no model is configured
    When I upload the plan
    Then it says reading plans is not available
