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
