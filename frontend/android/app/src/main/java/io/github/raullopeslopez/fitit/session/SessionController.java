package io.github.raullopeslopez.fitit.session;

import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Lo que pasa con cada toque de la notificación y los widgets, y cuando Entreno
 * publica o termina el control. Todo pasa por aquí para que la notificación, las
 * alarmas y la app nunca cuenten cosas distintas.
 */
public final class SessionController {
    private static final String PREFIX = "io.github.raullopeslopez.fitit.session.";
    public static final String ACTION_REPEAT = PREFIX + "REPEAT";
    /** El mismo +1, desde el widget: además vibra. */
    public static final String ACTION_WIDGET_REPEAT = PREFIX + "WIDGET_REPEAT";
    /** Los − y + del bloque de ajuste: cambian la serie que se repite, no registran. */
    public static final String ACTION_WEIGHT_DOWN = PREFIX + "WEIGHT_DOWN";
    public static final String ACTION_WEIGHT_UP = PREFIX + "WEIGHT_UP";
    public static final String ACTION_REPS_DOWN = PREFIX + "REPS_DOWN";
    public static final String ACTION_REPS_UP = PREFIX + "REPS_UP";
    /** Pausar o reanudar el descanso, desde el 4×2 y el 3×2. */
    public static final String ACTION_REST_TOGGLE = PREFIX + "REST_TOGGLE";
    /** «Terminar» del widget. */
    public static final String ACTION_END = PREFIX + "END";
    public static final String ACTION_REST_OVER = PREFIX + "REST_OVER";
    /** Tres segundos antes del cero: la tarjeta vibra 3, 2, 1 y el cero. */
    public static final String ACTION_REST_COUNTDOWN = PREFIX + "REST_COUNTDOWN";
    public static final String ACTION_EXPIRE = PREFIX + "EXPIRE";
    /** Una pestaña del widget sin entreno; cuál, en {@link #EXTRA_TAB}. */
    public static final String ACTION_TAB = PREFIX + "TAB";
    /** El nombre de la pestaña ({@link IdleSummary.Page}). */
    public static final String EXTRA_TAB = "tab";
    /** Medianoche: «hace 2 días» pasa a 3 y los pasos de ayer dejan de ser de hoy. */
    public static final String ACTION_DAY = PREFIX + "DAY";
    /** Repintar la barra del descanso del 4×1, cada {@link SessionWidget#BAR_TICK_MS}. */
    public static final String ACTION_BAR_TICK = PREFIX + "BAR_TICK";
    /**
     * La cuenta atrás empieza lo que dura su patrón antes del cero, para que el
     * último pulso, el largo, acabe justo en el cero y no empiece en él (0.16.1).
     * Con los toques de la 0.18.0 son 3 s justos.
     */
    static final long COUNTDOWN_MS = java.util.Arrays.stream(SessionNotification.COUNTDOWN_PATTERN).sum();
    /**
     * Más tarde que esto, la cuenta atrás no vibra: sus pulsos son un patrón
     * fijo del canal, y medio segundo tarde ya no caen con el 3, 2, 1 del reloj.
     */
    static final long COUNTDOWN_LATE_MS = 500;
    /**
     * El repintado a positivo, con la vibración ya acabada en el cero: una
     * actualización muda de la tarjeta corta la vibración que estuviera sonando.
     * Por debajo de un segundo el reloj aún dice 00:00, no −00:01.
     */
    static final long REST_OVER_DELAY_MS = 900;
    /**
     * Toques seguidos en −/+ (0.17.0): el estado cambia en cada uno, pero la
     * notificación y los widgets se repintan una vez, cuando pasa este rato sin
     * otro. Cada repintado rehace la tarjeta, y un toque que caía mientras tanto
     * acababa en el cuerpo; con el móvil bloqueado, eso pedía el código.
     */
    static final long ADJUST_SETTLE_MS = 300;

    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    /** El repintado de ajuste pendiente, si lo hay, y a quién avisar cuando salga. */
    private static Runnable pendingPaint;
    private static final List<Runnable> pendingDone = new ArrayList<>();

    private SessionController() {}

    /** Entreno registró una serie de fuerza: éste es el control desde ahora. */
    public static void publish(Context context, JSONObject control, long now) {
        Session.store(context).saveControl(control);
        refresh(context, control, now);
    }

    /**
     * La app entra (o abre con sesión) y da su token: si los widgets decían
     * «Sesión caducada», vuelven; y la cola que esperaba sale ya.
     */
    public static void renew(Context context, String token, String apiBase, String clientVersion) {
        Session.store(context).setSession(token, apiBase, clientVersion);
        SessionWidget.updateAll(context);
        SessionSender.schedule(context);
        // Cada APK con sesión entrega el token al arrancar: ahí se programa el aviso
        // de la revisión, sin que nadie tenga que hacer nada tras actualizar.
        ReviewScheduler.schedule(context);
    }

    /**
     * Un entreno borrado en la app: sus series sin enviar se tiran y, si era el
     * del control, la notificación y los widgets vuelven a «sin entreno». Borrar
     * otro entreno no toca el que está en curso.
     */
    public static void forget(Context context, int workoutId) {
        if (Session.store(context).forgetWorkout(workoutId)) {
            end(context);
        } else {
            // Las series tiradas dejan de contar como «sin enviar».
            SessionWidget.updateAll(context);
        }
    }

    /** «Terminar»: fuera la notificación y el control. Las series no se tocan. */
    public static void end(Context context) {
        Session.store(context).clearControl();
        SessionNotification.cancel(context);
        SessionAlarms.cancel(context);
        SessionWidget.updateAll(context);
        SessionEvents.changed();
    }

    /**
     * Saltar el descanso en la app: la notificación y los widgets quitan su reloj
     * también. Fuera de la app no hay botón de saltar (DESIGN.md): registrar ya
     * empieza la serie aunque quede descanso.
     */
    public static void skipRest(Context context, long now) {
        SessionStore store = Session.store(context);
        JSONObject control = store.control();
        if (control == null) return;
        try {
            control.put("restEndsAt", 0);
        } catch (JSONException e) {
            return;
        }
        control.remove(SessionControl.PAUSED_KEY);
        store.saveControl(control);
        refresh(context, control, now);
    }

    /**
     * «Reanudar» en la app: el descanso que se pausó desde el widget sigue con lo
     * que le quedaba, y el widget y la notificación vuelven a contar.
     */
    public static void resumeRest(Context context, long now) {
        SessionStore store = Session.store(context);
        JSONObject control = store.control();
        if (control == null) return;
        try {
            restChanged(context, store, SessionControl.resume(control, now), now);
        } catch (JSONException e) {
            // Un control ilegible se queda como estaba.
        }
    }

    public static void handle(Context context, Intent intent, long now) {
        handle(context, intent, now, null);
    }

    /**
     * Con {@code done}, se avisa cuando el toque ha terminado de pintarse: al
     * momento, o tras {@link #ADJUST_SETTLE_MS} si es un −/+. El receptor lo usa
     * para que Android no mate el proceso con un repintado aún pendiente.
     */
    static void handle(Context context, Intent intent, long now, Runnable done) {
        boolean deferred = false;
        try {
            deferred = dispatch(context, intent, now, done);
        } finally {
            if (!deferred && done != null) done.run();
        }
    }

    /** True si el repintado quedó pendiente y {@code done} lo correrá él. */
    private static boolean dispatch(Context context, Intent intent, long now, Runnable done) {
        String action = intent.getAction();
        if (action == null) return false;
        SessionStore store = Session.store(context);
        // Lo del widget sin entreno no tiene control al que preguntar.
        if (ACTION_TAB.equals(action)) {
            store.setIdleTab(intent.getStringExtra(EXTRA_TAB));
            SessionWidget.updateAll(context);
            return false;
        }
        if (ACTION_DAY.equals(action)) {
            SessionWidget.updateAll(context);
            return false;
        }
        if (ACTION_BAR_TICK.equals(action)) {
            // Sólo el 4×1, y sólo si sigue puesto y descansando: SessionWidget.
            SessionWidget.tick(context, now);
            return false;
        }
        JSONObject control = store.control();
        if (control == null) {
            // Una tarjeta que sobrevivió a su control (se cerró la sesión con la
            // notificación ya en la bandeja): se retira, sin registrar nada.
            SessionNotification.cancel(context);
            SessionAlarms.cancel(context);
            SessionWidget.updateAll(context);
            return false;
        }
        try {
            switch (action) {
                case ACTION_REPEAT:
                    log(context, store, SessionControl.repeat(control, now), now);
                    break;
                case ACTION_WIDGET_REPEAT:
                    // El único toque que vibra: el pulgar sobre el widget no ve
                    // nada más que lo confirme. (El fin del descanso también
                    // vibra, pero no es un toque: SessionNotification.)
                    log(context, store, SessionControl.repeat(control, now), now);
                    pulse(context);
                    break;
                case ACTION_WEIGHT_DOWN:
                    return adjust(context, store, SessionControl.weight(control, -1), now, done);
                case ACTION_WEIGHT_UP:
                    return adjust(context, store, SessionControl.weight(control, 1), now, done);
                case ACTION_REPS_DOWN:
                    return adjust(context, store, SessionControl.reps(control, -1), now, done);
                case ACTION_REPS_UP:
                    return adjust(context, store, SessionControl.reps(control, 1), now, done);
                case ACTION_REST_TOGGLE:
                    restChanged(context, store, SessionControl.toggleRest(control, now), now);
                    break;
                case ACTION_END:
                    end(context);
                    break;
                case ACTION_REST_COUNTDOWN:
                    // La misma tarjeta, aún bajando, en el canal que vibra 3, 2, 1
                    // y el cero; si el aviso aún es verdad. Las alarmas se quedan.
                    if (countdownOnTime(control, now)) {
                        SessionNotification.show(context, control, now, true);
                    }
                    break;
                case ACTION_REST_OVER:
                    // La tarjeta pasa a positivo, ya muda: la vibración fue la cuenta atrás.
                    SessionNotification.show(context, control, now);
                    SessionAlarms.arm(context, control, now);
                    SessionWidget.updateAll(context);
                    break;
                case ACTION_EXPIRE:
                    if (SessionControl.expired(control, now)) end(context);
                    else SessionAlarms.arm(context, control, now);
                    break;
                default:
                    break;
            }
        } catch (JSONException e) {
            // Un control ilegible no se puede usar: mejor ninguno que uno roto.
            end(context);
        }
        return false;
    }

    /**
     * Un − o + del bloque de ajuste: la serie que repetirán los siguientes toques.
     * Se guarda al momento (un +1 que llegue ya la usa), pero se pinta cuando
     * dejan de llegar toques: {@link #ADJUST_SETTLE_MS} después del último.
     */
    private static boolean adjust(Context context, SessionStore store, JSONObject control, long now,
            Runnable done) {
        store.saveControl(control);
        Context app = context.getApplicationContext();
        long paintAt = now + ADJUST_SETTLE_MS;
        if (pendingPaint != null) MAIN.removeCallbacks(pendingPaint);
        if (done != null) pendingDone.add(done);
        pendingPaint = () -> {
            pendingPaint = null;
            JSONObject latest = Session.store(app).control();
            if (latest != null) refresh(app, latest, paintAt);
            settled();
        };
        MAIN.postDelayed(pendingPaint, ADJUST_SETTLE_MS);
        return true;
    }

    /**
     * Un repintado que pinta ya (el +1): el de ajuste pendiente sobra, porque
     * éste sale con lo último guardado.
     */
    private static void supersedePendingPaint() {
        if (pendingPaint == null) return;
        MAIN.removeCallbacks(pendingPaint);
        pendingPaint = null;
        settled();
    }

    /** Los toques que esperaban al repintado ya pueden darse por acabados. */
    private static void settled() {
        List<Runnable> done = new ArrayList<>(pendingDone);
        pendingDone.clear();
        for (Runnable r : done) r.run();
    }

    /**
     * El descanso se pausó o siguió: la alarma del fin se quita o se vuelve a
     * poner (refresh), y la app, si está abierta, congela o suelta su barra.
     */
    private static void restChanged(Context context, SessionStore store, JSONObject control, long now) {
        store.saveControl(control);
        refresh(context, control, now);
        SessionEvents.changed();
    }

    /** Una serie desde fuera: a la cola, al servidor en cuanto se pueda, y a la vista. */
    private static void log(Context context, SessionStore store, SessionControl.Step step, long now)
            throws JSONException {
        store.enqueue(step.entry);
        store.saveControl(step.control);
        refresh(context, step.control, now);
        supersedePendingPaint();
        SessionSender.schedule(context);
        SessionEvents.changed();
    }

    private static void refresh(Context context, JSONObject control, long now) {
        SessionNotification.show(context, control, now);
        SessionAlarms.arm(context, control, now);
        SessionWidget.updateAll(context);
    }

    /** Corriendo y en hora: ni saltado, ni en pausa, ni tan tarde que el 3, 2, 1 mienta. */
    private static boolean countdownOnTime(JSONObject control, long now) {
        if (SessionControl.rest(control, now) != SessionControl.Rest.RUNNING) return false;
        long countdownAt = control.optLong("restEndsAt", 0) - COUNTDOWN_MS;
        return now - countdownAt <= COUNTDOWN_LATE_MS;
    }

    /** Una pulsación corta. */
    private static void pulse(Context context) {
        Vibrator vibrator = context.getSystemService(Vibrator.class);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        vibrator.vibrate(VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE));
    }
}
