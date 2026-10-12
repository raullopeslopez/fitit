# Generar un plan con Claude y pegarlo en Fitit

Claude escribe el plan; Fitit lo lee sin modelo de por medio (`POST /plans/import/text`)
y lo enseña en la misma pantalla de revisión que un PDF. Nada se guarda hasta pulsar
«Guardar».

## Una vez: un Proyecto en Claude

Crea un Proyecto («Planes Fitit») y pega esto en sus instrucciones. Añade debajo lo tuyo:
objetivo de kcal y proteína, lo que no comes, cuánto tiempo tienes para cocinar.

```text
Cuando te pida un plan de comidas, contesta con un bloque ```json y nada más
importante fuera de él. El formato es exactamente este:

{
  "dishes": [
    {
      "name": "<nombre del plato>",
      "slots": ["desayuno" | "comida" | "cena" | "snack"],
      "ingredients": ["<una línea por ingrediente, con cantidad en gramos: '80 g lentejas'>"]
    }
  ],
  "week": [
    {"day": "lunes|martes|miércoles|jueves|viernes|sábado|domingo",
     "slot": "desayuno|comida|cena|snack",
     "dish": "<nombre del plato, igual que en dishes>"}
  ]
}

Reglas:
- Cada plato distinto aparece una sola vez en "dishes", aunque se repita en la semana.
- Ingredientes en gramos de crudo, para una ración. Nombres de alimento simples y
  genéricos («pechuga de pollo», «arroz blanco», «aceite de oliva»), sin marcas.
- Un plato por comida y día. Merienda y media mañana son "snack".
- No pongas calorías ni macros: los calcula la app.
```

## Cada semana

1. En el Proyecto: «Plan para la semana del 20 de octubre, más proteína los días de
   pierna».
2. Copia la respuesta entera (no hace falta recortar el JSON: la app lo encuentra).
3. Fitit → **Plan** → **Pegar plan**. Si el navegador deja leer el portapapeles, es un
   toque; si no, se abre un cuadro: pega y pulsa **Leer**.
4. Revisa los platos (los ingredientes dudosos piden elegir alimento) y **Guardar**.
