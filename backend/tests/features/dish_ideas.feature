Feature: Ideas for what to cook with a food I feel like eating
  «Me apetece acelga, ¿qué hago con ella?» is a different question from «what can
  I make with what I have»: the food is chosen first, and it is usually not in
  the pantry yet. So the model searches the web for real recipes built around
  that one food and brings back ideas — a name, a method, the minutes and the
  link to the original recipe. Nothing else.

  Ideas are to look at, not to keep: none of them becomes a dish on its own.
  Turning one into a dish, with its ingredients matched against the catalogue,
  is phase 2. So is putting it in the plan.

  Searching costs quota and seconds, and recipes for chard do not change from
  one week to the next. So every search is **stored against the food**, and
  asking about the same food again answers from what was stored without asking
  the model. Only «Otras ideas» searches again, and what it finds is added to
  what was already there.

  Background:
    Given the catalogue has "Acelga, cruda"

  Scenario: Asking about a food brings back ideas with their original recipe
    Given the web search finds "Acelgas esparragadas" at "https://www.directoalpaladar.com/acelgas-esparragadas", "sartén", 30 minutes
    And the web search finds "Acelgas a la vasca" at "https://www.consumer.es/acelgas-a-la-vasca.html", "olla", 40 minutes
    When I ask for ideas with "Acelga, cruda"
    Then I get 2 ideas
    And the idea "Acelgas esparragadas" links to "https://www.directoalpaladar.com/acelgas-esparragadas"
    And the idea "Acelgas esparragadas" is cooked in "sartén" in 30 minutes

  # Las ideas son un escaparate: tres búsquedas de acelga no pueden dejarte
  # doce platos en el repertorio que no vas a cocinar.
  Scenario: An idea is not a dish
    Given the web search finds "Acelgas esparragadas" at "https://www.directoalpaladar.com/acelgas-esparragadas", "sartén", 30 minutes
    When I ask for ideas with "Acelga, cruda"
    Then "Acelgas esparragadas" is not in my dishes

  # Sin enlace no hay receta que abrir, y una idea que no se puede comprobar
  # es justo lo que la búsqueda venía a evitar.
  Scenario: An idea without a link to a web page is dropped
    Given the web search finds "Acelgas esparragadas" at "https://www.directoalpaladar.com/acelgas-esparragadas", "sartén", 30 minutes
    And the web search finds "Acelgas de la abuela" with no link
    And the web search finds "Acelgas al vapor" at "receta-inventada", "olla", 15 minutes
    When I ask for ideas with "Acelga, cruda"
    Then I get 1 idea
    And there is no idea called "Acelgas de la abuela"
    And there is no idea called "Acelgas al vapor"

  Scenario: Asking about the same food again does not search again
    Given the web search finds "Acelgas esparragadas" at "https://www.directoalpaladar.com/acelgas-esparragadas", "sartén", 30 minutes
    And I have asked for ideas with "Acelga, cruda"
    When I ask for ideas with "Acelga, cruda"
    Then the model was asked 1 time
    And I get 1 idea

  # Una receta de acelgas no es un dato tuyo: lo que buscó otra persona sirve
  # igual, y es cuota que nadie vuelve a gastar.
  Scenario: What someone else found for the same food is reused
    Given the web search finds "Acelgas esparragadas" at "https://www.directoalpaladar.com/acelgas-esparragadas", "sartén", 30 minutes
    And another user has asked for ideas with "Acelga, cruda"
    When I ask for ideas with "Acelga, cruda"
    Then the model was asked 1 time
    And I get 1 idea

  Scenario: «Otras ideas» searches again and keeps what was already found
    Given the web search finds "Acelgas esparragadas" at "https://www.directoalpaladar.com/acelgas-esparragadas", "sartén", 30 minutes
    And I have asked for ideas with "Acelga, cruda"
    And the web search now finds "Acelgas a la vasca" at "https://www.consumer.es/acelgas-a-la-vasca.html", "olla", 40 minutes
    When I ask for other ideas with "Acelga, cruda"
    Then the model was asked 2 times
    And I get 2 ideas

  # La misma receta encontrada dos veces es una idea, no dos: lo que la
  # identifica es su enlace, no cómo la haya llamado el modelo esta vez.
  Scenario: A recipe found twice is stored once
    Given the web search finds "Acelgas esparragadas" at "https://www.directoalpaladar.com/acelgas-esparragadas", "sartén", 30 minutes
    And I have asked for ideas with "Acelga, cruda"
    And the web search now finds "Acelgas esparragadas con pan" at "https://www.directoalpaladar.com/acelgas-esparragadas", "sartén", 30 minutes
    When I ask for other ideas with "Acelga, cruda"
    Then I get 1 idea

  Scenario: Ideas for one food are not ideas for another
    Given the catalogue has "Calabacín, crudo"
    And the web search finds "Acelgas esparragadas" at "https://www.directoalpaladar.com/acelgas-esparragadas", "sartén", 30 minutes
    And I have asked for ideas with "Acelga, cruda"
    When I ask for ideas with "Calabacín, crudo"
    Then the model was asked 2 times

  # Lo guardado no depende del modelo: sin cuota se sigue viendo, que es
  # justo para lo que se guardó.
  Scenario: With the day's quota gone, stored ideas are still there
    Given the web search finds "Acelgas esparragadas" at "https://www.directoalpaladar.com/acelgas-esparragadas", "sartén", 30 minutes
    And I have asked for ideas with "Acelga, cruda"
    And the model has no quota left for today
    When I ask for other ideas with "Acelga, cruda"
    Then it says the quota is gone for the day
    And I get 1 idea

  Scenario: With the day's quota gone and nothing stored, the app says so instead of failing
    Given the model has no quota left for today
    When I ask for ideas with "Acelga, cruda"
    Then it says the quota is gone for the day
    And I get 0 ideas

  # Una respuesta ilegible no se guarda: guardarla sería servirla para
  # siempre sin volver a preguntar.
  Scenario: An unreadable answer is not stored
    Given the model answers something that is not a list of recipes
    When I ask for ideas with "Acelga, cruda"
    Then it says the answer could not be read
    And no ideas are stored for "Acelga, cruda"

  Scenario: Ideas are only asked for a food that exists
    When I ask for ideas with a food that does not exist
    Then the answer is not found
