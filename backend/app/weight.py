"""La tendencia del peso: lo único que se usa para derivar nada.

El peso corporal oscila más de un kilo por agua, sal y hora del día. Derivar
objetivos de la última pesada haría temblar el número sin que hubieras cambiado
nada, y un objetivo que tiembla se deja de mirar. Así que aquí no se devuelve
nunca la última cifra: se devuelve una media, o nada.

**Y nada es una respuesta.** Con una sola pesada no hay tendencia — no es que la
tendencia sea esa pesada, es que no la hay. Misma postura que un nutriente sin
medir en `foods`: la ausencia no se rellena con lo que haya a mano.

La ventana se mide **hacia atrás desde la pesada más reciente**, no desde hoy, y
es deliberado. Pesarse de vez en cuando es lo que hay, y si la ventana colgara
del reloj, tres semanas sin báscula dejarían la tendencia en blanco justo cuando
más falta hace. Lo que sí se devuelve es **hasta cuándo** está medida
(`up_to`), para que la pantalla pueda decir que es de hace un mes. Decidir si
eso es demasiado viejo es de quien lo pinta, no de esta función.
"""

from dataclasses import dataclass
from datetime import date, timedelta

# Cuánto atrás, desde la pesada más reciente, sigue hablando del mismo peso.
VENTANA = timedelta(days=30)
# Más de esto no afina la media, sólo la vuelve vieja.
MAX_PESADAS = 5
# Por debajo de esto no hay media que valga: una pesada es una pesada.
MINIMO = 2
_PLACES = 1


@dataclass(frozen=True)
class Tendencia:
    """La media, con lo que hace falta para saber cuánto fiarse de ella."""

    kg: float | None
    pesadas: int
    hasta: date | None


def tendencia(
    pesadas: list[tuple[date, float]],
    *,
    ventana: timedelta = VENTANA,
    maximo: int = MAX_PESADAS,
    minimo: int = MINIMO,
) -> Tendencia:
    """La media de las pesadas recientes, o `None` si no hay suficientes.

    `pesadas` son pares `(día, kg)` en cualquier orden. Se quedan las que caen
    dentro de `ventana` contada hacia atrás desde la más reciente, y de ésas las
    `maximo` últimas.
    """
    if not pesadas:
        return Tendencia(kg=None, pesadas=0, hasta=None)

    ordenadas = sorted(pesadas, key=lambda p: p[0], reverse=True)
    mas_reciente = ordenadas[0][0]
    corte = mas_reciente - ventana
    dentro = [p for p in ordenadas if p[0] >= corte][:maximo]

    if len(dentro) < minimo:
        return Tendencia(kg=None, pesadas=len(dentro), hasta=mas_reciente)

    media = sum(kg for _, kg in dentro) / len(dentro)
    return Tendencia(kg=round(media, _PLACES), pesadas=len(dentro), hasta=mas_reciente)
