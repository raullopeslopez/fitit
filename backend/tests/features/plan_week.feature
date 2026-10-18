Feature: The week, generated
  Instead of typing what I ate, the app proposes the week: four meals a day,
  seven days, built out of the dishes I already cook and adjusted so each day
  lands on its target. It never repeats a dish two days running, and it says
  which of my rules the week does not meet.

  Scenario: A week is seven days of four meals
    Given a repertoire of 12 dishes
    When I generate the week of 2026-09-21
    Then the plan has 28 entries
    And every day has a desayuno, a comida, a cena and a snack

  Scenario: The same week asked twice is the same week
    Given a repertoire of 12 dishes
    When I generate the week of 2026-09-21
    And I ask for the plan of 2026-09-21
    Then it is the same plan

  # §22: el plan tiene que ser el mismo el martes que el jueves.
  Scenario: Regenerating with another seed gives another week
    Given a repertoire of 12 dishes
    When I generate the week of 2026-09-21
    And I generate the week of 2026-09-21 with seed 99
    Then the week changed

  Scenario: No dish lands two days running
    Given a repertoire of 12 dishes
    When I generate the week of 2026-09-21
    Then no dish appears on two consecutive days

  Scenario: A dish only goes where it belongs
    Given a repertoire of 12 dishes
    And a dish "Tostada de aguacate" that only serves desayuno
    When I generate the week of 2026-09-21
    Then "Tostada de aguacate" never appears outside desayuno

  # Ni un 500: no poder llenar un hueco es una respuesta, no una avería.
  Scenario: With nothing to put in a slot, it says which slot
    Given a repertoire of 1 dish that only serves desayuno
    When I generate the week of 2026-09-21 and it cannot
    Then it names the slot it could not fill

  # Una regla cuenta desde el día en que se crea, y una semana anterior a eso no
  # se juzga con ella. Sin fijar «hoy», este escenario caducaba con el calendario.
  Scenario: The plan says which rules the week does not meet
    Given today is 2026-09-21
    And a repertoire of 12 dishes
    And a soft rule of pulses 3 times a week
    When I generate the week of 2026-09-21
    Then the plan reports the rule as broken

  Scenario: A week I never generated is not invented
    When I ask for the plan of 2026-10-05
    Then there is no plan

  # El plan propone; confirmar es lo que escribe en el diario.
  Scenario: Confirming a planned meal writes it in the diary
    Given a repertoire of 12 dishes
    When I generate this week
    And I confirm the comida of today
    Then the diary of today has that meal
    And the plan says that meal is done

  Scenario: Confirming twice does not write it twice
    Given a repertoire of 12 dishes
    When I generate this week
    And I confirm the comida of today
    And I confirm the comida of today again
    Then the diary of today has that meal only once

  Scenario: Skipping a meal writes nothing
    Given a repertoire of 12 dishes
    When I generate this week
    And I skip the comida of today
    Then the diary of today is empty
    And the plan says that meal is skipped

  # La regla del `NULL`, en el dominio nuevo: un plan que no confirmaste no es
  # un plan incumplido.
  Scenario: A meal I said nothing about is not skipped
    Given a repertoire of 12 dishes
    When I generate this week
    Then the comida of today says nothing yet

  Scenario: A day that is not the one I am living is not confirmed
    Given a repertoire of 12 dishes
    When I generate this week
    And I try to confirm the comida of another day of the week
    Then it says that is not today

  Scenario: Every meal of the plan says what it adds up to
    Given a repertoire of 12 dishes
    When I generate the week of 2026-09-21
    Then every meal says its kcal

  # Las kcal dicen cuánto, no qué cocinar: sin los gramos de cada ingrediente
  # el plan no se puede seguir.
  Scenario: Every meal of the plan says how much of each ingredient
    Given a repertoire of 12 dishes of two ingredients
    When I generate the week of 2026-09-21
    Then every meal lists its ingredients with their grams

  # §4: cambiar no es lo mismo que saltárselo. Lo que de verdad comiste entra
  # en el diario; lo que el plan dijo se queda como lo dijo.
  Scenario: Swapping a meal logs what I really ate
    Given a repertoire of 12 dishes
    When I generate this week
    And I swap the comida of today for another dish
    Then the diary of today has the dish I swapped to
    And the plan still says the dish it planned
    And the plan says that meal is swapped

  Scenario: I cannot swap for somebody else's dish
    Given a repertoire of 12 dishes
    When I generate this week
    And I try to swap the comida of today for a dish that is not mine
    Then there is no such dish

  # §5: son dos preguntas distintas y ninguna sola sirve.
  Scenario: Adherence compares what I ate with what was planned
    Given a repertoire of 12 dishes
    And a week planned for 2026-09-14
    And I ate 1200 kcal on 2026-09-15
    When I ask how the week of 2026-09-14 went
    Then it covers 7 closed days
    And it says what I ate and what was planned

  # La regla del `NULL` otra vez: a las 10:00 la cena no está incumplida.
  Scenario: What has not happened yet does not count against me
    Given a repertoire of 12 dishes
    When I generate this week
    And I ask how this week went
    Then nothing counts as followed or missed yet
    And it says how many meals are still to come

  Scenario: It says which meal is where the plan falls
    Given a repertoire of 12 dishes
    And a week planned for 2026-09-14
    And I skipped the cena on 4 days of that week
    When I ask how the week of 2026-09-14 went
    Then it says the cena is where the plan falls, 4 days

  Scenario: A week I never planned has nothing to measure
    When I ask how the week of 2026-10-12 went
    Then there is no plan

  # Lo que «Lo comí» escribió en el diario se puede borrar del diario, y el plan
  # tiene que enterarse: si no queda nada de ese plato en esa comida, la comida
  # vuelve a no tener respuesta. Antes se quedaba «Comido» sin nada detrás
  # (prod, desayuno del 4 oct).
  Scenario: Deleting from the diary what a confirmation wrote undoes it
    Given a repertoire of 12 dishes
    When I generate this week
    And I confirm the comida of today
    And I delete from the diary everything that meal wrote
    Then the plan now says nothing for the comida of today

  # Un plato de dos ingredientes son dos entradas; el plan enlaza una. Borrar
  # ésa —el aceite, por ejemplo— no es deshacer la comida si queda la otra.
  Scenario: Deleting one ingredient of a confirmed dish keeps it confirmed
    Given a repertoire of 12 dishes of two ingredients
    When I generate this week
    And I confirm the comida of today
    And I delete from the diary only the entry the plan points to
    Then the plan still says the comida of today is done
    And the plan points to the ingredient left in the diary

  # Registro sin huecos, fase 1 (12 oct): olvidarse de confirmar no puede dejar
  # la comida sin cerrar para siempre. Se cierra después, con la hora de aquel
  # día, y el diario la apunta en aquel día.
  Scenario: A meal of yesterday is confirmed later, on yesterday
    Given a repertoire of 12 dishes
    When I generate the week that holds yesterday
    And I confirm the cena of yesterday at 21:00 of that day
    Then the diary of yesterday has that meal
    And the plan says that meal is done

  Scenario: A meal that has not come yet is not confirmed
    Given a repertoire of 12 dishes
    When I generate the week that holds tomorrow
    And I try to confirm the comida of tomorrow at 14:00 of that day
    Then it says that has not happened yet

  # Registro sin huecos, fase 2: comer fuera. El modelo dice qué había en el
  # plato y cuánto, en líneas; las cifras salen del catálogo, como al leer un
  # plan. Nada se escribe hasta que la revisas.
  Scenario: Eating out is estimated as lines matched to foods, and nothing is written
    Given the foods "Lentejas" and "Aceite de oliva"
    And the model reads "menú del día de lentejas" as "250 g lentejas" and "15 g aceite de oliva"
    When I estimate "menú del día de lentejas" with oil or sauce
    Then the estimate has the line "250 g lentejas" matched to "Lentejas"
    And the model was told there was oil or sauce
    And the diary of today is empty

  Scenario: Saying I ate out writes the lines as estimated on that meal
    Given a repertoire of 12 dishes
    And the foods "Lentejas" and "Aceite de oliva"
    When I generate this week
    And I say I ate out the comida of today: 250 g of "Lentejas" and 15 g of "Aceite de oliva"
    Then the diary of today has 2 estimated entries in the comida
    And the plan says that meal is out

  Scenario: Saying I don't know writes nothing and says the meal
    Given a repertoire of 12 dishes
    When I generate this week
    And I say I don't know about the comida of today
    Then the diary of today is empty
    And the plan says that meal is unknown

  Scenario: Without a model there is no estimate
    Given no model to estimate meals
    When I try to estimate "menú del día"
    Then it says estimating is not available

  # Registro sin huecos, fase 3: tus sitios. La primera vez se le pone nombre al
  # sitio y se guarda como un plato tuyo `fuera`; la segunda se apunta de un
  # toque con su cifra. No es un plato de casa: ni sale en tus platos ni lo
  # pone el generador en una semana.
  Scenario: Naming where I ate out keeps it as one of my places
    Given a repertoire of 12 dishes
    And the foods "Lentejas" and "Aceite de oliva"
    When I generate this week
    And I say I ate out the comida of today at "Bar Paco": 250 g of "Lentejas" and 15 g of "Aceite de oliva"
    Then the diary of today has 2 estimated entries in the comida
    And my places are "Bar Paco"
    And my dishes do not include "Bar Paco"

  Scenario: A known place is said in one go, with its figures
    Given a repertoire of 12 dishes
    And the foods "Lentejas" and "Aceite de oliva"
    When I generate this week
    And I say I ate out the comida of today at "Bar Paco": 250 g of "Lentejas" and 15 g of "Aceite de oliva"
    And I say I ate out the cena of today at my place "Bar Paco"
    Then the cena of today has 2 entries marked "estimated"
    And the plan says that meal is out

  Scenario: The place I ate at last comes first
    Given a repertoire of 12 dishes
    And the foods "Lentejas" and "Aceite de oliva"
    When I generate this week
    And I say I ate out the comida of today at "Bar Paco": 250 g of "Lentejas" and 15 g of "Aceite de oliva"
    And I say I ate out the cena of today at "Táper de mamá": 300 g of "Lentejas" and 10 g of "Aceite de oliva"
    Then my places are "Táper de mamá" and "Bar Paco"

  Scenario: Correcting a place makes what I log there next mine, and leaves the old entries alone
    Given a repertoire of 12 dishes
    And the foods "Lentejas" and "Aceite de oliva"
    When I generate this week
    And I say I ate out the comida of today at "Bar Paco": 250 g of "Lentejas" and 15 g of "Aceite de oliva"
    And I correct my place "Bar Paco" to 300 g of "Lentejas"
    And I say I ate out the cena of today at my place "Bar Paco"
    Then the cena of today has 1 entries marked "dish"
    And the comida of today has 2 entries marked "estimated"

  Scenario: A generated week never puts one of my places in it
    Given a repertoire of 12 dishes
    And the foods "Lentejas" and "Aceite de oliva"
    When I generate this week
    And I say I ate out the comida of today at "Bar Paco": 250 g of "Lentejas" and 15 g of "Aceite de oliva"
    And I generate the week of 2026-09-21
    Then no meal of that week is "Bar Paco"

  # Registro sin huecos, fase 4: comer fuera dentro del plan. Poner uno de tus
  # sitios en una comida que no ha pasado reserva su cifra, y lo que queda del
  # día sin decir se reajusta para que el día siga dando su objetivo.
  # Reparto por toma: cuadrar sólo el día dejaba que el desayuno se llevara lo
  # que hiciera falta. Cada comida tiene su parte (24/31/16/29 % de las kcal).
  Scenario: Each meal lands on its own part of the day
    Given my targets add up to 2000 kcal a day
    And a repertoire of 12 dishes I can scale
    When I generate this week
    Then the desayuno of today is 24% of the day, give or take 2 points
    And the comida of today is 31% of the day, give or take 2 points
    And the snack of today is 16% of the day, give or take 2 points
    And the cena of today is 29% of the day, give or take 2 points
    And every meal of today says its protein, carbs and fat

  # El hidrato sigue al entreno: mismas kcal cada día, la comida de después
  # gana hasta 50 g y los ceden la merienda y la cena que aún no han pasado.
  Scenario: Training in the afternoon moves carbs to the snack
    Given my macro targets are 202 g of protein, 71 g of fat and 280 g of carbs
    And a repertoire of 12 dishes of chicken and rice I can scale
    When I generate this week
    And I log a set today at 17:30
    Then the snack of today gains 50 g of carbs
    And the cena of today gives 50 g of carbs
    And the plan of today adds up to the same kcal as before, give or take 1%

  Scenario: Training late at night moves nothing
    Given my macro targets are 202 g of protein, 71 g of fat and 280 g of carbs
    And a repertoire of 12 dishes of chicken and rice I can scale
    When I generate this week
    And I log a set today at 21:30
    Then no meal of today moves its carbs

  Scenario: The carbs move once a day, at the first set
    Given my macro targets are 202 g of protein, 71 g of fat and 280 g of carbs
    And a repertoire of 12 dishes of chicken and rice I can scale
    When I generate this week
    And I log a set today at 07:00
    And I log a set today at 13:00
    Then the desayuno of today gains 50 g of carbs
    And the comida of today does not move its carbs

  Scenario: A meal already said does not give its carbs
    Given my macro targets are 202 g of protein, 71 g of fat and 280 g of carbs
    And a repertoire of 12 dishes of chicken and rice I can scale
    When I generate this week
    And I confirm the cena of today
    And I log a set today at 13:00
    Then the cena of today does not move its carbs
    And the comida of today gains what the snack of today gives

  Scenario: A meal out planned ahead is reserved and the rest of the day makes room
    Given my targets add up to 2000 kcal a day
    And a repertoire of 12 dishes I can scale
    And the foods "Lentejas" and "Aceite de oliva"
    When I generate this week
    And I say I ate out the desayuno of today at "Bar Paco": 250 g of "Lentejas" and 15 g of "Aceite de oliva"
    And I plan the cena of today at my place "Bar Paco"
    Then the cena of today is planned as "Bar Paco" with 795 kcal
    And the plan says the cena of today is one of my places
    And the plan of today adds up to 2000 kcal, give or take 2%
    And the shopping list of this week does not have "Lentejas"

  # Registro sin huecos, fase 5: pesar una vez, al cocinar. La olla se pesa al
  # sacarla del fuego y cada comida es una fracción de ella: lo que se congela
  # es esa fracción de la receta entera, sin volver a sacar la báscula.
  Scenario: Weighing the pot keeps it as the dish's batch for the week
    Given a repertoire of 12 dishes
    When I weigh the pot of "Plato 1" at 2400 g
    Then "Plato 1" has a pot of 2400 g

  Scenario: A pot cooked more than a week ago is no longer the batch
    Given a repertoire of 12 dishes
    When I weigh the pot of "Plato 1" at 2400 g 8 days ago
    Then "Plato 1" has no pot

  Scenario: Eating a quarter of the pot logs a quarter of the recipe
    Given a repertoire of 12 dishes
    When I generate this week
    And I weigh the pot of the comida of today at 600 g
    And I confirm the comida of today as 0.25 of the pot
    Then the diary of today has 37.5 g of "Pollo"

  Scenario: A share of the pot is more than nothing and at most all of it
    Given a repertoire of 12 dishes
    When I generate this week
    And I weigh the pot of the comida of today at 600 g
    And I try to confirm the comida of today as 1.5 of the pot
    Then it is refused as invalid

  # Una sola fuente (reorganización Comida/Plan, 17 oct). En prod el diario se
  # llenaba con «Añadir» y el plan seguía sin decir nada: la tira de la semana
  # salía «0/4» todos los días aunque el 14 oct hubiera doce entradas. Apuntar
  # algo en una comida del plan que no tenía respuesta **es** responderla: no
  # fue el plato del plan —para eso está «Lo comí», un toque—, así que es
  # «Lo cambié».
  Scenario: Logging by hand in a planned meal says it was swapped
    Given a repertoire of 12 dishes
    When I generate this week
    And I log a food by hand in the comida of today
    Then the plan now says the comida of today is swapped
    And the plan points to what I logged by hand

  Scenario: Logging by voice in a planned meal says it was swapped
    Given a repertoire of 12 dishes
    When I generate this week
    And I log by voice in the cena of today
    Then the plan now says the cena of today is swapped

  # Lo que ya tenía respuesta la conserva: añadir el postre a una comida
  # confirmada no la convierte en cambiada.
  Scenario: Logging more in a meal already said does not change the answer
    Given a repertoire of 12 dishes
    When I generate this week
    And I confirm the comida of today
    And I log a food by hand in the comida of today
    Then the plan still says the comida of today is done

  # Sin comida («Sin asignar») no hay a qué fila del plan responder.
  Scenario: Logging without a meal says nothing to the plan
    Given a repertoire of 12 dishes
    When I generate this week
    And I log a food by hand without a meal
    Then the comida of today says nothing yet

  Scenario: Deleting what I logged by hand gives the meal back its silence
    Given a repertoire of 12 dishes
    When I generate this week
    And I log a food by hand in the comida of today
    And I delete from the diary what I logged by hand
    Then the plan now says nothing for the comida of today

  Scenario: Deleting one of two foods logged by hand keeps the meal said
    Given a repertoire of 12 dishes
    When I generate this week
    And I log a food by hand in the comida of today
    And I log another food by hand in the comida of today
    And I delete from the diary what I logged by hand
    Then the plan now says the comida of today is swapped
    And the plan points to the other food I logged
