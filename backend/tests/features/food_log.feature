Feature: Log what I eat
  As someone already tracking workouts, I can log food against the same day,
  so the two can be read side by side.

  Scenario: A day's totals add up what was logged for it
    Given a food "Arroz blanco cocido" with 130 kcal and 2.7 g of protein per 100 g
    When I log 200 g of "Arroz blanco cocido"
    Then the day totals 260 kcal and 5.4 g of protein

  Scenario: A nutrient nobody knows stays unknown
    Given a food "Piquillos de mi madre" with 60 kcal per 100 g and no fibre on record
    When I log 150 g of "Piquillos de mi madre"
    Then that entry records 90 kcal
    And that entry's fibre is unknown, not zero
    And the day's fibre total is unknown, not zero

  Scenario: Correcting a food leaves what I already logged alone
    Given a food "Pan de la panaderia" with 250 kcal per 100 g
    And I log 100 g of "Pan de la panaderia"
    When I correct "Pan de la panaderia" to 300 kcal per 100 g
    Then the entry I already logged still records 250 kcal

  Scenario: A late supper belongs to the day that has not ended yet
    Given a food "Tortilla" with 150 kcal per 100 g
    When I log 100 g of "Tortilla" at 01:30 on 2026-09-01
    Then it counts towards 2026-08-31
