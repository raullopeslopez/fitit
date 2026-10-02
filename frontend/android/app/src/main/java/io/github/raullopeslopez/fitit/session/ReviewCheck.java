package io.github.raullopeslopez.fitit.session;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * ¿Toca avisar de la revisión semanal? Sólo la decisión, sin Android ni red.
 *
 * <p>Avisa si el servidor dice que está pendiente ({@code due}), si el día de la
 * revisión es hoy y si de ese día no avisamos ya. Lo de «hoy» no es redundante con
 * {@code due}: {@code due} sigue en true hasta que se responde, y un lunes o un
 * martes un aviso de «tu semana está lista» sería ruido, no recordatorio. Lo de
 * «ya avisado» sirve para que un reintento o un segundo disparo el mismo día no
 * repita la notificación.
 *
 * <p>Cualquier cosa que no se entienda es «no avisar»: mañana se vuelve a mirar.
 */
final class ReviewCheck {
    private ReviewCheck() {}

    /**
     * @param responseJson cuerpo de {@code GET /targets/review}
     * @param today el día local, {@code YYYY-MM-DD}
     * @param lastNotified el {@code review_date} del último aviso, o null
     */
    static boolean decide(String responseJson, String today, String lastNotified) {
        return reviewDateToNotify(responseJson, today, lastNotified) != null;
    }

    /** El {@code review_date} por el que avisar, o null si no toca avisar. */
    static String reviewDateToNotify(String responseJson, String today, String lastNotified) {
        if (responseJson == null || today == null) return null;
        try {
            JSONObject review = new JSONObject(responseJson);
            // Sólo un booleano de verdad: un «true» entre comillas no es lo que
            // promete el contrato, y ante la duda no se avisa.
            if (!Boolean.TRUE.equals(review.opt("due"))) return null;
            Object date = review.opt("review_date");
            if (!(date instanceof String)) return null;
            String reviewDate = (String) date;
            if (!reviewDate.equals(today)) return null;
            if (reviewDate.equals(lastNotified)) return null;
            return reviewDate;
        } catch (JSONException e) {
            return null;
        }
    }
}
