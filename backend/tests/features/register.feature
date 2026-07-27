Feature: Registration
  Anyone can create their own account and log straight in.

  Scenario: Register and start using the app immediately
    When I register as "amigo" with password "s3cret123"
    Then I receive an access token
    And I can create a workout with that token

  Scenario: Reject a taken username
    Given an account "amigo" with password "s3cret123"
    When I register as "amigo" with password "different-pass"
    Then I am refused with 409

  Scenario: Reject a taken username regardless of case
    Given an account "amigo" with password "s3cret123"
    When I register as "AMIGO" with password "different-pass"
    Then I am refused with 409

  Scenario: The freshly registered account can log in like any other
    When I register as "amigo" with password "s3cret123"
    And I log in as "amigo" with password "s3cret123"
    Then I receive an access token
