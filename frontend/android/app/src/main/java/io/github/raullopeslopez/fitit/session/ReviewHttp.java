package io.github.raullopeslopez.fitit.session;

import java.io.IOException;
import java.util.Map;

/**
 * El GET de la revisión semanal, aparte de {@link QueueDrainer.Http}: añadirle un
 * método a ésa rompería los servidores de mentira de los tests de la cola, que no
 * leen nada. Misma {@code Response}, mismas reglas de red.
 */
interface ReviewHttp {
    QueueDrainer.Response get(String url, Map<String, String> headers) throws IOException;
}
