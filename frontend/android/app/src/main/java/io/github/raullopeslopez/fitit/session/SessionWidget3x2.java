package io.github.raullopeslopez.fitit.session;

/**
 * El widget 3×2: el mismo diseño y los mismos estados que el 4×2, más estrecho
 * (≈270 dp; DESIGN.md, «Tamaños»). Mismo layout y mismo pintor: sólo es otra
 * entrada en el selector de widgets, para quien no quiere dar cuatro columnas.
 * Lo repinta {@link SessionWidget#updateAll} con los demás.
 */
public class SessionWidget3x2 extends SessionWidget4x2 {}
