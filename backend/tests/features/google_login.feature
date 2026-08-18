Feature: Sign in with Google
  Entering with a Google account costs one tap and no password. The account it
  opens has to be the one I already train in — a sign-in that silently starts a
  fresh, empty history is worse than no sign-in at all.

  Scenario: A Google account nobody has seen before gets in on the first tap
    When I sign in with Google as "amiga@gmail.com"
    Then I receive an access token
    And I can create a workout with that token

  Scenario: The same Google account comes back to the same workouts
    Given I signed in with Google as "amiga@gmail.com" and logged a workout
    When I sign in with Google as "amiga@gmail.com"
    Then I receive an access token
    And that token sees 1 workout

  Scenario: Google opens the password account that already has this email
    Given an account "raul" with email "raul@gmail.com" that logged a workout
    When I sign in with Google as "raul@gmail.com"
    Then I receive an access token
    And that token sees 1 workout

  Scenario: The adopted account still opens with its password
    Given an account "raul" with email "raul@gmail.com" that logged a workout
    When I sign in with Google as "raul@gmail.com"
    And I log in as "raul" with password "s3cretpass"
    Then I receive an access token
    And that token sees 1 workout

  Scenario: Reject a token Google did not sign
    When I sign in with a Google token signed by somebody else
    Then I am refused with 401

  Scenario: Reject a token issued for a different app
    When I sign in with a Google token issued for another app
    Then I am refused with 401

  Scenario: Reject a Google account whose email is not verified
    When I sign in with Google as "impostora@gmail.com" without verifying the email
    Then I am refused with 401
