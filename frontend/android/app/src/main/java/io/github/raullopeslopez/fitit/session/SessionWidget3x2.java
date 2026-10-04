package io.github.raullopeslopez.fitit.session;

/**
 * El widget 3×2: el mismo widget que el 4×2, más estrecho (≈253 dp en el Xiaomi;
 * DESIGN.md, «Tamaños»), así que se pinta compacto. Mismo pintor: sólo es otra
 * entrada en el selector de widgets, para quien no quiere dar cuatro columnas.
 * Lo repinta {@link SessionWidget#updateAll} con los demás.
 */
public class SessionWidget3x2 extends SessionWidget4x2 {
    /** Sin tamaño del launcher, el de un 3×2: estrecho. */
    @Override
    Fit fallback() {
        return Fit.NARROW;
    }
}
