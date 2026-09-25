Feature: Los pasos de cada día
  La app de Android lee de Health Connect cuántos pasos has dado cada día y los
  sube; la pantalla de Días los pone al lado de cada día. El móvil es quien
  cuenta: el servidor guarda lo que le llega, un número por día y por persona.

  El día es un día civil, el que dice el teléfono. No pasa por el corte de las
  04:00 del diario de comida: los pasos de la 01:00 son de hoy, igual que una
  pesada de madrugada.

  El recuento crece a lo largo del día, así que una lectura posterior del mismo
  día es la más completa y escribe encima de la anterior. Y un día que el móvil
  no ha subido no tiene fila: es desconocido, la pantalla imprime `—`, y nadie
  se inventa un cero.

  Background:
    Given que tengo una cuenta

  Scenario: Un día nuevo se guarda y se lee
    When subo 8432 pasos el 2026-09-01
    Then la subida dice que guardó 1 día
    And mis pasos del 2026-09-01 al 2026-09-01 son "2026-09-01=8432"

  Scenario: Una lectura posterior del mismo día escribe encima
    Given que subí 3100 pasos el 2026-09-01
    When subo 8432 pasos el 2026-09-01
    Then mis pasos del 2026-09-01 al 2026-09-01 son "2026-09-01=8432"

  Scenario: Varios días de una vez, unos nuevos y otros ya subidos
    Given que subí 3100 pasos el 2026-09-02
    When subo "2026-09-01=5000, 2026-09-02=9100, 2026-09-03=12000"
    Then la subida dice que guardó 3 días
    And mis pasos del 2026-09-01 al 2026-09-03 son "2026-09-01=5000, 2026-09-02=9100, 2026-09-03=12000"

  Scenario: Subir lo mismo dos veces deja lo mismo
    Given que subí "2026-09-01=5000, 2026-09-02=9100"
    When subo "2026-09-01=5000, 2026-09-02=9100"
    Then la subida dice que guardó 2 días
    And mis pasos del 2026-09-01 al 2026-09-02 son "2026-09-01=5000, 2026-09-02=9100"

  Scenario: Un día con cero pasos medidos es un cero, no un hueco
    When subo 0 pasos el 2026-09-01
    Then mis pasos del 2026-09-01 al 2026-09-01 son "2026-09-01=0"

  # NULL no es 0: un día que el móvil no subió no aparece, ni como cero.
  Scenario: Un día sin subir no aparece, ni siquiera como cero
    Given que subí "2026-09-01=5000, 2026-09-03=7000"
    Then mis pasos del 2026-09-01 al 2026-09-03 son "2026-09-01=5000, 2026-09-03=7000"
    And el 2026-09-02 no aparece en mis pasos

  Scenario: La lectura se limita al rango pedido y va en orden de fecha
    Given que subí "2026-09-05=500, 2026-08-31=100, 2026-09-02=200, 2026-09-10=900"
    Then mis pasos del 2026-09-01 al 2026-09-05 son "2026-09-02=200, 2026-09-05=500"

  Scenario: Mañana se acepta, por la diferencia horaria
    When subo 1200 pasos mañana
    Then la subida dice que guardó 1 día

  Scenario Outline: Una subida imposible se rechaza entera
    Given que subí 3100 pasos el 2026-09-01
    When intento subir <subida>
    Then la subida se rechaza
    And mis pasos del 2026-09-01 al 2026-09-01 son "2026-09-01=3100"

    Examples:
      | subida                                   |
      | "2026-09-01=-5"                          |
      | "2026-09-01=4000, 2026-09-01=5000"       |
      | "2026-09-01=4000" y otro dentro de 2 días |
      | ninguna fecha                            |
      | 63 días seguidos                         |

  Scenario: 62 días seguidos caben en una subida
    When subo 62 días seguidos desde el 2026-07-01
    Then la subida dice que guardó 62 días
    And tengo 62 días con pasos del 2026-07-01 al 2026-08-31

  Scenario Outline: Un rango de lectura imposible se rechaza
    When pido mis pasos del <desde> al <hasta>
    Then la lectura se rechaza

    Examples:
      | desde      | hasta      |
      | 2026-09-05 | 2026-09-01 |
      | 2025-01-01 | 2026-09-01 |

  Scenario: Un rango de 400 días se puede leer
    When pido mis pasos del 2025-08-22 al 2026-09-25
    Then la lectura responde sin días

  Scenario: Los pasos de otra persona no son los míos
    Given que otra persona tiene una cuenta
    And que la otra persona subió 20000 pasos el 2026-09-01
    When subo 8432 pasos el 2026-09-02
    Then mis pasos del 2026-09-01 al 2026-09-02 son "2026-09-02=8432"
    And los pasos de la otra persona del 2026-09-01 al 2026-09-02 son "2026-09-01=20000"

  Scenario: Sin sesión no se suben pasos
    When alguien sin sesión sube 8432 pasos el 2026-09-01
    Then la subida sin sesión se rechaza por no estar autenticada
