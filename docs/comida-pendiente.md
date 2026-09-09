# Comida: lo que el rediseño dejó fuera, y qué haría falta

El rediseño de la pantalla Comida (#137, #138) montó las seis piezas de la
especificación menos tres, que no se quedaron fuera por tiempo sino porque **no
tienen dónde apoyarse**: no hay tabla, ni endpoint, ni una definición de qué
significan. Construirlas es una feature cada una, no un detalle de interfaz.

Esto es lo que haría falta, para que el día que se retomen no haya que
redescubrirlo.

## Comida guardada (el modal de recetas)

La especificación pide una hoja con nombre, lista de ingredientes, raciones y los
macros **por ración** — que es el número que se acaba registrando.

Falta todo el modelo:

- Una tabla de comidas guardadas con `user_id`, nombre y número de raciones.
- Una tabla de ingredientes: comida, alimento, gramos.
- Los macros por ración, calculados en `nutrition.py` desde los ingredientes.
- Decidir qué pasa al **registrar** una: ¿se congela una entrada por ingrediente,
  o una sola con la suma? La regla del congelado (`log_entries` congela) empuja a
  lo segundo, pero entonces corregir un ingrediente no puede rehacer nada.
- Decidir qué pasa al **corregir** una receta con días ya registrados. Es la
  misma pregunta que resolvió `POST /food-log/recompute` para un alimento, y la
  respuesta no tiene por qué ser la misma.

En la pantalla Añadir hay un hueco esperándola: `origen()` en `Comida.jsx`
devuelve `tuyo` o `base pública`, y la especificación tiene un tercer valor
—`tu comida`— que no se nombra porque todavía no puede ser cierto.

## La racha de días cumpliendo la proteína

«**5** días seguidos cumpliendo la proteína», al pie del resumen.

Falta un endpoint que cuente hacia atrás desde el día que se está mirando
comparando `totals.protein` con `objetivo_proteina`. Dos decisiones antes de
escribirlo:

- **Un día sin nada registrado, ¿rompe la racha o no cuenta?** No es lo mismo un
  día de ayuno que un día que se te olvidó apuntar, y el diario no los distingue.
- **El objetivo es del perfil, no del día**, así que cambiarlo hoy reescribiría
  la racha de todo el pasado. O se congela el objetivo por día, o la racha se
  calcula contra el objetivo de hoy y se dice.

Mientras tanto hay precedente en `stats.js`, que ya calcula rachas de entreno.

## «Cerrar el día»

El botón que la especificación pone al pie del resumen. No existe la idea: un día
alimentario no se abre ni se cierra, se deriva de `log_date` y sigue admitiendo
entradas mientras el reloj no pase de las 04:00.

Antes de construirlo hay que decidir **qué haría**: ¿marcar el día como
terminado y dejar de admitir entradas? ¿Sólo dejar de avisar? ¿Guardar una foto
de los totales para que corregir un alimento no reescriba el pasado? La tercera
es la única que añade algo que hoy no se puede hacer, y es también la más cara.

## Piezas menores que quedaron fuera

- **El contador `4 hoy`** de la cuota de fotos. Necesita contar lecturas por día,
  y ese número sería un invento nuestro: la cuota real es de Google y se comparte
  entre todos los usuarios. Lo que sí funciona es el camino reactivo — al llegar
  el 429 del día la cámara se retira.
- **El tipo de día (entreno / descanso)** en los objetivos. Necesita dos juegos
  de objetivos y una regla para decidir qué día es de entreno: ¿lo dice la tabla
  `days`, o se marca a mano? Es una decisión de producto.
- **El aviso «2 alimentos sin revisar».** La app no tiene el concepto de «sin
  revisar»; lo que sí tiene es `unknown`, que cuenta entradas a las que les falta
  un nutriente, y eso ya se dice con su chip.
- **El asa y el radio de 18px de las hojas.** El asa está, pero sólo en las hojas
  de Comida: `.sheet` la comparten las de Entreno y cambiarla las tocaría todas.
  El radio se quedó en los 8px del sistema.
