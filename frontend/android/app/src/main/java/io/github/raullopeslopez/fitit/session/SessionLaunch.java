package io.github.raullopeslopez.fitit.session;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import io.github.raullopeslopez.fitit.MainActivity;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Abrir la app con una orden: «abre este entreno» (tocar el ejercicio en el widget
 * o el cuerpo de la notificación), «empieza el de hoy» (Empezar entreno) o «añade
 * un ejercicio a este entreno» («Nuevo…» del 4×2).
 *
 * <p>La orden viaja en extras del intent; {@link SessionPlugin} la lee una sola vez
 * y se la pasa a la página, que es quien sabe abrir un entreno o empezar el de
 * hoy (la regla de «continuar el de hoy» vive en Días y no se duplica aquí).
 */
public final class SessionLaunch {
    public static final String EXTRA_ACTION = "fitit_launch";
    public static final String EXTRA_WORKOUT = "fitit_workout";
    public static final String OPEN = "open";
    public static final String START = "start";
    /** «Nuevo…» del 4×2 (fase 5): abre ese entreno con el campo de añadir ejercicio. */
    public static final String ADD = "add";

    private SessionLaunch() {}

    static Intent intent(Context context, String action, int workoutId) {
        Intent intent = new Intent(context, MainActivity.class)
                .putExtra(EXTRA_ACTION, action)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_CLEAR_TOP
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (workoutId >= 0) intent.putExtra(EXTRA_WORKOUT, workoutId);
        return intent;
    }

    static PendingIntent open(Context context, int workoutId) {
        return PendingIntent.getActivity(context, 30, intent(context, OPEN, workoutId),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent add(Context context, int workoutId) {
        return PendingIntent.getActivity(context, 32, intent(context, ADD, workoutId),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent start(Context context) {
        return PendingIntent.getActivity(context, 31, intent(context, START, -1),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * La orden del intent, una sola vez: se quita al leerla, para que recrear la
     * actividad (girar el teléfono) no vuelva a abrir el entreno. Null si no hay.
     */
    public static JSONObject take(Intent intent) {
        if (intent == null) return null;
        String action = intent.getStringExtra(EXTRA_ACTION);
        if (action == null) return null;
        int workoutId = intent.getIntExtra(EXTRA_WORKOUT, -1);
        intent.removeExtra(EXTRA_ACTION);
        intent.removeExtra(EXTRA_WORKOUT);
        try {
            JSONObject order = new JSONObject().put("action", action);
            if (workoutId >= 0) order.put("workoutId", workoutId);
            return order;
        } catch (JSONException e) {
            return null;
        }
    }
}
