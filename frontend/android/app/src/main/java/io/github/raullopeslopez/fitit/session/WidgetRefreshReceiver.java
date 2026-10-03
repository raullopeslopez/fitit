package io.github.raullopeslopez.fitit.session;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Repinta los widgets cuando nadie más lo haría: al instalar una APK nueva y al
 * encender el teléfono. Sin esto se quedaban vacíos hasta abrir Fitit, aunque lo
 * que enseñan (pasos, comida, último entreno) ya estaba guardado en
 * {@link SessionStore}: el widget no pide nada a la red, sólo pinta lo que hay.
 *
 * <p>Repintar vuelve a armar además la alarma del cambio de día
 * ({@link SessionAlarms#armDay}), que Android borra al reiniciar.
 */
public class WidgetRefreshReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            SessionWidget.updateAll(context);
        }
    }
}
