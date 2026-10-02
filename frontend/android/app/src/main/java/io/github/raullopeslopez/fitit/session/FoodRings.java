package io.github.raullopeslopez.fitit.session;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import io.github.raullopeslopez.fitit.R;

/**
 * Los dos anillos de la pantalla Comida del widget (DESIGN.md, «Pantalla Comida»),
 * pintados en un bitmap: un widget no dibuja arcos, y una ProgressBar circular no
 * deja elegir el grosor ni el extremo redondo.
 *
 * <p>Proteína fuera (9 dp, ámbar), kcal dentro (5 dp, tinta al 70 %), sobre su
 * carril en el color del borde. Las mismas reglas que la tarjeta de Comida: un
 * arco de 0 no se pinta (con el extremo redondo sería un punto, que se lee «algo
 * comido»), y con la proteína cerrada su anillo entero pasa al color de récord.
 */
final class FoodRings {
    /**
     * El lado de los anillos en dp cuando el launcher no dice su tamaño, y el
     * mínimo: lo que mide en widget_session_4x2. Grosores y cifra crecen con él.
     */
    static final int SIZE_DP = 96;
    /** Hasta aquí: más grande, en un 4×3, sería un cartel y no una cifra de reojo. */
    static final int MAX_DP = 180;
    /** Los márgenes del widget sin entreno (14 arriba y abajo, 16 a los lados). */
    private static final int EDGE_DP = 14;
    private static final int SIDE_DP = 16;
    /** Lo que ocupan los puntitos dentro del alto: 44 de fila menos 12 metidos en el margen. */
    private static final int DOTS_DP = 32;
    /** Entre los anillos y la leyenda (marginStart en el layout). */
    private static final int GAP_TO_LEGEND_DP = 14;
    private static final float OUTER_DP = 9f;
    private static final float INNER_DP = 5f;
    /** Lo que separa el carril de fuera del de dentro. */
    private static final float GAP_DP = 4.5f;

    private FoodRings() {}

    /**
     * Lo que cabe, en dp: todo el alto libre (sin márgenes ni puntitos), salvo
     * que la leyenda pida el ancho. La leyenda se mide con su fuente y sus
     * cifras de hoy, así que una de cinco dígitos le quita sitio al anillo y no
     * se corta. Sin tamaño del launcher, {@link #SIZE_DP}.
     */
    static int sizeFor(Context context, IdleSummary.Food food, int widthDp, int heightDp) {
        if (widthDp <= 0 || heightDp <= 0) return SIZE_DP;
        int byHeight = heightDp - 2 * EDGE_DP - DOTS_DP;
        int byWidth = widthDp - 2 * SIDE_DP - GAP_TO_LEGEND_DP - legendDp(context, food);
        return Math.max(SIZE_DP, Math.min(MAX_DP, Math.min(byHeight, byWidth)));
    }

    /** El ancho de la leyenda: su línea más larga, con su fuente y su tamaño. */
    static int legendDp(Context context, IdleSummary.Food food) {
        float density = context.getResources().getDisplayMetrics().density;
        float sp = context.getResources().getDisplayMetrics().scaledDensity;
        Paint mono = paint(context, R.font.geist_mono_medium, 15 * sp);
        Paint label = paint(context, R.font.geist_mono_semibold, 11 * sp);
        label.setLetterSpacing(0.1f);
        Paint note = paint(context, R.font.geist_regular, 13 * sp);
        float widest = Math.max(mono.measureText(food.proteinLine()),
                label.measureText(context.getString(R.string.widget_food_protein)) + 12 * density);
        if (food.targetKcal != null) {
            widest = Math.max(widest, mono.measureText(food.kcalLine()));
            String text = food.kcalNote();
            if (text != null) widest = Math.max(widest, note.measureText(text));
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

    static Bitmap draw(Context context, IdleSummary.Food food, int sizeDp) {
        float density = context.getResources().getDisplayMetrics().density;
        float scale = sizeDp / (float) SIZE_DP;
        int size = Math.round(sizeDp * density);
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        float outer = OUTER_DP * scale * density;
        float inner = INNER_DP * scale * density;
        RectF outerBox = inset(size, outer / 2f);
        RectF innerBox = inset(size, outer + GAP_DP * scale * density + inner / 2f);

        int track = context.getColor(R.color.widget_border);
        ring(canvas, outerBox, outer, track, 1f);
        if (food.closed()) {
            ring(canvas, outerBox, outer, context.getColor(R.color.widget_pr), 1f);
        } else {
            ring(canvas, outerBox, outer, context.getColor(R.color.widget_accent), food.proteinDone());
        }
        if (food.targetKcal != null) {
            ring(canvas, innerBox, inner, track, 1f);
            ring(canvas, innerBox, inner, context.getColor(R.color.widget_ring_kcal), food.kcalDone());
        }
        return bitmap;
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
