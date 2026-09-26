package io.github.raullopeslopez.fitit.session;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Rect;
import android.view.View;
import android.view.ViewGroup;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * Pinta de verdad lo que inflan los widgets y la notificación: lo mide a un tamaño
 * en dp, lo coloca y, si {@code FITIT_RENDER_DIR} está definida, lo guarda en PNG
 * para compararlo con las vistas previas aprobadas. Sin la variable no escribe
 * nada: en CI sólo sirve para medir.
 */
final class WidgetRender {
    private WidgetRender() {}

    static int px(Context context, float dp) {
        return Math.round(dp * context.getResources().getDisplayMetrics().density);
    }

    static float dp(Context context, int px) {
        return px / context.getResources().getDisplayMetrics().density;
    }

    /** Mide y coloca {@code view} a {@code width} × {@code height} dp. */
    static View lay(Context context, View view, float width, float height) {
        int w = px(context, width);
        int h = px(context, height);
        view.measure(
                View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
        view.layout(0, 0, w, h);
        return view;
    }

    /** Mide y coloca con alto libre (lo que pida el contenido), como una notificación. */
    static View layFree(Context context, View view, float width) {
        int w = px(context, width);
        view.measure(
                View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
        view.layout(0, 0, w, view.getMeasuredHeight());
        return view;
    }

    /** Dónde queda {@code child} dentro de {@code root}, en px. */
    static Rect bounds(View root, View child) {
        Rect rect = new Rect(0, 0, child.getWidth(), child.getHeight());
        ((ViewGroup) root).offsetDescendantRectToMyCoords(child, rect);
        return rect;
    }

    /** Guarda el PNG si se pidió; si no, nada. */
    static void save(View view, int backdrop, String name) throws IOException {
        String dir = System.getenv("FITIT_RENDER_DIR");
        if (dir == null || dir.isEmpty()) return;
        int pad = 24;
        Bitmap bitmap = Bitmap.createBitmap(
                view.getWidth() + 2 * pad, view.getHeight() + 2 * pad, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(backdrop);
        canvas.translate(pad, pad);
        view.draw(canvas);
        File out = new File(dir, name + ".png");
        out.getParentFile().mkdirs();
        try (FileOutputStream stream = new FileOutputStream(out)) {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream);
        }
    }
}
