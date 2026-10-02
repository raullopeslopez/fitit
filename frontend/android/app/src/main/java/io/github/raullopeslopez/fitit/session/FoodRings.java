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
    /** El lado del bitmap, en dp: el hueco que le da widget_session_4x2. */
    static final int SIZE_DP = 96;
    private static final float OUTER_DP = 9f;
    private static final float INNER_DP = 5f;
    /** Lo que separa el carril de fuera del de dentro. */
    private static final float GAP_DP = 4.5f;

    private FoodRings() {}

    static Bitmap draw(Context context, IdleSummary.Food food) {
        float density = context.getResources().getDisplayMetrics().density;
        int size = Math.round(SIZE_DP * density);
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        float outer = OUTER_DP * density;
        float inner = INNER_DP * density;
        RectF outerBox = inset(size, outer / 2f);
        RectF innerBox = inset(size, outer + GAP_DP * density + inner / 2f);

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
