package io.github.raullopeslopez.fitit.session;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Avisa de que un envío terminó. El que escucha es {@link SessionPlugin}, y sólo
 * mientras la app está abierta: con la app cerrada no hay nadie, y no hace falta,
 * porque todo lo que importa ya está en {@link SessionStore}.
 */
public final class SessionEvents {
    public interface Listener {
        void onSent(QueueDrainer.Outcome outcome);
    }

    private static final List<Listener> LISTENERS = new CopyOnWriteArrayList<>();

    private SessionEvents() {}

    public static void add(Listener listener) {
        LISTENERS.add(listener);
    }

    public static void remove(Listener listener) {
        LISTENERS.remove(listener);
    }

    static void publish(QueueDrainer.Outcome outcome) {
        for (Listener listener : LISTENERS) listener.onSent(outcome);
    }
}
