# TODOS

## Plan (comida)

- **Mover un plato a otro día.** En la hoja del plato, «Pasar a…» con los días, que se
  intercambia con lo que había. Hoy se hace con dos cambios a mano (2 hojas, unos 4 toques).
  Hace falta un endpoint nuevo y decidir qué pasa con una olla repartida en varios días.
  Aplazado el 2026-10-13 (revisión del rediseño de Plan) porque no sabemos con qué
  frecuencia se usa. Retomar si se echa de menos más de una vez al mes.
- **Aplicar una pauta nueva a los días que quedan.** Hoy, si la semana ya tiene comidas
  confirmadas, la pauta nueva entra desde la que viene. `POST /plans` rehace siempre la
  semana entera; haría falta generar desde una fecha sin tocar lo confirmado. Aplazado el
  2026-10-13: las pautas cambian cada pocas semanas y el aviso ya dice desde cuándo se
  aplica.
