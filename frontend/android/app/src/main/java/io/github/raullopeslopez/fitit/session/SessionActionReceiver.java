package io.github.raullopeslopez.fitit.session;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Recibe los toques de la notificación y las alarmas del control. No abre la app:
 * por eso «+1 serie» y «Saltar» funcionan con el teléfono bloqueado.
 *
 * <p>Un −/+ se pinta un rato después (SessionController.ADJUST_SETTLE_MS): el
 * receptor queda abierto ({@code goAsync}) hasta entonces, para que Android no
 * mate el proceso con el repintado aún pendiente.
 */
public final class SessionActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        PendingResult result = goAsync();
        SessionController.handle(context, intent, System.currentTimeMillis(), result::finish);
    }
}
