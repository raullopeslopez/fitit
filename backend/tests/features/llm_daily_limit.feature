Feature: A daily limit on the calls that spend the model keys
  Every reading done by a model — a phrase, a voice note, a label photo, a
  ticket, a plan, ideas, a dish, an estimate — is paid for with the server's
  Gemini and Groq keys. Each account gets a number of those calls a day, shared
  by all of them, so a stranger with a token cannot drain the keys.

  Running out is not something breaking: the reply is the same "the day's quota
  is spent" every screen already knows how to say, sent as a 429.

  Scenario: Calls under the limit are answered
    Given the daily model limit is 2
    When I write a phrase for the model 2 times
    Then every one of them was read by the model

  Scenario: The call past the limit is refused without reaching the model
    Given the daily model limit is 2
    And I wrote a phrase for the model 2 times
    When I write a phrase for the model
    Then I am refused with 429
    And the refusal says the day's quota is spent
    And the model was called 2 times

  Scenario: The limit is per account
    Given the daily model limit is 1
    And I wrote a phrase for the model 1 times
    When another account writes a phrase for the model
    Then that account is read by the model

  Scenario: A new day brings the calls back
    Given the daily model limit is 1
    And I wrote a phrase for the model 1 times
    When the day changes
    And I write a phrase for the model
    Then the model was called 2 times

  Scenario Outline: Every endpoint that calls a model shares the limit
    Given the daily model limit is 0
    When I POST to <path>
    Then I am refused with 429

    Examples:
      | path                  |
      | /food-log/text        |
      | /food-log/voice       |
      | /foods/label          |
      | /pantry/ticket        |
      | /dish-ideas           |
      | /dishes/generate      |
      | /plans/out/estimate   |
      | /plans/import         |
