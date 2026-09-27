# Fitit — logo (dirección 5D, "la celda")

## La regla
Retícula 4×4. Cada celda mide 16 u con 4 u de aire (total 76 u). El lado del
cuadrado interior es `celda × (i + 2) / 8`, donde `i = (3 − fila) + columna`
contando la fila 0 arriba. Resultado: 4, 6, 8, 10, 12, 14, 16 u. La celda de
arriba a la derecha llega al 100 % y es la única en amarillo.
El crecimiento fluye siempre hacia la esquina superior derecha.

## Archivos
| Archivo | Uso |
|---|---|
| fitit-isotipo.svg | isotipo, tinta + amarillo, fondos claros |
| fitit-isotipo-oscuro.svg | isotipo para fondos oscuros |
| fitit-isotipo-mono.svg | una sola tinta (`currentColor`): bordado, grabado, sello |
| fitit-logo-horizontal.svg | lockup principal |
| fitit-logo-horizontal-oscuro.svg | lockup en negativo |
| fitit-logo-vertical.svg | lockup apilado, formatos cuadrados |
| fitit-icono-app.svg | icono de app 1024×1024, retícula 3×3 |
| fitit-favicon.svg | 2×2 para 16–32 px |
| *.png | los mismos lockups rasterizados a 4× (sin dependencia de la fuente) |

Los SVG de lockup llevan el nombre como texto en Figtree 700 (tracking
−0.055 em). Si el destino no tiene la fuente, usa los PNG o convierte el texto
a curvas antes de enviarlo a imprenta.

## Color
Claro: tinta `#2d2c2b` · amarillo `#ffce00` · fondo `#f9f4f2`
Oscuro: tinta `#f9f4f2` · amarillo `#ffce00` · fondo `#1a1918`
Nunca degradados, ni sombras, ni una segunda tinta.
La celda amarilla sobre claro da 1,37: la marca se sostiene por los quince cuadrados en
tinta. El icono de app va en carbón por eso (la celda da 9,35 ahí).

## Aire y tamaños mínimos
Aire mínimo alrededor = una celda (16 u = 21 % del isotipo).
Isotipo 4×4: hasta 24 px. Por debajo, retícula 3×3; a 16 px, el favicon 2×2.
Lockup horizontal: no bajar de 96 px de ancho.
