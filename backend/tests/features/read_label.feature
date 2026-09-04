Feature: Read a packaged product's label off a photo
  Typing a label in by hand is a name, a brand and five numbers. The camera can
  do that part, as long as everything it cannot actually read stays unread: a
  figure this feature invents is frozen into the diary the moment I log it, and
  from then on it is indistinguishable from one I measured.

  Scenario: The photo fills the form in
    Given the camera reads a clean "por 100 g" label for "Yogur natural" of "Hacendado"
    When I photograph a label
    Then the form comes back holding "Yogur natural" of "Hacendado"
    And it says the figures came from "por 100 g"
    And it proposes 61 kcal per 100 g

  Scenario: A nutrient the label does not declare arrives unknown
    Given the camera reads a label whose table says nothing about fibre
    When I photograph a label
    Then the proposed fibre is unknown, not zero
    And the form is told fibre was dropped
    And the other figures still come through

  Scenario: A per-ration column is refused instead of rescaled
    Given the camera reads the "por ración (125 g)" column
    When I photograph a label
    Then nothing is proposed
    And it says the column it refused was "por ración (125 g)"

  Scenario: A photo it cannot read still leaves me typing
    Given the camera cannot read the photo at all
    When I photograph a label
    Then nothing is proposed
    And it says the photo was unreadable

  Scenario: Reading a label writes nothing to the catalogue
    Given the camera reads a clean "por 100 g" label for "Yogur natural" of "Hacendado"
    When I photograph a label
    Then the catalogue still does not have "Yogur natural"

  Scenario: With no key configured there is nothing to photograph with
    Given the label reader is not configured
    When I photograph a label
    Then the app says the reader is switched off

  Scenario: A used-up minute is not a used-up day
    Given the camera has run out of requests for this minute
    When I photograph a label
    Then nothing is proposed
    And it says to wait a minute rather than to come back tomorrow

  Scenario: A used-up day says so
    Given the camera has run out of requests for today
    When I photograph a label
    Then nothing is proposed
    And it says the day's allowance is gone

  Scenario: Figures that do not add up are flagged
    Given the camera reads a label whose calories do not match its macros
    When I photograph a label
    Then the form still comes back filled in
    And it warns that 61 declared kcal do not match the 83 the macros make
