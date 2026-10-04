package io.github.raullopeslopez.fitit.session;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import io.github.raullopeslopez.fitit.R;
import org.json.JSONObject;

/**
 * La notificación en curso: pantalla de bloqueo y bandeja. Diseño propio dentro
 * del marco de Android (DESIGN.md, «La notificación del entreno»; N4 en la vista
 * previa v17):
 *
 * <pre>
 * Fitit · Entreno                                  (lo pone Android)
 * Press banca                              01:23 (❚❚)     cerrada
 * 32,5 kg × 12 · 4 series
 *
 * Press banca · 4 series                                  desplegada
 * 01:23                                          (❚❚)
 * [ −  32,5 kg  + ] [ −  × 12  + ] [ +1 ]
 * </pre>
 *
 * <p>Sin botones del sistema: el bloque de ajuste ocupa su sitio, y con ellos se
 * fue escribir desde fuera de la app (Android sólo deja campos de texto en sus
 * botones). Renuncia consciente: con diseño propio no puede ser «Live Update», así
 * que no sube a la isla de HyperOS ni al chip de la barra de estado.
 *
 * <p>El tiempo son los cronómetros del propio layout, como en el widget: nadie lo
 * reescribe cada segundo. Baja en color de texto y, pasado el descanso, sube en
 * accent-ink con signo; el cambio lo hace la alarma de fin de descanso. Canal
 * silencioso: ni suena ni vibra, salvo una vez: al acabar el descanso la misma
 * tarjeta se repinta en {@link #CHANNEL_COUNTDOWN}, que vibra, y la siguiente
 * actualización la devuelve al canal mudo.
 */
final class SessionNotification {
    static final String CHANNEL = "fitit_entreno";
    /**
     * La cuenta atrás del fin del descanso (0.15.0): tres segundos antes del cero
     * la misma tarjeta se publica aquí, y el canal cuenta con toques cortos
     * (0.18.0): tres en el 3, dos en el 2, uno en el 1 y uno largo que acaba en el
     * cero. Los toques largos de la 0.16.0 (pi, pii, piiii) no llegaban enteros en
     * el Xiaomi; contar con toques cortos dice cuánto queda sin depender de ellos.
     * Sin sonido. Es la vibración de una notificación, la única que llega
     * con el Xiaomi bloqueado (0.10.6); y apagar este canal en Ajustes calla la
     * cuenta sin tocar la tarjeta. Canal nuevo porque Android no deja cambiar el
     * patrón de uno ya creado.
     */
    static final String CHANNEL_COUNTDOWN = "fitit_entreno_toques";
    // Toques de 80 ms con 120 entre ellos, cada grupo al empezar su segundo, y el
    // largo de 500 que acaba en el cero. Suma 3 s, y la alarma salta eso antes del
    // final (COUNTDOWN_MS).
    static final long[] COUNTDOWN_PATTERN = {
        0, 80, 120, 80, 120, 80,   // 3: pi pi pi
        520, 80, 120, 80,          // 2: pi pi
        720, 80,                   // 1: pi
        420, 500};                 // 0: piiiii
    static final int ID = 4102;
    // Canales que ya no se usan y que Android conserva en Ajustes aunque el código
    // se haya ido: los del aviso de descanso que retiró la fase 0, y el de la
    // 0.6.0, de importancia baja (Android no deja subírsela a un canal que ya
    // existe, así que se sustituye), y el aviso con sonido de fin de descanso de
    // la 0.10.6, que pasó a ser sólo vibración, y el de dos pulsos al llegar a
    // cero (0.10.8), que pasó a ser la cuenta atrás, la cuenta de pulsos
    // iguales (0.15.0), que pasó a crecer, y la que crecía (0.16.0), que pasó a
    // contar con toques cortos.
    private static final String[] RETIRED = {
        "fitit-sesion", "fitit-fin-descanso", "fitit_session", "fitit_fin_descanso",
        "fitit_entreno_fin", "fitit_entreno_cuenta", "fitit_entreno_crece"};

    private SessionNotification() {}

    static void show(Context context, JSONObject control, long now) {
        show(context, control, now, false);
    }

    /** Con {@code buzz}, la tarjeta vibra esta vez: la cuenta atrás del fin del descanso. */
    static void show(Context context, JSONObject control, long now, boolean buzz) {
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        ensureChannel(context);
        // Sin permiso (Android 13+) no hay tarjeta; el control sigue guardado.
        if (!manager.areNotificationsEnabled()) return;
        try {
            manager.notify(ID, build(context, control, now, buzz));
        } catch (SecurityException e) {
            // Permiso retirado entre la comprobación y el aviso: igual que sin él.
        }
    }

    static void cancel(Context context) {
        NotificationManagerCompat.from(context).cancel(ID);
    }

    private static void ensureChannel(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        for (String retired : RETIRED) manager.deleteNotificationChannel(retired);
        // Importancia normal, no baja. Android trata la baja como «silenciosa», y
        // muchos teléfonos —Xiaomi el primero— no enseñan las silenciosas en la
        // pantalla de bloqueo, que es donde tiene que estar. Sin sonido ni
        // vibración en el canal, y `setSilent` en cada aviso: sigue sin sonar.
        NotificationChannel channel = new NotificationChannel(
                CHANNEL, "Entreno en curso", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("La serie que toca y el descanso, con peso y reps para ajustar y registrar sin abrir la app.");
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);

        // Misma importancia (misma visibilidad en el bloqueo), con vibración.
        NotificationChannel restOver = new NotificationChannel(
                CHANNEL_COUNTDOWN, "Fin del descanso", NotificationManager.IMPORTANCE_DEFAULT);
        restOver.setDescription("Al acabar el descanso, la tarjeta del entreno vibra tres toques, dos, uno y uno largo en el cero. Sin sonido.");
        restOver.setSound(null, null);
        restOver.enableVibration(true);
        restOver.setVibrationPattern(COUNTDOWN_PATTERN);
        restOver.setShowBadge(false);
        restOver.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(restOver);
    }

    private static Notification build(Context context, JSONObject control, long now, boolean buzz) {
        return new NotificationCompat.Builder(context, buzz ? CHANNEL_COUNTDOWN : CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_fitit)
                // Título y texto no se pintan (manda el diseño propio), pero los
                // leen el lector de pantalla y quien no sabe pintarlo (un reloj).
                .setContentTitle(SessionControl.title(control))
                .setContentText(SessionControl.line(control))
                .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
                .setCustomContentView(collapsed(context, control, now))
                .setCustomBigContentView(expanded(context, control, now))
                // El tiempo grande es el nuestro: la cabecera no pinta otro.
                .setShowWhen(false)
                .setOngoing(true)
                // Una actualización no avisa (cada serie la repinta), salvo la
                // del fin del descanso, que existe para eso.
                .setSilent(!buzz)
                .setOnlyAlertOnce(!buzz)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                // Sin contentIntent (0.17.0): el cuerpo abría la app, y con el móvil
                // bloqueado un toque a −/+ que caía en él mientras se repintaba
                // pedía el código. Abrir Fitit es tocar la línea del ejercicio.
                .build();
    }

    /** Cerrada: el ejercicio y la serie a la izquierda, el tiempo a la derecha. */
    private static RemoteViews collapsed(Context context, JSONObject control, long now) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.notification_session);
        views.setTextViewText(R.id.widget_exercise, SessionControl.title(control));
        views.setTextViewText(R.id.widget_set, SessionControl.set(control));
        SessionWidget.count(views, control);
        SessionWidget.clock(views, R.id.widget_clock, R.id.widget_over, R.id.widget_paused, control, now);
        SessionWidget4x2.pause(context, views, control, now);
        openFromLine(context, views, control);
        return views;
    }

    /** Lo único que abre la app: la línea del ejercicio. El resto de la tarjeta no. */
    private static void openFromLine(Context context, RemoteViews views, JSONObject control) {
        views.setOnClickPendingIntent(R.id.widget_line,
                SessionLaunch.open(context, control.optInt("workoutId", -1)));
    }

    /** Desplegada: la línea, y el tiempo y la fila de ajuste del 4×2, sin Terminar. */
    private static RemoteViews expanded(Context context, JSONObject control, long now) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.notification_session_big);
        views.setTextViewText(R.id.widget_exercise, SessionControl.title(control));
        SessionWidget.count(views, control);
        SessionWidget.clock(views, R.id.widget_clock, R.id.widget_over, R.id.widget_paused, control, now);
        SessionWidget4x2.block(views, control);
        SessionWidget4x2.pause(context, views, control, now);
        tap(context, views, R.id.widget_weight_down, SessionController.ACTION_WEIGHT_DOWN, 30);
        tap(context, views, R.id.widget_weight_up, SessionController.ACTION_WEIGHT_UP, 31);
        tap(context, views, R.id.widget_reps_down, SessionController.ACTION_REPS_DOWN, 32);
        tap(context, views, R.id.widget_reps_up, SessionController.ACTION_REPS_UP, 33);
        // El +1 de aquí no vibra: sólo el del widget, como se pidió.
        tap(context, views, R.id.widget_log, SessionController.ACTION_REPEAT, 1);
        openFromLine(context, views, control);
        return views;
    }

    static void tap(Context context, RemoteViews views, int id, String action, int code) {
        views.setOnClickPendingIntent(id, broadcast(context, action, code));
    }

    static PendingIntent broadcast(Context context, String action, int code) {
        return broadcast(context, new Intent(context, SessionActionReceiver.class).setAction(action), code);
    }

    static PendingIntent broadcast(Context context, Intent intent, int code) {
        return PendingIntent.getBroadcast(context, code, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
