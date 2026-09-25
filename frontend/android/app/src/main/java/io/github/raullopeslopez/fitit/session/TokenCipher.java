package io.github.raullopeslopez.fitit.session;

import java.security.GeneralSecurityException;

/**
 * Cifra el token de sesión antes de que toque el disco.
 *
 * <p>Una interfaz y no directamente el Keystore porque el Keystore de Android no
 * existe en la JVM de los tests: {@link KeystoreTokenCipher} es la de verdad, y
 * los tests de {@link SessionStore} usan una falsa.
 */
public interface TokenCipher {
    byte[] encrypt(byte[] plain) throws GeneralSecurityException;

    byte[] decrypt(byte[] sealed) throws GeneralSecurityException;
}
