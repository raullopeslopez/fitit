package io.github.raullopeslopez.fitit.session;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import io.github.raullopeslopez.fitit.R;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.json.JSONObject;

/**
 * El widget 4×2 de la pantalla de inicio, el que ajusta; y el 3×2
 * ({@link SessionWidget3x2}), que es el mismo más estrecho.
 *
 * <pre>
 * Press banca · 4 series · 1 sin enviar
 * 01:23                                    (❚❚) (■)
 * [ −  32,5 kg  + ] [ −  × 12  + ] [ +1 ]
 * </pre>
 *
 * <p>Por debajo de 300 dp de ancho o de 190 de alto no cabe la fila de dos marcos, y
 * se pinta el compacto (widget_session_4x2_compact): el tiempo en la línea del
 * nombre y el bloque de dos filas apiladas. Los dos layouts tienen los mismos ids.
 *
 * <p>Añadir o cambiar de ejercicio se hace dentro de la app: tocar el ejercicio
 * la abre en ese entreno ({@link SessionLaunch#OPEN}). Los {@code −}/{@code +}
 * cambian la serie que se repite y no registran nada; el {@code +1} es el del
 * 4×1 (y vibra igual). Un ejercicio sin peso no enseña el marco de kg. Sin
 * entreno, pestañas: Pasos, Comida y Entreno. {@link SessionWidget} repinta los
 * tres tamaños. Spec: docs/widgets-entreno.md, «4×2, con ajuste» y siguientes.
 */
public class SessionWidget4x2 extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        render(context, manager, ids, fallback());
    }

    /** El launcher cambió su tamaño (al ponerlo, al estirarlo): se repinta a su medida. */
    @Override
    public void onAppWidgetOptionsChanged(
            Context context, AppWidgetManager manager, int id, Bundle options) {
        render(context, manager, new int[] {id}, fallback());
    }

    /** Lo que se pinta si el launcher no dice el tamaño: un 4×2 es el diseño entero. */
    Fit fallback() {
        return Fit.FULL;
    }

    /**
     * Cuánto sitio le dio el launcher (DESIGN.md, «Tamaños»). El diseño entero pide
     * 300 dp de ancho y 190 de alto; el 3×2 del Xiaomi del usuario mide ≈253 × 176,
     * y dos filas de launcher pueden dar menos de 190 también a un 4×2. Por debajo
     * de cualquiera de los dos, compacto; estrecho además ({@link #WIDE}),
     * descansando se quita « · 4 series» para que quepa el nombre.
     */
    enum Fit {
        FULL, COMPACT, NARROW;

        static final int TALL = 190;
        static final int WIDE = 300;

        /** En vertical, que es como se usa: ancho mínimo × alto máximo. */
        static Fit of(Bundle options, Fit fallback) {
            int height = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT);
            int width = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
            if (width <= 0 && height <= 0) return fallback;
            if (width > 0 && width < WIDE) return NARROW;
            if (height > 0 && height < TALL) return COMPACT;
            return FULL;
        }
    }

    static void render(Context context, AppWidgetManager manager, int[] ids, Fit fallback) {
        JSONObject control = Session.store(context).control();
        long now = System.currentTimeMillis();
        for (int id : ids) {
            Bundle options = manager.getAppWidgetOptions(id);
            Fit fit = Fit.of(options, fallback);
            int width = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
            int height = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT);
            manager.updateAppWidget(id, views(context, control, now, fit, width, height));
        }
    }

    static RemoteViews views(Context context, JSONObject control, long now) {
        return views(context, control, now, Fit.FULL);
    }

    static RemoteViews views(Context context, JSONObject control, long now, Fit fit) {
        return views(context, control, now, fit, 0, 0);
    }

    /** {@code width} × {@code height}: los dp que dio el launcher, o 0 si no los dijo. */
    static RemoteViews views(Context context, JSONObject control, long now, Fit fit,
            int width, int height) {
        boolean full = fit == Fit.FULL;
        RemoteViews views = new RemoteViews(context.getPackageName(),
                full ? R.layout.widget_session_4x2 : R.layout.widget_session_4x2_compact);
        if (Session.store(context).sessionExpired()) {
            padding(context, views, 14, 14);
            return SessionWidget.expired(context, views);
        }
        if (control == null) return idle(context, views, LocalDate.now(), width, height);
        // Android reaplica sobre la vista que ya había: los márgenes de las
        // pestañas no deben quedarse en el widget que ahora entrena.
        if (full) padding(context, views, 14, 16);
        else padding(context, views, 10, 10);

        SessionWidget.header(context, views, control, now);
        // El tiempo también abre la app: la línea del nombre sola mide 18 dp.
        views.setOnClickPendingIntent(R.id.widget_time,
                SessionLaunch.open(context, control.optInt("workoutId", -1)));

        SessionWidget.count(views, control);
        String unsent = SessionControl.unsent(Session.store(context).queue().size());
        views.setTextViewText(R.id.widget_unsent, unsent);
        views.setViewVisibility(R.id.widget_unsent, unsent.isEmpty() ? View.GONE : View.VISIBLE);
        boolean resting = SessionControl.rest(control, now) != SessionControl.Rest.NONE;
        views.setViewVisibility(R.id.widget_count,
                fit == Fit.NARROW && resting ? View.GONE : View.VISIBLE);

        block(views, control);
        pause(context, views, control, now);

        SessionNotification.tap(context, views, R.id.widget_weight_down, SessionController.ACTION_WEIGHT_DOWN, 30);
        SessionNotification.tap(context, views, R.id.widget_weight_up, SessionController.ACTION_WEIGHT_UP, 31);
        SessionNotification.tap(context, views, R.id.widget_reps_down, SessionController.ACTION_REPS_DOWN, 32);
        SessionNotification.tap(context, views, R.id.widget_reps_up, SessionController.ACTION_REPS_UP, 33);
        SessionNotification.tap(context, views, R.id.widget_log, SessionController.ACTION_WIDGET_REPEAT, 21);
        SessionNotification.tap(context, views, R.id.widget_end, SessionController.ACTION_END, 34);
        return views;
    }

    /**
     * Pausar el descanso: un aro al lado de Terminar, sólo mientras corre (❚❚) o
     * está en pausa (▶). Pasado de tiempo no hay nada que pausar. En todos los
     * tamaños, también el 3×2 estrecho, donde el nombre se corta con «…»
     * mientras se descansa (decidido con el usuario sobre el render, 0.15.0). Lo
     * usa también la notificación.
     */
    static void pause(Context context, RemoteViews views, JSONObject control, long now) {
        SessionControl.Rest rest = SessionControl.rest(control, now);
        boolean resting = rest == SessionControl.Rest.RUNNING || rest == SessionControl.Rest.PAUSED;
        views.setViewVisibility(R.id.widget_rest_toggle, resting ? View.VISIBLE : View.GONE);
        if (!resting) return;
        boolean paused = rest == SessionControl.Rest.PAUSED;
        views.setImageViewResource(R.id.widget_rest_toggle,
                paused ? R.drawable.widget_resume_ring : R.drawable.widget_pause_ring);
        views.setContentDescription(R.id.widget_rest_toggle, context.getString(
                paused ? R.string.widget_rest_resume : R.string.widget_rest_pause));
        SessionNotification.tap(context, views, R.id.widget_rest_toggle,
                SessionController.ACTION_REST_TOGGLE, 36);
    }

    /** 16 dp a los lados siempre; arriba {@code top} y abajo {@code bottom}. */
    private static void padding(Context context, RemoteViews views, int top, int bottom) {
        float density = context.getResources().getDisplayMetrics().density;
        views.setViewPadding(R.id.widget_root, Math.round(16 * density), Math.round(top * density),
                Math.round(16 * density), Math.round(bottom * density));
    }

    // --- Sin entreno: las pestañas ---------------------------------------------

    static RemoteViews idle(Context context, RemoteViews views, LocalDate today) {
        return idle(context, views, today, 0, 0);
    }

    /**
     * Sin entreno (DESIGN.md, «Sin entreno — pestañas»): «Pasos», «Comida» y
     * «Entreno» arriba, y debajo la elegida. Sin pasos de hoy no hay Pasos; sin
     * objetivo de proteína, no hay Comida; Entreno está siempre. El widget
     * recuerda la elegida ({@link SessionStore#idleTab}).
     */
    static RemoteViews idle(Context context, RemoteViews views, LocalDate today, int width, int height) {
        // 4 arriba (las pestañas tocan en 44 y suben sobre él) y nada abajo: el
        // aire de abajo lo reparte la pestaña, igual que el de arriba.
        padding(context, views, 4, 0);
        views.setViewVisibility(R.id.widget_expired, View.GONE);
        views.setViewVisibility(R.id.widget_session, View.GONE);
        views.setViewVisibility(R.id.widget_idle, View.VISIBLE);

        SessionStore store = Session.store(context);
        JSONObject summary = store.summary();
        LocalDate foodToday = IdleSummary.foodDay(LocalDateTime.now());
        List<IdleSummary.Page> pages = IdleSummary.pages(summary, today, foodToday);
        IdleSummary.Page page = IdleSummary.tab(store.idleTab(), pages);

        tab(context, views, IdleSummary.Page.STEPS, pages, page, R.id.widget_tab_steps,
                R.id.widget_tab_steps_label, R.id.widget_tab_steps_line, 37);
        tab(context, views, IdleSummary.Page.FOOD, pages, page, R.id.widget_tab_food,
                R.id.widget_tab_food_label, R.id.widget_tab_food_line, 38);
        tab(context, views, IdleSummary.Page.START, pages, page, R.id.widget_tab_train,
                R.id.widget_tab_train_label, R.id.widget_tab_train_line, 39);
        views.setViewVisibility(R.id.widget_idle_steps, page == IdleSummary.Page.STEPS ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_idle_food, page == IdleSummary.Page.FOOD ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_idle_start, page == IdleSummary.Page.START ? View.VISIBLE : View.GONE);

        train(context, views, IdleSummary.last(summary, today), width);
        IdleSummary.Food food = IdleSummary.food(summary, foodToday);
        if (food != null) food(context, views, food, width, height);
        IdleSummary.Steps steps = IdleSummary.steps(summary, today);
        if (steps != null) steps(context, views, steps);
        return views;
    }

    /** Una pestaña: sólo si hay su pantalla; la elegida, en tinta y subrayada. */
    private static void tab(Context context, RemoteViews views, IdleSummary.Page tab,
            List<IdleSummary.Page> pages, IdleSummary.Page chosen, int id, int label, int line, int code) {
        views.setViewVisibility(id, pages.contains(tab) ? View.VISIBLE : View.GONE);
        boolean on = tab == chosen;
        ink(context, views, label, on ? R.color.widget_text : R.color.widget_muted);
        views.setViewVisibility(line, on ? View.VISIBLE : View.INVISIBLE);
        Intent intent = new Intent(context, SessionActionReceiver.class)
                .setAction(SessionController.ACTION_TAB)
                .putExtra(SessionController.EXTRA_TAB, tab.name());
        views.setOnClickPendingIntent(id, SessionNotification.broadcast(context, intent, code));
    }

    /**
     * Un color de texto de widget_colors: desde Android 12, el recurso, que el
     * launcher resuelve al pintar y así sigue al tema del sistema; antes, el color
     * de ahora.
     */
    private static void ink(Context context, RemoteViews views, int id, int color) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            views.setColorStateList(id, "setTextColor", color);
        } else {
            views.setTextColor(id, context.getColor(color));
        }
    }

    /**
     * La pestaña Pasos: «8.432» y «faltan 1.568» detrás; la barra; «Media semanal
     * 7.910». Sin objetivo, ni «faltan» ni barra; cumplido, «faltan» se va. Lo que
     * no está se lleva su hueco, para que el aire siga repartido por igual.
     */
    private static void steps(Context context, RemoteViews views, IdleSummary.Steps steps) {
        views.setTextViewText(R.id.widget_steps, IdleSummary.thousands(steps.today));
        Integer left = steps.left();
        views.setViewVisibility(R.id.widget_steps_left_line, left == null ? View.GONE : View.VISIBLE);
        if (left != null) views.setTextViewText(R.id.widget_steps_left, IdleSummary.thousands(left));
        boolean goal = steps.goal != null;
        views.setViewVisibility(R.id.widget_steps_bar, goal ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_steps_bar_gap, goal ? View.VISIBLE : View.GONE);
        if (goal) views.setProgressBar(R.id.widget_steps_bar, 1000, steps.progress(), false);
        boolean week = steps.weekAverage != null;
        views.setViewVisibility(R.id.widget_steps_week_line, week ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_steps_week_gap, week ? View.VISIBLE : View.GONE);
        if (week) views.setTextViewText(R.id.widget_steps_week, IdleSummary.thousands(steps.weekAverage));
        views.setOnClickPendingIntent(R.id.widget_idle_steps, SessionLaunch.app(context));
    }

    /**
     * La pestaña Comida (DESIGN.md, «Pestaña Comida»): «118/202 G» en accent-ink y
     * «1460/2569 KCAL» en tinta, con su sello, y los anillos a la derecha. Cerrada la
     * proteína, su cifra y su anillo pasan a récord. Sin objetivo de kcal, ni bloque
     * KCAL ni anillo de dentro. Tocarla abre Comida.
     */
    static void food(Context context, RemoteViews views, IdleSummary.Food food, int width, int height) {
        boolean units = FoodRings.unitsFit(context, food, width, height);
        int ring = FoodRings.sizeFor(context, food, width, height, units);
        // El tamaño de una vista sólo se cambia desde Android 12; antes, los 136
        // del layout.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) ring = FoodRings.SIZE_DP;
        else {
            views.setViewLayoutWidth(R.id.widget_food_ring_box, ring, TypedValue.COMPLEX_UNIT_DIP);
            views.setViewLayoutHeight(R.id.widget_food_ring_box, ring, TypedValue.COMPLEX_UNIT_DIP);
        }
        views.setImageViewBitmap(R.id.widget_food_rings, FoodRings.draw(context, food, ring));

        int protein = food.closed() ? R.color.widget_pr : R.color.widget_accent_ink;
        views.setTextViewText(R.id.widget_food_protein, IdleSummary.macro(food.protein));
        views.setTextViewText(R.id.widget_food_protein_target, "/" + IdleSummary.macro(food.targetProtein));
        for (int id : new int[] {R.id.widget_food_protein, R.id.widget_food_protein_target,
                R.id.widget_food_protein_unit}) {
            ink(context, views, id, protein);
        }
        int unit = units ? View.VISIBLE : View.GONE;
        views.setViewVisibility(R.id.widget_food_protein_unit, unit);
        boolean kcal = food.targetKcal != null;
        views.setViewVisibility(R.id.widget_food_kcal_group, kcal ? View.VISIBLE : View.GONE);
        if (kcal) {
            views.setTextViewText(R.id.widget_food_kcal, IdleSummary.macro(food.kcal));
            views.setTextViewText(R.id.widget_food_kcal_target, "/" + IdleSummary.macro(food.targetKcal));
            views.setViewVisibility(R.id.widget_food_kcal_unit, unit);
        }
        views.setOnClickPendingIntent(R.id.widget_idle_food, SessionLaunch.food(context));
    }

    /**
     * La pestaña Entreno: «2 días» desde el último, con la franja del color de su
     * grupo (dos grupos, dos mitades), y «Empezar entreno». «Hoy» en lugar del
     * número si fue hoy; «1 día». Sin último entreno, sólo el botón.
     */
    private static void train(Context context, RemoteViews views, IdleSummary.Last last, int width) {
        views.setOnClickPendingIntent(R.id.widget_start, SessionLaunch.start(context));
        views.setOnClickPendingIntent(R.id.widget_idle_start, SessionLaunch.start(context));
        boolean known = last != null;
        views.setViewVisibility(R.id.widget_train, known ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_train_gap, known ? View.VISIBLE : View.GONE);
        if (!known) return;

        boolean today = last.days == 0;
        views.setViewVisibility(R.id.widget_train_days, today ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.widget_train_unit, today ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.widget_train_today, today ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.widget_train_days, String.valueOf(last.days));
        views.setTextViewText(R.id.widget_train_unit, last.days == 1 ? "día" : "días");

        List<String> groups = last.groups.size() > 2 ? last.groups.subList(0, 2) : last.groups;
        boolean named = !groups.isEmpty();
        String since = context.getString(today ? R.string.widget_train_today_line : R.string.widget_train_since);
        views.setTextViewText(R.id.widget_train_since, named ? since + " · " : since);
        views.setViewVisibility(R.id.widget_train_groups, named ? View.VISIBLE : View.GONE);
        String names = String.join(" · ", groups);
        // En un 3×2 «desde el último · Cuádriceps · Core» no cabe: antes que cortar
        // con «…», se nombra el grupo principal entero. La franja sigue con los dos.
        if (groups.size() == 2 && !fits(context, since + " · ", names, width)) names = groups.get(0);
        views.setTextViewText(R.id.widget_train_groups, names);

        boolean two = groups.size() == 2;
        views.setViewVisibility(R.id.widget_train_stripe_2, two ? View.VISIBLE : View.GONE);
        views.setImageViewResource(R.id.widget_train_stripe_1,
                two ? R.drawable.widget_stripe_top : R.drawable.widget_stripe);
        stripe(context, views, R.id.widget_train_stripe_1, named ? groups.get(0) : null);
        if (two) stripe(context, views, R.id.widget_train_stripe_2, groups.get(1));
    }

    /**
     * ¿Cabe la línea de debajo del número («desde el último · » en Geist 13 y los
     * grupos en Geist 600 13) al lado de la franja? Sin tamaño del launcher, sí.
     */
    private static boolean fits(Context context, String since, String names, int widthDp) {
        if (widthDp <= 0) return true;
        float density = context.getResources().getDisplayMetrics().density;
        float free = (widthDp - 2 * 16 - 4 - 12) * density;
        return text(context, R.font.geist_regular, since) + text(context, R.font.geist_semibold, names) <= free;
    }

    private static float text(Context context, int font, String text) {
        android.graphics.Paint paint = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        try {
            android.graphics.Typeface face = androidx.core.content.res.ResourcesCompat.getFont(context, font);
            if (face != null) paint.setTypeface(face);
        } catch (RuntimeException e) {
            // Sin la fuente, se mide con la del sistema.
        }
        paint.setTextSize(13 * context.getResources().getDisplayMetrics().scaledDensity);
        return paint.measureText(text);
    }

    /** Una mitad (o la franja entera) del color de su grupo; sin grupo conocido, border-strong. */
    private static void stripe(Context context, RemoteViews views, int id, String group) {
        int color = groupColor(group);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            views.setColor(id, "setColorFilter", color);
        } else {
            views.setInt(id, "setColorFilter", context.getColor(color));
        }
    }

    /** El color de un grupo muscular (--m-* de DESIGN.md); Cardio y lo desconocido, border-strong. */
    static int groupColor(String group) {
        if (group == null) return R.color.widget_border_strong;
        switch (IdleSummary.groupKey(group)) {
            case "pecho": return R.color.widget_m_pecho;
            case "espalda": return R.color.widget_m_espalda;
            case "cuadriceps": return R.color.widget_m_cuadriceps;
            case "gluteo": return R.color.widget_m_gluteo;
            case "femoral": return R.color.widget_m_femoral;
            case "gemelo": return R.color.widget_m_gemelo;
            case "hombro": return R.color.widget_m_hombro;
            case "biceps": return R.color.widget_m_biceps;
            case "triceps": return R.color.widget_m_triceps;
            case "core": return R.color.widget_m_core;
            default: return R.color.widget_border_strong;
        }
    }

    /**
     * Las cifras de la fila de ajuste (o del bloque apilado, en el compacto). Sin
     * peso, el marco de kg se va (y en el apilado, su filete) y queda el de reps.
     */
    static void block(RemoteViews views, JSONObject control) {
        int weighted = SessionControl.hasWeight(control) ? View.VISIBLE : View.GONE;
        views.setViewVisibility(R.id.widget_weight_box, weighted);
        views.setViewVisibility(R.id.widget_divider, weighted);
        views.setTextViewText(R.id.widget_weight, SessionControl.weightLabel(control));
        views.setTextViewText(R.id.widget_reps, SessionControl.repsLabel(control));
    }
}
