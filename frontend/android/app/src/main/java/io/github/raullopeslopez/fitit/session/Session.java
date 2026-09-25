package io.github.raullopeslopez.fitit.session;

import android.content.Context;

/**
 * Las piezas compartidas del control del entreno: una sola {@link SessionStore}
 * para todo el proceso (la app, el trabajo de envío y, más adelante, la
 * notificación y el widget), y la red de verdad.
 */
public final class Session {
    private static SessionStore store;
    private static QueueDrainer.Http http;
    private static SessionStore testStore;
    private static QueueDrainer.Http testHttp;

    private Session() {}

    public static synchronized SessionStore store(Context context) {
        if (testStore != null) return testStore;
        if (store == null) {
            store = new SessionStore(context.getApplicationContext(), new KeystoreTokenCipher());
        }
        return store;
    }

    static synchronized QueueDrainer.Http http() {
        if (testHttp != null) return testHttp;
        if (http == null) http = new UrlConnectionHttp();
        return http;
    }

    /** Sólo para tests: sustituye la cola y la red. {@code null} vuelve a las de verdad. */
    static synchronized void useForTests(SessionStore store, QueueDrainer.Http http) {
        testStore = store;
        testHttp = http;
    }
}
