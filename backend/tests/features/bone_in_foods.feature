Feature: A bone-in food counts what you eat, not the bone
  The tray says 1 kg of muslos and the label says 190 kcal per 100 g, but a
  third of that kilo is bone. Whether those 190 kcal are for the tray or for
  the meat is not written anywhere: CIQUAL, BEDCA and USDA give them for the
  edible part, and most meat labels do the same, though the law asks for the
  product "as sold". So the food carries how much of it is bone and what its
  kcal refer to, you weigh what you bought, and the diary counts the meat.

  Scenario: A catalogue thigh weighed with its bone counts only the meat
    Given the catalogue has "Pollo, muslo, carne y piel, crudo" with 192 kcal and 18 g of protein per 100 g
    When I log 300 g of "Pollo, muslo, carne y piel, crudo" with the bone
    Then the entry weighs 300 g, of which 210 g are edible
    And the entry records 403.2 kcal and 37.8 g of protein

  Scenario: The catalogue says how much is bone and that its kcal are for the meat
    Given the catalogue has "Pollo, muslo, carne y piel, crudo" with 192 kcal and 18 g of protein per 100 g
    When I look up "Pollo, muslo, carne y piel, crudo"
    Then it says 30 % of it is bone, by reference
    And it says its kcal are for the edible part, as a fact

  Scenario: Weighed without the bone, the weight is what I ate
    Given the catalogue has "Pollo, muslo, carne y piel, crudo" with 192 kcal and 18 g of protein per 100 g
    When I log 300 g of "Pollo, muslo, carne y piel, crudo"
    Then the entry has no edible weight apart
    And the entry records 576 kcal and 54 g of protein

  Scenario: A label that matches the meat is read as kcal of the meat
    Given I add "Muslos de pollo" with 190 kcal per 100 g
    Then it says its kcal are for the edible part, as a guess
    When I log 1000 g of "Muslos de pollo" with the bone
    Then the entry weighs 1000 g, of which 700 g are edible
    And the entry records 1330 kcal

  Scenario: A label that matches the whole tray is read as kcal with the bone
    Given I add "Muslos de pollo" with 135 kcal per 100 g
    Then it says its kcal are for the food as sold, as a guess
    When I log 1000 g of "Muslos de pollo" with the bone
    Then the entry has no edible weight apart
    And the entry records 1350 kcal

  Scenario: A label that matches neither waits for me to say which it is
    Given I add "Muslos de pollo" with 165 kcal per 100 g
    Then it says nobody knows what its kcal are for
    When I try to log 1000 g of "Muslos de pollo" with the bone
    Then it is refused until I say what the kcal are for
    When I say the kcal of "Muslos de pollo" are for the edible part
    And I log 1000 g of "Muslos de pollo" with the bone
    Then the entry records 1155 kcal

  Scenario: Weighing the leftover bone corrects the entry and my food
    Given I add "Muslos de pollo" with 190 kcal per 100 g
    And I log 1000 g of "Muslos de pollo" with the bone
    When I weigh 250 g of leftover bone from that entry
    Then the entry weighs 1000 g, of which 750 g are edible
    And the entry records 1425 kcal
    And "Muslos de pollo" now says 25 % of it is bone, measured by me

  Scenario: Weighing the leftover bone of a catalogue food leaves the catalogue alone
    Given the catalogue has "Pollo, muslo, carne y piel, crudo" with 192 kcal and 18 g of protein per 100 g
    And I log 300 g of "Pollo, muslo, carne y piel, crudo" with the bone
    When I weigh 60 g of leftover bone from that entry
    Then the entry weighs 300 g, of which 240 g are edible
    And the catalogue food still says 30 % of it is bone, by reference

  Scenario: Re-weighing an entry keeps the share of bone it had
    Given the catalogue has "Pollo, muslo, carne y piel, crudo" with 192 kcal and 18 g of protein per 100 g
    And I log 300 g of "Pollo, muslo, carne y piel, crudo" with the bone
    When I correct that entry to 600 g
    Then the entry weighs 600 g, of which 420 g are edible
    And the entry records 806.4 kcal and 75.6 g of protein

  Scenario: What I usually weigh with the bone comes back with the bone
    Given the catalogue has "Pollo, muslo, carne y piel, crudo" with 192 kcal and 18 g of protein per 100 g
    And I log 300 g of "Pollo, muslo, carne y piel, crudo" with the bone
    When I ask what I usually eat
    Then "Pollo, muslo, carne y piel, crudo" comes back as 300 g with the bone, 403.2 kcal

  Scenario: Leftover bone means nothing for what I weighed without it
    Given the catalogue has "Pollo, muslo, carne y piel, crudo" with 192 kcal and 18 g of protein per 100 g
    And I log 300 g of "Pollo, muslo, carne y piel, crudo"
    When I try to weigh 60 g of leftover bone from that entry
    Then it is refused because that entry was not weighed with the bone

  Scenario: Correcting my food redoes the day with the bone it has now
    Given I add "Muslos de pollo" with 190 kcal per 100 g
    And I log 1000 g of "Muslos de pollo" with the bone
    When I say "Muslos de pollo" is 20 % bone and redo that day
    Then the entry weighs 1000 g, of which 800 g are edible
    And the entry records 1520 kcal
