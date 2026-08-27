// Arranque de la suite de navegador. Dos líneas y las dos son necesarias:
//
// - los emparejadores de siempre, para que una prueba de aquí se lea igual que
//   una de jsdom;
// - **la hoja de estilos de verdad**, que es la mitad de lo que estas pruebas
//   miden. Sin ella el navegador dibujaría el mismo mundo sin maquetar que
//   jsdom finge, sólo que más despacio: nada sería `fixed`, nada mediría 44 px
//   y ningún color saldría de un token.
import '@testing-library/jest-dom'
import '../styles.css'
