package io.github.raullopeslopez.fitit.session;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * AES/GCM con una clave propia del Android Keystore, creada la primera vez.
 *
 * <p>La clave no sale nunca del Keystore; en disco sólo queda el token cifrado,
 * con su IV delante. No usa {@code EncryptedSharedPreferences}: está deprecado y
 * esto es lo mismo sin librería. Si la clave se pierde (restaurar el teléfono),
 * descifrar falla y {@link SessionStore} tira el token: la app se lo vuelve a
 * copiar al abrirse. Spec: docs/widgets-entreno.md, «Decidido después de la
 * revisión».
 */
public final class KeystoreTokenCipher implements TokenCipher {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS = "fitit_session_token";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    @Override
    public byte[] encrypt(byte[] plain) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = cipher.getIV();
        byte[] body = cipher.doFinal(plain);
        return ByteBuffer.allocate(iv.length + body.length).put(iv).put(body).array();
    }

    @Override
    public byte[] decrypt(byte[] sealed) throws GeneralSecurityException {
        if (sealed.length <= IV_BYTES) throw new GeneralSecurityException("too short");
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(
                Cipher.DECRYPT_MODE,
                key(),
                new GCMParameterSpec(TAG_BITS, sealed, 0, IV_BYTES));
        return cipher.doFinal(sealed, IV_BYTES, sealed.length - IV_BYTES);
    }

    private static SecretKey key() throws GeneralSecurityException {
        KeyStore store = KeyStore.getInstance(KEYSTORE);
        try {
            store.load(null);
        } catch (IOException e) {
            throw new GeneralSecurityException(e);
        }
        KeyStore.Entry entry = store.getEntry(ALIAS, null);
        if (entry instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        }
        KeyGenerator generator =
                KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
                        ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }
}
