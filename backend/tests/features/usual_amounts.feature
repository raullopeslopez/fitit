Feature: The amounts I use for one food
  Picking a food from the search box should not start at 100 g when I always
  have 125. The sheet offers the amounts I repeat for that food, the one I
  repeat most first, so one tap sets it.

  Scenario: The amount I repeat most comes first, with how many times
    Given I have logged "Yogur" at 125 g three times and at 250 g once
    When I ask for my amounts of "Yogur"
    Then the amounts are 125 g ×3, 250 g ×1

  Scenario: On a tie, the one I used last comes first
    Given I have logged "Pan" at 80 g, then 200 g
    When I ask for my amounts of "Pan"
    Then the amounts are 200 g ×1, 80 g ×1

  Scenario: At most three amounts
    Given I have logged "Leche" at 100, 200, 300 and 400 g
    When I ask for my amounts of "Leche"
    Then there are 3 amounts

  Scenario: A food I never logged has no amounts, not a made-up one
    Given a food "Kéfir" I never logged
    When I ask for my amounts of "Kéfir"
    Then there are 0 amounts

  Scenario: Another user's diary is not my habit
    Given someone else logged 300 g of a shared food "Arroz"
    When I ask for my amounts of "Arroz"
    Then there are 0 amounts
