Feature: Logging food by voice
  I say what I ate; the audio goes to the model, which hears it and splits it into
  lines; the server matches each line against my foods and proposes amounts. Nothing
  is saved until I confirm (docs/registro-por-voz.md). The model is replaced by a
  stub that returns what it would have heard.

  # --- Hearing ----------------------------------------------------------------

  Scenario: What was heard comes back, and nothing is saved
    Given a food "Huevo" I have logged at 60 g three times
    And the model hears "un huevo" as 1 "unidad" of "huevo"
    When I send a voice note
    Then the transcript is "un huevo"
    And there is 1 line
    And my diary has 3 entries

  Scenario: Without a model key the voice is not available
    Given there is no model key
    When I send a voice note
    Then the answer is 503

  Scenario: Out of daily quota, it says so
    Given the model is out of its daily quota
    When I send a voice note
    Then the refusal is "quota" for the day

  Scenario: A saturated model is not "I did not understand"
    Given the model is saturated
    When I send a voice note
    Then the refusal is "busy"

  Scenario: Heard, but the model is saturated: what was heard still comes back
    Given the transcriber heard "dos huevos" but the model is saturated
    When I send a voice note
    Then the refusal is "busy"
    And the transcript is "dos huevos"

  Scenario: Heard nothing usable
    Given the model hears nothing
    When I send a voice note
    Then the refusal is "unreadable"

  Scenario: An audio over the size limit is refused before reaching the model
    When I send a voice note of 3 MB
    Then the answer is 413

  # --- Which food ---------------------------------------------------------------

  # Por nombre: lo dicho tiene que estar en el nombre o en un alias. «pasta» no
  # encuentra «Macarrón», y eso es un alias que falta, no algo que adivinar.
  Scenario: What I usually eat is chosen for me
    Given a food "Pasta espagueti Hacendado" I have logged at 90 g twice
    And a shared food "Pasta, cocida"
    And the model hears "pasta" as "pasta" with no amount
    When I send a voice note
    Then the line "pasta" is chosen as "Pasta espagueti Hacendado"
    And the line "pasta" weighs 90 g, not estimated

  Scenario: Without a habit, it asks which, mine first, then the supermarket, then CIQUAL
    Given a food "Pasta fresca" of mine I never logged
    And a shared food "Pasta Spaghetti" by "Hacendado"
    And a shared food "Pasta, cocida"
    And the model hears "pasta" as "pasta" with no amount
    When I send a voice note
    Then the line "pasta" asks which among "Pasta fresca", "Pasta Spaghetti", "Pasta, cocida"

  Scenario: A food that exists nowhere is missing, and nothing is created
    Given the model hears "lomo embuchado" as "lomo embuchado" with no amount
    When I send a voice note
    Then the line "lomo embuchado" is missing
    And no food called "lomo embuchado" exists

  # --- How much ---------------------------------------------------------------

  Scenario: Grams I say are the grams
    Given a food "Avena" I have logged at 40 g twice
    And the model hears "cien gramos de avena" as 100 "g" of "avena"
    When I send a voice note
    Then the line "cien gramos de avena" weighs 100 g, not estimated

  Scenario: Spoons are a household measure
    Given a food "Aceite de oliva" I have logged at 10 g twice
    And the model hears "dos cucharadas de aceite" as 2 "cda" of "aceite"
    When I send a voice note
    Then the line "dos cucharadas de aceite" is 2 "cda", 30 g

  Scenario: Units use my portion of that food
    Given a food "Huevo" I have logged at 60 g three times
    And I have a portion "unidad" of 55 g on "Huevo"
    And the model hears "dos huevos" as 2 "unidad" of "huevo"
    When I send a voice note
    Then the line "dos huevos" weighs 110 g, not estimated

  Scenario: Units without a portion ask for one, with the model's weight ready
    Given a food "Huevo" I have logged at 60 g three times
    And the model hears "dos huevos" as 2 "unidad" of "huevo" weighing 60 g each
    When I send a voice note
    Then the line "dos huevos" asks how much one weighs, suggesting 60 g

  Scenario: No amount said, and it is a habit: my usual amount
    Given a food "Café con leche" I have logged at 200 g twice and 250 g once
    And the model hears "café con leche" as "café con leche" with no amount, 150 g a portion
    When I send a voice note
    Then the line "café con leche" weighs 200 g, not estimated

  Scenario: No amount said, and it is new: the model's portion, marked as estimated
    Given a food "Pasta fresca" of mine I never logged
    And the model hears "pasta fresca" as "pasta fresca" with no amount, 80 g a portion
    When I send a voice note
    Then the line "pasta fresca" weighs 80 g, estimated

  Scenario: My usual amount is never multiplied by what I say
    Given a food "Huevo" I have logged at 120 g three times
    And the model hears "dos huevos" as 2 "unidad" of "huevo" weighing 60 g each
    When I send a voice note
    Then the line "dos huevos" asks how much one weighs, suggesting 60 g

  # --- My portions ------------------------------------------------------------

  Scenario: A portion on a shared food is mine, and only mine
    Given a shared food "Huevo, crudo"
    When I save a portion "unidad" of 60 g on "Huevo, crudo"
    Then "Huevo, crudo" shows my portion "unidad" of 60 g
    And someone else sees no portions on "Huevo, crudo"

  Scenario: Someone else cannot log with my portion
    Given a shared food "Huevo, crudo"
    And I saved a portion "unidad" of 60 g on "Huevo, crudo"
    When someone else logs 2 of my portion on "Huevo, crudo"
    Then the answer is 404

  # --- Saving -----------------------------------------------------------------

  Scenario: Confirmed lines are logged together, as voice
    Given a food "Huevo" I have logged at 60 g three times
    And a food "Pan" I have logged at 80 g twice
    When I log by voice 120 g of "Huevo" and 80 g of "Pan"
    Then my diary has 7 entries
    And the last 2 entries come from "voice"

  Scenario: A line with the model's grams is logged as estimated
    Given a food "Pasta fresca" of mine I never logged
    When I log by voice 80 g of "Pasta fresca" estimated
    Then the last entry comes from "estimated"

  Scenario: If one line fails, none is logged
    Given a food "Pan" I have logged at 80 g twice
    When I log by voice 80 g of "Pan" and 50 g of a food that does not exist
    Then the answer is 404
    And my diary has 2 entries
