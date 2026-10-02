Feature: The calories stop being typed
  Setting a calorie goal by hand asks you for a number nobody knows: getting it
  wrong by three hundred is trivial and changes everything. So you say what you
  want to happen to your body, and the number comes out of that — from a
  formula while there is nothing to go on, and from your own log as soon as
  there is.

  Scenario: With nothing logged, the formula answers and says so
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to lose 0.5 kg a week
    When I ask what I should eat
    Then it proposes fewer calories than my maintenance
    And it says the number came from the formula

  Scenario: Maintenance is what the formula says when I want to stay
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    When I ask what I should eat
    Then it proposes my maintenance

  # Lo que sólo puede hacer una app que tenga las dos cosas.
  Scenario: Once there is a log, my own data beats the formula
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    And I have eaten 2600 kcal a day for three weeks and not moved on the scale
    When I ask what I should eat
    Then it says the number came from my own data
    And it proposes 2600 kcal

  Scenario: Losing weight on a known intake says my maintenance is higher
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    And I have eaten 2000 kcal a day for three weeks and lost 1 kg
    When I ask what I should eat
    Then it proposes more than 2000 kcal

  # Una pesada suelta mide el agua de ese día. Dos, separadas por tres semanas,
  # meten ese ruido multiplicado por 7.700 kcal en el gasto: no es una tendencia.
  Scenario: One weigh-in at each end is not enough to measure
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    And I have eaten 2600 kcal a day for three weeks and only weighed in at the start and the end
    When I ask what I should eat
    Then it says the number came from the formula

  # Hoy todavía se está comiendo: contarlo como un día entero baja la media.
  Scenario: Today's unfinished diary does not count
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    And I have eaten 2600 kcal a day for three weeks and not moved on the scale
    And today I have only logged 500 kcal so far
    When I ask what I should eat
    Then it proposes 2600 kcal

  Scenario: Without knowing my body there is no formula either
    Given my goal is to maintain
    When I ask what I should eat
    Then it says it cannot work out a number yet
    And it says what it is missing

  # Decisión 18: me lo propone y yo lo acepto.
  Scenario: The number only becomes mine when I accept it
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    When I ask what I should eat
    Then my daily target has not changed
    When I accept what it proposes
    Then my daily target is what it proposed

  # Las kcal dicen cuánto; los macros, cómo se reparten. Salen del mismo sitio
  # para que no haya dos cifras que se contradigan: 2 g de proteína por kilo de
  # peso, un cuarto de las kcal en grasa y el resto en hidratos.
  Scenario: The proposal comes with its macros
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    When I ask what I should eat
    Then it proposes 156 g of protein
    And it proposes a quarter of the calories as fat
    And it proposes the rest as carbohydrates

  Scenario: Accepting the calories sets their macros too
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    When I ask what I should eat
    And I accept what it proposes
    Then my macro targets are the ones it proposed
    And my daily target is what it proposed

  # §31: congelar el objetivo por día deja de ser opcional en cuanto se deriva.
  Scenario: Today's target is frozen, so tomorrow's change does not rewrite today
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    And I ask what I should eat
    And I accept what it proposes
    And today's diary has been read
    When I accept a target of 1900 kcal instead
    Then what today's diary says I was aiming for has not moved

  # El widget de Android enseña pasos de hoy contra una meta. Nadie la ha
  # fijado nunca por defecto: sin ella no hay barra que pintar.
  Scenario: A daily steps goal starts unset
    When I ask for my profile
    Then my daily steps goal is not set

  Scenario: Setting a daily steps goal
    When I set my daily steps goal to 10000
    Then my daily steps goal is 10000

  Scenario: Clearing a daily steps goal
    Given I set my daily steps goal to 10000
    When I clear my daily steps goal
    Then my daily steps goal is not set

  Scenario: A daily steps goal below the floor is rejected
    When I try to set my daily steps goal to 500
    Then it is rejected

  Scenario: A daily steps goal above the ceiling is rejected
    When I try to set my daily steps goal to 200000
    Then it is rejected

  # El factor por días de entreno es un dedo al viento. Si el móvil sube tus
  # pasos, la actividad se cuenta en vez de adivinarse: el basal sedentario, más
  # lo que cuestan esos pasos, más lo que duraron tus sesiones.
  Scenario: My steps count in the formula instead of guessing my activity
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    And I have walked 10000 steps a day for two weeks
    When I ask what I should eat
    Then it says the number came from the formula
    And it counts 10000 steps a day
    And it proposes my sedentary maintenance plus 390 kcal

  Scenario: A few days of steps are not a habit yet
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    And I have walked 10000 steps a day for three days
    When I ask what I should eat
    Then it does not count my steps
    And it proposes my maintenance

  Scenario: The time I spent training counts too
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    And I have walked 10000 steps a day for two weeks
    And yesterday I trained for an hour
    When I ask what I should eat
    Then it counts 11 kcal a day of training
    And it proposes my sedentary maintenance plus 401 kcal

  # Los pasos afinan la estimación; no compiten con una medición.
  Scenario: My own data still beats the steps
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    And I have walked 10000 steps a day for two weeks
    And I have eaten 2600 kcal a day for three weeks and not moved on the scale
    When I ask what I should eat
    Then it says the number came from my own data
    And it proposes 2600 kcal

  # La pantalla tiene que poder enseñar la cuenta entera —gasto, ritmo, resultado—
  # y para eso el gasto del que sale la cifra viaja con ella.
  Scenario: A cut proposal says the expenditure it was worked out from
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to lose 0.5 kg a week
    And I have eaten 2600 kcal a day for three weeks and not moved on the scale
    When I ask what I should eat
    Then it says my expenditure is 2600 kcal
    And it proposes 2050 kcal

  Scenario: When I want to stay, the expenditure is the proposal
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to maintain
    And I have eaten 2600 kcal a day for three weeks and not moved on the scale
    When I ask what I should eat
    Then it says my expenditure is 2600 kcal
    And it proposes 2600 kcal

  # El suelo recorta las kcal propuestas, no lo que gastas: el gasto sigue siendo real.
  Scenario: The floor does not rewrite the expenditure
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to lose 0.5 kg a week
    And I have eaten 1500 kcal a day for three weeks and not moved on the scale
    When I ask what I should eat
    Then it proposes 1200 kcal
    And it says my expenditure is 1500 kcal

  Scenario: With nothing to work out a number from, there is no expenditure either
    Given my goal is to maintain
    When I ask what I should eat
    Then it says it has no expenditure

  # Un objetivo sin fecha no se puede sentir: con un peso meta el ritmo se
  # convierte en «semana 3 de 10» y en un día en el que acabas.
  Scenario: Accepting a cut with a goal weight starts the plan today from my current weight
    Given I am a 35 year old man, 178 cm, weighing 102.5 kg
    And my goal is to lose 0.5 kg a week, down to 97.5 kg
    When I ask what I should eat
    And I accept what it proposes
    Then my plan started today from 102.5 kg

  # Reajustar las kcal cada semana es el uso normal: no puede reiniciar el plan.
  Scenario: Accepting a new figure a week later does not restart the plan
    Given I am a 35 year old man, 178 cm, weighing 101 kg
    And my goal is to lose 0.5 kg a week, down to 97.5 kg
    And I started that plan 15 days ago from 102.5 kg
    When I accept a target of 2300 kcal instead
    Then my plan still started 15 days ago from 102.5 kg

  Scenario: The proposal says which week of the plan I am in and when I should arrive
    Given I am a 35 year old man, 178 cm, weighing 101 kg
    And my goal is to lose 0.5 kg a week, down to 97.5 kg
    And I started that plan 15 days ago from 102.5 kg
    When I ask what I should eat
    Then it says I am in week 3 of 10
    And it says 3.5 kg are left
    And it says I should arrive in 7 weeks
    And it does not say I have arrived

  Scenario: Changing my goal weight clears where the plan started
    Given I am a 35 year old man, 178 cm, weighing 101 kg
    And my goal is to lose 0.5 kg a week, down to 97.5 kg
    And I started that plan 15 days ago from 102.5 kg
    When I change my goal weight to 95 kg
    And I ask what I should eat
    Then my plan has no start
    And it has no plan

  Scenario: Changing something else leaves the plan where it was
    Given I am a 35 year old man, 178 cm, weighing 101 kg
    And my goal is to lose 0.5 kg a week, down to 97.5 kg
    And I started that plan 15 days ago from 102.5 kg
    When I change my height to 180 cm
    Then my plan still started 15 days ago from 102.5 kg

  # Decisión 18 también aquí: llegar no cambia el objetivo, lo propone.
  Scenario: Reaching the goal weight proposes maintenance and says so
    Given I am a 35 year old man, 178 cm, weighing 97 kg
    And my goal is to lose 0.5 kg a week, down to 97.5 kg
    And I started that plan 15 days ago from 102.5 kg
    When I ask what I should eat
    Then it says I have arrived
    And it proposes my maintenance
    And my daily target has not changed

  Scenario: Without a goal weight there is no plan
    Given I am a 35 year old man, 178 cm, weighing 78 kg
    And my goal is to lose 0.5 kg a week
    When I ask what I should eat
    Then it has no plan
    And it proposes fewer calories than my maintenance
