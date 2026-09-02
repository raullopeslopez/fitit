Feature: What I always eat
  Eating is repeating yourself. Whatever I have already logged several times
  should be one tap away, with the amount I always use, without going through
  the search box first.

  Scenario: What I log most comes first, with the amount I always use
    Given I have logged 120 g of "Huevo cocido" three times
    And I have logged 150 g of "Merluza" once
    When I ask for what I always eat
    Then "Huevo cocido" comes before "Merluza"
    And "Huevo cocido" offers 120 g

  Scenario: The amount offered is the one I repeat, not the last one I typed
    Given I have logged "Pan" at 80 g, then 80 g, then 200 g
    When I ask for what I always eat
    Then "Pan" offers 80 g

  Scenario: And the meal it usually goes to
    Given I have logged "Yogur" twice at breakfast and once at dinner
    When I ask for what I always eat
    Then "Yogur" comes back for breakfast

  Scenario: A fresh account has no repertoire, and says so with an empty list
    When I ask for what I always eat
    Then the list is empty
