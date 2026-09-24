Feature: Turning an idea into a dish
  An idea is a link. A dish is ingredients with grams, matched to foods whose
  numbers are real. The step between them is where the model would be tempted
  to make things up — Gemini, asked for the ingredients of a real recipe, kept
  the grams honest and quietly dropped the parmesan and the oil.

  So the ingredients are not asked of the model at all. Recipe pages publish
  them for search engines as schema.org JSON-LD (`recipeIngredient`,
  `recipeYield`), and the server reads them from there: it is what the recipe
  says, not what someone read into it. What is left is matching each line to a
  food, and that is shown to the person, never decided behind their back.

  Background:
    Given the catalogue has "Acelga, cruda"
    And the catalogue has "Huevo, crudo"
    And the catalogue has "Patata, cocida (alimento medio)"
    And the catalogue has "Patata, cruda"
    And an idea "Acelgas a la crema con huevo al horno" for "Acelga, cruda"

  Scenario: The ingredients come from the recipe page, scaled to one serving
    Given its page publishes 2 servings with "500 gr de acelgas"
    When I open the idea as a dish
    Then the draft has 250 g of "Acelga, cruda"

  # Lo que el modelo se dejó en la prueba a mano: si la página lo publica, está.
  Scenario: Every line the page publishes is in the draft
    Given its page publishes 2 servings with "500 gr de acelgas", "Queso parmesano" and "Aceite de oliva virgen extra"
    When I open the idea as a dish
    Then the draft has 3 ingredients

  Scenario: A line that matches one food is chosen
    Given its page publishes 2 servings with "500 gr de acelgas"
    When I open the idea as a dish
    Then the line "500 gr de acelgas" is matched to "Acelga, cruda"

  Scenario: A line that matches several foods asks which one
    Given its page publishes 2 servings with "300 g de patatas"
    When I open the idea as a dish
    Then the line "300 g de patatas" is not matched yet
    And it offers "Patata, cocida (alimento medio)" and "Patata, cruda"

  # Una web no es un formulario que hayas rellenado: lo que no existe se dice,
  # no se da de alta.
  Scenario: A line that matches no food is missing, and no food is created
    Given its page publishes 2 servings with "2 cucharadas de tahini"
    When I open the idea as a dish
    Then the line "2 cucharadas de tahini" is missing
    And the catalogue has no food called "tahini"

  # NULL no es 0: «2 huevos» tiene cantidad y no tiene gramos.
  Scenario: A line with no grams has unknown grams, not zero
    Given its page publishes 2 servings with "2 huevos"
    When I open the idea as a dish
    Then the line "2 huevos" is matched to "Huevo, crudo"
    And its grams are unknown

  Scenario: A dish cannot be saved while a line has unknown grams
    Given its page publishes 2 servings with "2 huevos"
    And I have opened the idea as a dish
    When I save the draft as it is
    Then it is refused because "Huevo, crudo" has no grams
    And "Acelgas a la crema con huevo al horno" is not in my dishes

  Scenario: Saving goes through the dishes door and the idea remembers its dish
    Given its page publishes 2 servings with "500 gr de acelgas"
    And I have opened the idea as a dish
    When I save the draft
    Then "Acelgas a la crema con huevo al horno" is in my dishes
    And the idea says it was saved as that dish

  Scenario: The macros come from the catalogue
    Given its page publishes 1 servings with "200 gr de acelgas"
    And I have opened the idea as a dish
    When I save the draft
    Then "Acelgas a la crema con huevo al horno" has the kcal of 200 g of "Acelga, cruda" per serving

  # okdiario no publica recipeYield. Dividir entre 1 sería decir que la receta
  # entera es una ración, y eso no lo ha dicho nadie: se pregunta.
  Scenario: A recipe that does not say its servings asks for them
    Given its page publishes no servings with "500 gr de acelgas"
    When I open the idea as a dish
    Then the draft asks how many servings it is for
    And the line "500 gr de acelgas" is matched to "Acelga, cruda"
    And its grams are unknown

  Scenario: Saying the servings scales the draft
    Given its page publishes no servings with "500 gr de acelgas"
    When I open the idea as a dish for 4 servings
    Then the draft has 125 g of "Acelga, cruda"

  # La cifra por ración la calcula el servidor, antes de guardar y con la
  # misma aritmética que después: la pantalla no suma.
  Scenario: The draft shows its macros per serving before it is saved
    Given its page publishes 2 servings with "500 gr de acelgas"
    And I have opened the idea as a dish
    When I preview the draft
    Then the preview has the kcal of 250 g of "Acelga, cruda" per serving
    And "Acelgas a la crema con huevo al horno" is not in my dishes

  # La idea es de todos; el plato, tuyo. «Guardado» se lee por persona.
  Scenario: Someone else saving the idea does not mark it saved for me
    Given its page publishes 2 servings with "500 gr de acelgas"
    And another user has saved the idea as a dish
    When I look at the ideas with "Acelga, cruda"
    Then the idea is not saved

  # Mismo principio que las ideas: lo leído se guarda y no se vuelve a pedir.
  Scenario: The page is read once
    Given its page publishes 2 servings with "500 gr de acelgas"
    And I have opened the idea as a dish
    When I open the idea as a dish
    Then the page was fetched 1 time

  # Sin JSON-LD no hay nada que leer sin interpretar, y esta fase no interpreta.
  Scenario: A page that does not publish its ingredients says so
    Given its page publishes no recipe data
    When I open the idea as a dish
    Then it says the recipe does not publish its ingredients
    And the draft has 0 ingredients

  # SSRF: el servidor sólo abre enlaces que él mismo guardó.
  Scenario: Only a stored idea's page is ever fetched
    When I open as a dish an idea that does not exist
    Then the answer is not found
    And no page was fetched

  # SSRF: aunque el enlace esté guardado, lo escribió un modelo leyendo la web.
  # Lo que cuenta es adónde lleva de verdad, no cómo se llama.
  Scenario: A link that leads inside the server's network is not opened
    Given an idea "Acelgas del metadata" for "Acelga, cruda" whose link resolves to "169.254.169.254"
    When I open "Acelgas del metadata" as a dish
    Then it says the recipe page could not be opened
    And no page was fetched
