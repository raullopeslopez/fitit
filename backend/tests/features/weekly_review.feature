Feature: When I plan the next week, the app asks whether I logged everything
  My measured expenditure is what I ate on average, corrected by what the scale
  did. A week logged by halves makes it come out too low, and then the app
  proposes eating less than I need. So once a week it asks, and a week I say I
  did not log stops counting. It only proposes: nothing changes my target until
  I accept (decision 18).

  It asks when I plan the next week, not on a fixed weekday: I shop once a week
  but not always the same day, and a target that moves after I have shopped
  leaves the week planned on the old one. So the review has no day of its own —
  it is due whenever a week has gone by since the last answer.

  Scenario: Any day can be a review day
    Given I logged food two days ago
    When I ask about the weekly review
    Then the review is due
    And it covers the seven days before today

  Scenario: Answered six days ago, it does not ask again
    Given I answered the weekly review 6 days ago
    And I logged food two days ago
    When I ask about the weekly review
    Then the review is not due

  Scenario: Answered a week ago, it asks again
    Given I answered the weekly review 7 days ago
    And I logged food two days ago
    When I ask about the weekly review
    Then the review is due

  Scenario: With food logged in the week, it asks; after answering it does not
    Given I logged food two days ago
    When I ask about the weekly review
    Then the review is due
    And it covers the seven days before today
    When I answer the weekly review with "all"
    And I ask about the weekly review
    Then the review is not due
    And the stored answer is "all"

  # Una cuenta nueva no tiene una semana que revisar: preguntarle por una que no
  # apuntó sería ruido, y la primera pregunta que ve una cuenta no puede ser ésa.
  Scenario: An account that logged nothing in the week is not asked
    When I ask about the weekly review
    Then the review is not due

  Scenario: Answering does not change my target and returns a proposal
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    When I answer the weekly review with "all"
    Then it returns a proposal
    And my daily target has not changed

  # Dos semanas distintas para que la cifra se note: 2000 kcal las dos semanas
  # anteriores y 1000 la semana revisada (a medias).
  Scenario: A week answered "No" does not count in the measured expenditure
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    And I ate 2000 kcal a day in the two weeks before and 1000 in the week to review
    When I answer the weekly review with "none"
    Then the proposal says the number came from my own data
    And the proposal is 2000 kcal

  Scenario: A week answered "Casi todo" counts like "Sí"
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    And I ate 2000 kcal a day in the two weeks before and 1000 in the week to review
    When I answer the weekly review with "most"
    Then the proposal is 1667 kcal

  Scenario: An unanswered week counts
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    And I ate 2000 kcal a day in the two weeks before and 1000 in the week to review
    When I ask what I should eat
    Then the proposal is 1667 kcal

  Scenario: Accepting the reviewed proposal marks the review accepted
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    When I answer the weekly review with "all"
    And I accept the proposal the review returned
    Then the review is marked accepted

  Scenario: Accepting another figure leaves the review unaccepted
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    When I answer the weekly review with "all"
    And I accept a target of 2300 kcal
    Then the review is not marked accepted

  Scenario: Answering twice keeps one row with the last answer
    When I answer the weekly review with "none"
    And I answer the weekly review with "all"
    Then there is one review stored
    And the stored answer in the database is "all"

  # Opción B (7 oct): un día cuenta para el gasto medido si tiene al menos tres
  # de las cuatro comidas apuntadas. Uno con una o dos es un día a medias, y
  # contarlo como entero hace que el gasto salga bajo y la app proponga comer
  # menos de lo que necesitas.
  Scenario: Days with fewer than three meals logged do not count
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    And I ate 2000 kcal a day in the two weeks before and 1000 in 2 meals a day in the week to review
    When I ask what I should eat
    Then the proposal is 2000 kcal
    And the proposal says 7 days were left out as half-logged

  Scenario: Three meals logged is a whole day
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    And I ate 2000 kcal a day in the two weeks before and 1000 in 3 meals a day in the week to review
    When I ask what I should eat
    Then the proposal is 1667 kcal
    And the proposal says 0 days were left out as half-logged

  # Registro sin huecos, fase 1: un día cuyas comidas del plan están todas
  # dichas es un día entero aunque tenga pocas apuntadas — saltarse la cena es
  # un dato, no un hueco. La regla de las tres comidas sigue valiendo para los
  # días sin plan, para no perder ninguno de los que hoy cuentan.
  Scenario: A day with every planned meal said counts even with few meals logged
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    And I ate 2000 kcal a day in the two weeks before and 1000 in 2 meals a day in the week to review
    And I said something about every planned meal of the week to review
    When I ask what I should eat
    Then the proposal is 1667 kcal
    And the proposal says 0 days were left out as half-logged

  Scenario: The review counts the planned meals of the week and the ones said
    Given I logged food two days ago
    And a plan for the week to review where I said 3 meals
    When I ask about the weekly review
    Then it counts 3 of the planned meals as said
