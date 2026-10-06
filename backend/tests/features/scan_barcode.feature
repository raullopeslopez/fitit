Feature: Scan a barcode
  A barcode names a product better than any photo and better than any name I
  could type, and asking about one costs no key, no quota and no model. That is
  the whole point: the camera reading a label is the expensive door, so the
  scanner exists to leave it for what Open Food Facts cannot answer — own-brand
  with no entry, the bakery, loose weight.

  Scenario: A product I already have asks nobody
    Given I already have "Yogur natural" with the barcode "8410128750121"
    When I scan "8410128750121"
    Then it hands me back "Yogur natural" straight away
    And Open Food Facts is never asked

  Scenario: A product Open Food Facts knows becomes a proposal
    Given Open Food Facts knows "8410128750121" as "Yogur natural" of "Hacendado"
    When I scan "8410128750121"
    Then the form comes back holding "Yogur natural" of "Hacendado"
    And it proposes 61 kcal per 100 g
    And the catalogue still does not have "Yogur natural"

  Scenario: Figures per serving are refused rather than rescaled
    Given Open Food Facts has "8410128750121" with its figures per serving
    When I scan "8410128750121"
    Then nothing is proposed
    And it says the entry could not be used because "por ración"

  Scenario: An entry with no calories is not worth having
    Given Open Food Facts has "8410128750121" with no calories on it
    When I scan "8410128750121"
    Then nothing is proposed
    And it says the entry could not be used because "sin kcal"

  Scenario: A nutrient Open Food Facts does not carry stays unknown
    Given Open Food Facts knows "8410128750121" but carries no fibre for it
    When I scan "8410128750121"
    Then the proposed fibre is unknown, not zero
    And it proposes 61 kcal per 100 g

  Scenario: A code nobody knows leaves me typing, with the code kept
    Given Open Food Facts has never heard of "8410128750121"
    When I scan "8410128750121"
    Then nothing is proposed
    And it says the code is unknown
    And it gives me back the code so the food I type keeps it

  Scenario: With no signal the scan is not a dead end
    Given Open Food Facts cannot be reached
    When I scan "8410128750121"
    Then nothing is proposed
    And it says it could not ask

  Scenario: Something that is not a barcode is refused before anyone is asked
    When I scan "pollo"
    Then the app refuses it as malformed

  # El catálogo del súper (docs/catalogo-supermercado.md): un producto
  # importado de Open Food Facts ya está en la base, así que escanearlo es lo
  # mismo que escanear uno tuyo — nadie sale a la red.
  Scenario: A product in the shared catalogue asks nobody
    Given the catalogue has "Queso fresco batido 0%" with the barcode "8480000510716"
    When I scan "8480000510716"
    Then it hands me back "Queso fresco batido 0%" straight away
    And Open Food Facts is never asked

  Scenario: My own food wins over the catalogue's with the same code
    Given the catalogue has "Queso fresco batido 0%" with the barcode "8480000510716"
    And I already have "Mi queso batido" with the barcode "8480000510716"
    When I scan "8480000510716"
    Then it hands me back "Mi queso batido" straight away

  Scenario: Searching does not show the same product twice
    Given the catalogue has "Queso fresco batido 0%" with the barcode "8480000510716"
    And I already have "Queso fresco batido mío" with the barcode "8480000510716"
    When I search for "queso fresco batido"
    Then only one result carries the barcode "8480000510716"
    And that result is "Queso fresco batido mío"
