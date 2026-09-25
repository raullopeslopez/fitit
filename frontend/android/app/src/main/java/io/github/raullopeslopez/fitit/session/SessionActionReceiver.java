package io.github.raullopeslopez.fitit.session;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Recibe los toques de la notificación y las alarmas del control. No abre la app:
 * por eso «+1 serie» y «Saltar» funcionan con el teléfono bloqueado.
 */
public final class SessionActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        SessionController.handle(context, intent, System.currentTimeMillis());
    }
}
