/* El lockup de marca: isotipo "celda" + el nombre, según brand/README.md.
   Estaba copiado en App, Login y Register; vive aquí una sola vez.

   El isotipo va en línea y no como <img>: sus 16 cuadrados tienen que cambiar
   de tinta con el tema, y un PNG no puede. La tinta es `currentColor` (hereda
   el color del <h1>, que ya es --text en claro y en oscuro) y la celda de
   arriba a la derecha —la única al 100 %, la que marca hacia dónde crece— es
   --accent, el mismo amarillo del sistema. Por eso el kit y la app comparten
   valores: #2d2c2b/#ffce00 en claro, #f9f4f2/#ffce00 en oscuro. */

/* Va la retícula 3×3, no la 4×4 del isotipo grande: el kit pone el suelo de la
   4×4 en 24 px y aquí el isotipo mide 20. A ese tamaño sus cuadrados más
   pequeños caen por debajo de 1,5 px y la marca se vuelve una mancha de puntos.
   Geometría de brand/fitit-icono-app.svg (la misma que el icono de la app),
   sin el cuadro de fondo. x, y, lado sobre una retícula de 676 u. */
const CELDAS = [
  [32.67, 32.67, 130.67], [256.33, 16.33, 163.33],
  [49, 289, 98], [272.67, 272.67, 130.67], [496.33, 256.33, 163.33],
  [65.33, 545.33, 65.33], [289, 529, 98], [512.67, 512.67, 130.67],
]

export default function Wordmark() {
  return (
    <h1 className="wordmark">
      <svg
        className="wordmark-icon"
        viewBox="0 0 676 676"
        aria-hidden="true"
        focusable="false"
      >
        {CELDAS.map(([x, y, lado]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={lado} height={lado} fill="currentColor" />
        ))}
        {/* La celda ámbar: arriba a la derecha, la única que llena su casilla. */}
        <rect x="480" y="0" width="196" height="196" fill="var(--accent)" />
      </svg>
      <span className="wordmark-text">fitit</span>
    </h1>
  )
}
