Feature: What I weigh
  Everything the planned diet derives is built on kilos: grams of protein per
  kilo, and a maintenance worked out from what the scale does over weeks. A
  single weigh-in cannot carry that — body weight swings more than a kilo on
  water alone. What counts is the trend, and a trend nobody can compute yet is
  unknown, not the last number on the scale.

  Scenario: A weigh-in is recorded and read back
    When I weigh 78.4 kg on 2026-09-01
    Then my weight history holds 78.4 kg for 2026-09-01

  Scenario: Weighing twice in one day leaves the last one, not both
    Given I weighed 78.4 kg on 2026-09-01
    When I weigh 78.9 kg on 2026-09-01
    Then my weight history holds 1 weigh-in
    And my weight history holds 78.9 kg for 2026-09-01

  Scenario: One weigh-in is not a trend
    Given I weighed 78.4 kg on 2026-09-01
    Then my trend is unknown, not 78.4

  Scenario: The trend averages the recent weigh-ins
    Given I weighed 78.2 kg on 2026-09-01
    And I weighed 79.0 kg on 2026-09-02
    And I weighed 78.6 kg on 2026-09-03
    Then my trend is 78.6 kg
    And my trend says it used 3 weigh-ins

  # Pesarse de vez en cuando es lo que hay (decisión 16). Los días sin pesada
  # no son ceros: sencillamente no hay fila, y la media no los cuenta.
  Scenario: Days without a weigh-in are not zeros
    Given I weighed 78.0 kg on 2026-09-01
    And I weighed 79.0 kg on 2026-09-10
    Then my trend is 78.5 kg
    And my trend says it used 2 weigh-ins

  Scenario: A weigh-in from months back does not drag the trend
    Given I weighed 70.0 kg on 2026-01-01
    And I weighed 79.0 kg on 2026-09-01
    And I weighed 79.2 kg on 2026-09-02
    Then my trend is 79.1 kg
    And my trend says it used 2 weigh-ins

  Scenario: The trend says how recent it is
    Given I weighed 78.0 kg on 2026-09-01
    And I weighed 79.0 kg on 2026-09-02
    Then my trend is measured up to 2026-09-02

  # La tarjeta de Perfil enseña lo que marcó la báscula (decisión 2026-09-27):
  # tras pesarte, «—» se leía como que no se había guardado. Viaja aparte de la
  # tendencia, que sigue siendo lo único de lo que se deriva nada.
  Scenario: The last weigh-in travels next to the trend, not inside it
    Given I weighed 78.4 kg on 2026-09-01
    Then my last weigh-in is 78.4 kg
    And my trend is unknown, not 78.4

  Scenario: The last weigh-in is the most recent day, not the last one typed
    Given I weighed 79.0 kg on 2026-09-02
    And I weighed 78.2 kg on 2026-09-01
    Then my last weigh-in is 79.0 kg

  Scenario: Nobody has weighed, so there is no last weigh-in
    Then my last weigh-in is unknown

  Scenario: A number that cannot be a body weight is refused
    When I try to weigh 0 kg on 2026-09-01
    Then the weigh-in is refused
    And my weight history holds 0 weigh-ins
