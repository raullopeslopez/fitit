package io.github.raullopeslopez.fitit.session;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import io.github.raullopeslopez.fitit.R;

/**
 * Los dos anillos de la pestaña Comida del widget (DESIGN.md, «Pestaña Comida»),
 * pintados en un bitmap: un widget no dibuja arcos, y una ProgressBar circular no
 * deja elegir el grosor ni el extremo redondo.
 *
 * <p>Al estilo de los anillos de actividad de un reloj (APK 0.19.0): a 136 dp, el de
 * fuera mide 20 dp, en ámbar sobre un carril del mismo ámbar al 22 %; 3 dp de hueco;
 * el de dentro, otros 20, en tinta sobre la tinta al 14 %. Extremos redondos y nada
 * en el centro: las cifras están a la izquierda, una vez cada una. Un arco de 0 no se
 * pinta (con el extremo redondo sería un punto, que se lee «algo comido»), y con la
 * proteína cerrada su anillo entero pasa al color de récord.
 */
final class FoodRings {
    /** El lado de los anillos en dp, y el máximo: lo que mide en widget_idle_tabs. */
    static final int SIZE_DP = 136;
    /** Menos no: los dos anillos de 20 dejarían un agujero de nada. */
    static final int MIN_DP = 88;
    /** Arriba del contenido: el margen de 4, la fila de pestañas (40) y el filete. */
    private static final int TABS_DP = 4 + 40 + 1;
    /** El aire mínimo que se deja arriba y abajo del anillo. */
    private static final int AIR_DP = 6;
    private static final int SIDE_DP = 16;
    /** Lo mínimo entre la columna de cifras y los anillos. */
    private static final int GAP_TO_LEGEND_DP = 12;
    private static final float STROKE_DP = 20f;
    private static final float GAP_DP = 3f;
    private static final float OUTER_TRACK_ALPHA = 0.22f;
    private static final float INNER_TRACK_ALPHA = 0.14f;

    private FoodRings() {}

    /**
     * Lo que cabe, en dp: {@link #SIZE_DP}, o menos si el alto que dejan las
     * pestañas o el ancho que deja la columna de cifras no da para tanto. Sin
     * tamaño del launcher, {@link #SIZE_DP}.
     */
    static int sizeFor(Context context, IdleSummary.Food food, int widthDp, int heightDp, boolean units) {
        if (widthDp <= 0 || heightDp <= 0) return SIZE_DP;
        int byHeight = heightDp - TABS_DP - 2 * AIR_DP;
        int byWidth = widthDp - 2 * SIDE_DP - GAP_TO_LEGEND_DP - legendDp(context, food, units);
        return Math.max(MIN_DP, Math.min(SIZE_DP, Math.min(byHeight, byWidth)));
    }

    /**
     * ¿Caben « G» y « KCAL» detrás de las cifras? En un 3×2 (≈253 dp) no: con ellos,
     * «1460/2569 KCAL» dejaba al anillo por debajo de {@link #MIN_DP}. Ahí se quitan,
     * y la unidad la dice el sello de encima. Se quitan sólo si eso le da más anillo.
     */
    static boolean unitsFit(Context context, IdleSummary.Food food, int widthDp, int heightDp) {
        return sizeFor(context, food, widthDp, heightDp, true)
                >= sizeFor(context, food, widthDp, heightDp, false);
    }

    /** El ancho de la columna de cifras: su línea más larga, con sus fuentes y sus tamaños. */
    static int legendDp(Context context, IdleSummary.Food food, boolean units) {
        float density = context.getResources().getDisplayMetrics().density;
        float sp = context.getResources().getDisplayMetrics().scaledDensity;
        Paint big = paint(context, R.font.geist_mono_medium, 24 * sp);
        Paint target = paint(context, R.font.geist_mono_medium, 15 * sp);
        Paint unit = paint(context, R.font.geist_mono_semibold, 11 * sp);
        Paint stamp = paint(context, R.font.geist_mono_semibold, 11 * sp);
        stamp.setLetterSpacing(0.1f);
        float widest = Math.max(stamp.measureText(context.getString(R.string.widget_food_protein)),
                big.measureText(IdleSummary.macro(food.protein))
                        + target.measureText("/" + IdleSummary.macro(food.targetProtein))
                        + (units ? unit.measureText(context.getString(R.string.widget_food_protein_unit)) : 0));
        if (food.targetKcal != null) {
            widest = Math.max(widest, big.measureText(IdleSummary.macro(food.kcal))
                    + target.measureText("/" + IdleSummary.macro(food.targetKcal))
                    + (units ? unit.measureText(context.getString(R.string.widget_food_kcal_unit)) : 0));
        }
        return (int) Math.ceil(widest / density) + 2;
    }

    private static Paint paint(Context context, int font, float size) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        try {
            android.graphics.Typeface face = androidx.core.content.res.ResourcesCompat.getFont(context, font);
            if (face != null) paint.setTypeface(face);
        } catch (RuntimeException e) {
            paint.setTypeface(android.graphics.Typeface.MONOSPACE);
        }
        paint.setTextSize(size);
        return paint;
    }

    static Bitmap draw(Context context, IdleSummary.Food food) {
        return draw(context, food, SIZE_DP);
    }

    /** Grosores y hueco crecen y menguan con el lado: las medidas de arriba son las de 136. */
    static Bitmap draw(Context context, IdleSummary.Food food, int sizeDp) {
        float density = context.getResources().getDisplayMetrics().density;
        float scale = sizeDp / (float) SIZE_DP;
        int size = Math.round(sizeDp * density);
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        float stroke = STROKE_DP * scale * density;
        RectF outerBox = inset(size, stroke / 2f);
        RectF innerBox = inset(size, stroke + GAP_DP * scale * density + stroke / 2f);

        int accent = context.getColor(R.color.widget_accent);
        ring(canvas, outerBox, stroke, alpha(accent, OUTER_TRACK_ALPHA), 1f);
        if (food.closed()) {
            ring(canvas, outerBox, stroke, context.getColor(R.color.widget_pr), 1f);
        } else {
            ring(canvas, outerBox, stroke, accent, food.proteinDone());
        }
        if (food.targetKcal != null) {
            int ink = context.getColor(R.color.widget_text);
            ring(canvas, innerBox, stroke, alpha(ink, INNER_TRACK_ALPHA), 1f);
            ring(canvas, innerBox, stroke, ink, food.kcalDone());
        }
        return bitmap;
    }

    /** El color al {@code share} de opacidad: sobre el fondo del widget, el carril. */
    private static int alpha(int color, float share) {
        return (Math.round(share * 255) << 24) | (color & 0x00FFFFFF);
    }

    private static RectF inset(int size, float by) {
        return new RectF(by, by, size - by, size - by);
    }

    /** Un arco desde las doce en sentido horario; {@code done} de 0 a 1. */
    private static void ring(Canvas canvas, RectF box, float stroke, int color, float done) {
        if (done <= 0f) return;
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(stroke);
        paint.setColor(color);
        if (done >= 1f) {
            canvas.drawOval(box, paint);
            return;
        }
        paint.setStrokeCap(Paint.Cap.ROUND);
        canvas.drawArc(box, -90f, 360f * done, false, paint);
    }
}
