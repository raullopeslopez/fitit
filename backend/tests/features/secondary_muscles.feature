Feature: Count the muscles a lift trains on the way past
  A bench press trains the triceps and the front delt, and until now the log
  said it trained neither. The weekly-set reference the app shows (4 minimum,
  10–20 efficient) comes from Pelland et al. 2026, where every set was counted
  fractionally: indirect work counts half. Counting only direct work against a
  reference built on fractional counting compares two different units, and the
  muscles that live on indirect volume — triceps, biceps, shoulders — read low
  for ever.

  Spec: docs/investigacion-series-semana.md, section 2.

  Scenario: A compound press also trains the triceps and the front delt
    Given I logged "Press Banca" in a workout
    When I ask for my days
    Then the set for "Press Banca" is primarily "Pecho"
    And it trains exactly "Tríceps" plus "Hombro"

  Scenario: An overhead press does not name the shoulder twice
    Given I logged "Press Militar" in a workout
    When I ask for my days
    Then the set for "Press Militar" is primarily "Hombro"
    And it also trains "Tríceps"
    And it does not also train "Hombro"

  Scenario: A vertical pull also trains the biceps
    Given I logged "Dominadas" in a workout
    When I ask for my days
    Then the set for "Dominadas" is primarily "Espalda"
    And it also trains "Bíceps"

  # Kubo et al. 2019: full squats grew the glutes and the adductors, and the
  # hamstrings barely at all. So the half-set goes to Glúteo, not to Femoral.
  Scenario: A squat also trains the glutes, not the hamstrings
    Given I logged "Sentadilla" in a workout
    When I ask for my days
    Then the set for "Sentadilla" is primarily "Cuádriceps"
    And it also trains "Glúteo"
    And it does not also train "Femoral"

  Scenario: A lunge also trains the glutes
    Given I logged "Zancadas" in a workout
    When I ask for my days
    Then the set for "Zancadas" is primarily "Cuádriceps"
    And it also trains "Glúteo"

  Scenario: A deadlift trains both halves of the hinge
    Given I logged "Peso muerto" in a workout
    When I ask for my days
    Then the set for "Peso muerto" is primarily "Espalda"
    And it trains exactly "Femoral" plus "Glúteo"

  Scenario: A Romanian deadlift also trains the glutes
    Given I logged "Peso muerto rumano" in a workout
    When I ask for my days
    Then the set for "Peso muerto rumano" is primarily "Femoral"
    And it also trains "Glúteo"
    And it does not also train "Femoral"

  Scenario: A back extension is a hinge, and pays the glutes
    Given I logged "Hiperextensiones" in a workout
    When I ask for my days
    Then the set for "Hiperextensiones" is primarily "Femoral"
    And it also trains "Glúteo"

  # A hip thrust barely loads the hamstrings: the knee is bent, which is where
  # they are weakest as hip extensors.
  Scenario: A hip thrust is glute work and nothing else
    Given I logged "Hip thrust" in a workout
    When I ask for my days
    Then the set for "Hip thrust" is primarily "Glúteo"
    And it trains nothing else

  Scenario: A leg curl trains the hamstrings and nothing else
    Given I logged "Curl femoral" in a workout
    When I ask for my days
    Then the set for "Curl femoral" is primarily "Femoral"
    And it trains nothing else

  # The rules are keyed on the movement, not on the words alone: "prensa" is a
  # leg press, but "gemelo en prensa" is a calf raise and trains no hamstring.
  Scenario: A calf raise on the leg press machine is still a calf raise
    Given I logged "Gemelo en Prensa" in a workout
    When I ask for my days
    Then the set for "Gemelo en Prensa" is primarily "Gemelo"
    And it trains nothing else

  Scenario: An isolation lift trains one muscle and no other
    Given I logged "Curl de Bíceps" in a workout
    When I ask for my days
    Then the set for "Curl de Bíceps" is primarily "Bíceps"
    And it trains nothing else

  Scenario: A machine fly is not a press
    Given I logged "Contractora" in a workout
    When I ask for my days
    Then the set for "Contractora" is primarily "Pecho"
    And it trains nothing else

  Scenario: Cardio trains no muscle group at all
    Given I logged "Cinta" in a workout
    When I ask for my days
    Then the set for "Cinta" has no muscle group
    And it trains nothing else
