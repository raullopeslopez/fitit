Feature: The rules I eat by
  My preferences are not numbers, they are rules: protein between 1.5 and 2 g
  per kilo, vegetables at lunch, pulses three times a week, more carbs on the
  days I train. Each one says what it applies to — the day, the week, or one
  meal — and whether breaking it ruins the plan or only makes it worse.

  Scenario: Protein per kilo is measured against what I weigh
    Given I weigh 78 kg
    And a hard rule of 1.5 to 2 g of protein per kilo
    When I eat 100 g of protein today
    Then the rule is broken
    And it says I am 17 g short

  Scenario: And it is satisfied inside the band
    Given I weigh 78 kg
    And a hard rule of 1.5 to 2 g of protein per kilo
    When I eat 130 g of protein today
    Then the rule is met

  Scenario: A rule about one meal only looks at that meal
    Given a hard rule of vegetables at comida
    When I eat "Brócoli" at cena
    Then the rule is broken

  # La regla del `NULL`, en el sitio donde más daño hace.
  Scenario: A food nobody classified is not "not a vegetable"
    Given a hard rule of vegetables at comida
    When I eat "Guiso de la abuela" at comida, which has no group
    Then the rule cannot say
    And it says 1 food could not be classified

  Scenario: A weekly rule counts across the week
    Given a soft rule of pulses at least 3 times a week
    When I eat pulses on 2 days this week
    Then the rule is broken
    And it says I am 1 short

  Scenario: A rule that only applies on training days is quiet on the rest
    Given a hard rule of vegetables at comida on training days
    When I eat nothing green at comida on a day I did not train
    Then the rule does not apply

  Scenario: Hard and soft are not the same failure
    Given I weigh 78 kg
    And a hard rule of 1.5 to 2 g of protein per kilo
    And a soft rule of pulses at least 3 times a week
    When I eat 100 g of protein today
    Then the day is not acceptable

  Scenario: Only a soft rule failing still leaves an acceptable day
    Given a soft rule of pulses at least 3 times a week
    When I eat pulses on 2 days this week
    Then the day is acceptable

  # Retirada y callada no son lo mismo: una condicionada al tipo de día sigue
  # siendo tuya y se calla hoy; una retirada ya no se juzga, y seguir
  # enseñándola cada día como «no aplica» sería ruido para siempre.
  Scenario: A rule I retired stops being judged at all
    Given a hard rule of vegetables at comida that I retired yesterday
    When I eat "Brócoli" at cena
    Then nothing is judged today

  Scenario: The catalogue is closed
    When I try to save a rule of a type nobody has written
    Then it is refused
