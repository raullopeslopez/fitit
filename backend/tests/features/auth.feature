Feature: Authentication
  Only I can touch my workouts, so the API requires a login.

  Scenario: Reject requests without a token
    When I create a workout without logging in
    Then I am refused with 401

  Scenario: Log in and use the token
    Given an account "raul" with password "s3cretpass"
    When I log in as "raul" with password "s3cretpass"
    Then I receive an access token
    And I can create a workout with that token

  Scenario: Reject a wrong password
    Given an account "raul" with password "s3cretpass"
    When I log in as "raul" with password "wrong"
    Then I am refused with 401
