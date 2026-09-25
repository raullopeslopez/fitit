Feature: La API atiende a la app nativa
  La app de Android lleva la interfaz dentro del APK, así que ya no comparte
  origen con el backend: sus peticiones llegan desde `https://localhost` y el
  navegador de dentro exige CORS. La autenticación es un token en la cabecera
  `Authorization`, sin cookies, así que no hacen falta credenciales CORS.

  Y una app instalada no se actualiza sola al desplegar: el backend tiene que
  poder decirle a una versión vieja «actualiza» en vez de romperse contra un
  contrato que ya no entiende. Lo que no manda versión —la web de siempre, un
  curl, el health check de Render— pasa como hasta ahora.

  Scenario: La app de Android puede preguntar antes de llamar
    When la app pregunta desde "https://localhost" si puede hacer un POST a "/workouts"
    Then la respuesta permite el origen "https://localhost"
    And la respuesta permite la cabecera "X-Client-Version"

  Scenario: Un origen desconocido no recibe permiso
    When la app pregunta desde "https://evil.example" si puede hacer un POST a "/workouts"
    Then la respuesta no permite ningún origen

  Scenario: Sin versión mínima configurada nadie es rechazado
    When pido "/days" con la versión "0.0.1"
    Then la respuesta es 200

  Scenario: Una versión anterior a la mínima tiene que actualizar
    Given la versión mínima es "0.10.0"
    When pido "/days" con la versión "0.9.0"
    Then la respuesta es 426
    And el mensaje es "Hay una versión nueva de Fitit. Actualiza la app para seguir."

  Scenario Outline: La versión mínima o una posterior pasa
    Given la versión mínima es "0.10.0"
    When pido "/days" con la versión "<version>"
    Then la respuesta es 200

    Examples:
      | version |
      | 0.10.0  |
      | 0.10.1  |
      | 1.0.0   |

  Scenario: Sin cabecera de versión se pasa
    Given la versión mínima es "0.10.0"
    When pido "/days" sin versión
    Then la respuesta es 200

  Scenario: Una versión ilegible se deja pasar
    Given la versión mínima es "0.10.0"
    When pido "/days" con la versión "banana"
    Then la respuesta es 200

  Scenario: El health check nunca se bloquea
    Given la versión mínima es "0.10.0"
    When pido "/health" con la versión "0.1.0"
    Then la respuesta es 200

  Scenario: La pregunta previa de CORS no se bloquea
    Given la versión mínima es "0.10.0"
    When la app vieja pregunta desde "https://localhost" si puede hacer un GET a "/days"
    Then la respuesta permite el origen "https://localhost"
