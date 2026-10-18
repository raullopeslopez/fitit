"""El generador de la semana.

**No es un solver, y es una decisión.** Es un voraz aleatorizado con reinicios:
para cada hueco se eligen candidatos que cumplen las reglas duras de hueco y no
están en enfriamiento, se elige con peso, se ajustan los gramos del día contra
su objetivo, se puntúa la semana con las reglas blandas, y se repite con otra
semilla quedándose la mejor.

Un solver exacto daría la semana óptima de un problema que no está bien
definido —«la mejor semana» no es una cantidad— y tardaría en contestar lo que
aquí se contesta en un parpadeo. Lo que sí se exige es que sea **determinista
dada la semilla**: es lo que hace que el plan sea el mismo el martes que el
jueves, y lo que permite regenerar con una regla nueva y comparar las dos
semanas en vez de creerse la segunda.

Este módulo no toca la base de datos. Recibe platos ya leídos y devuelve una
propuesta; guardarla es del router.
"""

import random
from collections import Counter
from dataclasses import dataclass, field, replace
from datetime import date, timedelta
from typing import get_args

from . import rules
from .nutrition import (
    NUTRIENTS,
    Ajustable,
    ajustar_gramos,
    calcular_nutrientes,
    repartir_por_hueco,
    sumar_nutrientes,
)
from .schemas import MealSlot

# Los cuatro huecos, de donde ya estaban: la app define exactamente cuatro y las
# cuatro tomas del brainstorming caen sobre ellos. Una segunda lista aquí sería
# una segunda verdad.
HUECOS: tuple[str, ...] = get_args(MealSlot)

# Días que un plato tarda en poder repetirse. «No dos días seguidos» es más útil
# y más fácil de entender que «como mucho tres por semana» (§14).
ENFRIAMIENTO = 2

# Lo que se considera «la semana pasada» al mirar hacia atrás. Sin esta memoria
# el generador puede cumplir «no repetir dentro de la semana» y devolverte la
# misma semana otra vez.
MEMORIA = timedelta(days=7)

# Cuota de exploración (decisión 22): una parte de las elecciones que a propósito
# no mira la puntuación. Sin ella, la puntuación se come la variedad que la
# rotación intenta dar — un generador que sólo elige lo que gusta deja el
# repertorio en cinco platos en dos meses.
EXPLORACION = 0.2

# Reinicios con semillas distintas. Ocho es donde la mejora por reinicio deja de
# notarse con un repertorio de decenas de platos.
REINICIOS = 8

# Pesos de la puntuación. Una dura rota tiene que doler más que cualquier suma
# de blandas, y las blandas más que unas kcal de diferencia — si no, el
# generador cuadraría los números rompiendo reglas.
_PESO_DURA = 1000.0
_PESO_BLANDA = 50.0

# El orden en que se comen, que no es el de `HUECOS`: lo que una comida no
# alcanza lo recoge la siguiente, y la merienda va antes que la cena.
_ORDEN_DEL_DIA = {"desayuno": 0, "comida": 1, "snack": 2, "cena": 3}

# Pasadas de cierre al repartir un día, y desde cuánto se da por cuadrado: un
# 1 % de las kcal es menos que lo que mueve redondear los gramos a enteros.
_CIERRES = 2
_TOLERANCIA_KCAL = 0.01

# Una fila de ceros, para lo que de verdad aporta cero.
_CERO = {campo: 0.0 for campo in NUTRIENTS}


class PlanImposible(Exception):
    """No se ha podido llenar un hueco, y se dice cuál.

    Igual que `ProposalRefused` en `repertoire.py`: cuando no se puede, se
    nombra lo que falta. «No hay plan» sin decir dónde se atascó deja al usuario
    sin nada que arreglar.
    """

    def __init__(self, slot: str, motivo: str = "sin candidatos"):
        super().__init__(f"{motivo} para {slot}")
        self.slot = slot
        self.motivo = motivo


@dataclass(frozen=True)
class PlatoCandidato:
    """Un plato tal y como el generador necesita verlo.

    `slots` vacío es **«no lo has dicho»**, y se lee como «vale para cualquier
    hueco»: es lo permisivo lo correcto aquí, porque el repertorio que ya
    existe no lo declaró y negárselo lo dejaría fuera del plan entero.

    `bloque` es la precisión de §39: un guiso es lo que es —450 kcal y punto— y
    no aporta ajuste. Sus ingredientes se quedan en los gramos de la receta y
    **el resto del día compensa**. Sin esto, exigir que todo plato sea ajustable
    manda al generador hacia platos de báscula y se come semanas enteras de
    comida separada en el plato.
    """

    id: int
    nombre: str
    slots: tuple[str, ...] = ()
    metodo: str | None = None
    familias: tuple[str | None, ...] = ()
    bloque: bool = False
    fijo: dict = field(default_factory=dict)
    ajustables: tuple[Ajustable, ...] = ()
    # Gancho para la decisión 14 («+ me gusta / no me gusta»). Mientras no haya
    # puntuaciones todos pesan igual, que es lo honesto: fingir preferencias que
    # nadie ha expresado sería elegir por el usuario.
    puntuacion: float = 1.0


@dataclass(frozen=True)
class Entrada:
    """Un hueco resuelto: qué plato, qué día y con cuántos gramos de lo ajustable."""

    fecha: date
    slot: str
    dish_id: int
    gramos: tuple[float, ...] = ()
    kcal: float | None = None


@dataclass(frozen=True)
class Plan:
    """La semana propuesta, y **el porqué**.

    `puntuacion` es un coste: cuanto más baja, mejor la semana. `veredictos`
    lleva un juicio por regla —incluidos los que se cumplen—, porque enseñar
    sólo lo roto deja sin saber si lo demás se miró.
    """

    seed: int
    entradas: tuple[Entrada, ...]
    veredictos: tuple[rules.Veredicto, ...] = ()
    puntuacion: float = 0.0


# --- candidatos ---------------------------------------------------------------
def peso_en_casa(food_ids, en_casa) -> float:
    """Cuánto pesa un plato al elegir según lo que hay en casa (fase 6.2): 1 sin
    nada, hasta 3 con todo. Empuja sin obligar —la variedad y las reglas siguen
    mandando—, que es lo que separa «tira de lo que sobró» de «cocina lo que
    compraste»."""
    distintos = set(food_ids)
    if not distintos:
        return 1.0
    return 1.0 + 2.0 * len(distintos & set(en_casa)) / len(distintos)


def _reglas_de_hueco(reglas, slot: str):
    return [
        regla
        for regla in reglas
        if regla.get("scope") == "slot"
        and regla.get("slot") == slot
        and regla.get("hardness") == "hard"
    ]


def _cabe(plato: PlatoCandidato, slot: str, fecha: date, objetivo: dict, reglas) -> bool:
    """Si este plato puede ir en este hueco.

    El filtro de reglas duras no se reimplementa: se le pregunta al motor de
    reglas con un día de un solo hueco. Un `unknown` **no descarta** — no saber
    no es incumplir, y aquí descartaría todo plato sin clasificar.
    """
    if plato.slots and slot not in plato.slots:
        return False
    duras = _reglas_de_hueco(reglas, slot)
    if not duras:
        return True
    comida = rules.Comida(slot=slot, familias=plato.familias, kcal=plato.fijo.get("kcal"))
    dia = rules.Dia(fecha=fecha, macros=dict(objetivo), comidas=(comida,))
    ctx = rules.Contexto(dia=dia)
    return all(v.state != "broken" for v in rules.evaluar(duras, ctx))


def _frio(plato: PlatoCandidato, fecha: date, usados: dict, enfriamiento: int) -> bool:
    ultimo = usados.get(plato.id)
    return ultimo is None or (fecha - ultimo).days >= enfriamiento


def _gastado(plato: PlatoCandidato, inicio: date, historial: dict) -> bool:
    ultimo = historial.get(plato.id)
    return ultimo is not None and ultimo >= inicio - MEMORIA


def _elegir(pool, rng: random.Random, exploracion: float) -> PlatoCandidato:
    if exploracion and rng.random() < exploracion:
        return rng.choice(pool)
    pesos = [max(plato.puntuacion, 0.0) for plato in pool]
    if sum(pesos) <= 0:
        return rng.choice(pool)
    return rng.choices(pool, weights=pesos, k=1)[0]


# --- el día -------------------------------------------------------------------
def _macros_de(plato: PlatoCandidato, gramos) -> dict:
    """Lo que suma un plato con estos gramos en lo ajustable."""
    # Sin nada fijo, nada que sumar: ver `_resolver_dia`.
    filas = [{campo: plato.fijo.get(campo) for campo in NUTRIENTS}] if plato.fijo else []
    for pieza, g in zip(plato.ajustables, gramos):
        # Cero gramos aportan **cero**, y eso sí es un número. Dejar la fila
        # vacía volvería desconocido el plato entero por un ingrediente que
        # simplemente no se pone, y un hueco sin kcal no se puede juzgar.
        filas.append(calcular_nutrientes(_Porcion(pieza.por_100g), g) if g > 0 else _CERO)
    totales, _ = sumar_nutrientes(filas)
    return totales


class _Porcion:
    """Adaptador para que `calcular_nutrientes` lea un `por_100g` suelto.

    La aritmética sigue siendo la de `nutrition.py`; lo único que se presta aquí
    es la forma de los atributos.
    """

    def __init__(self, por_100g: dict):
        for campo in NUTRIENTS:
            setattr(self, f"{campo}_100g", por_100g.get(campo))


def _se_deja_ajustar(pieza: Ajustable, objetivo: dict) -> bool:
    """Si este ingrediente puede perseguir este objetivo.

    No se puede ajustar sobre lo que nadie midió: un arroz sin hidratos
    declarados no sirve para cerrar los hidratos del día. Se queda en los gramos
    de la receta en vez de dejar sin plan a la semana entera — es la regla del
    `NULL` leída desde el generador.
    """
    return not any(
        pieza.por_100g.get(campo) is None
        for campo, meta in objetivo.items()
        if meta is not None and campo in NUTRIENTS
    )


def _partes_del_plato(plato: PlatoCandidato, objetivo: dict) -> tuple[list[dict], list[int]]:
    """Lo fijo de un plato, como filas, y qué ingredientes suyos se dejan mover."""
    # `{}` es un plato sin nada fijo, y eso aporta **cero** (`_candidatos`).
    # Pasado como fila serían cinco `None`, y un desconocido en lo fijo deja al
    # hueco sin nada que perseguir: un plato con todo ajustable —los de la
    # pauta— se quedaba en los gramos de la receta.
    filas = [{campo: plato.fijo.get(campo) for campo in NUTRIENTS}] if plato.fijo else []
    movibles = []
    for j, pieza in enumerate(plato.ajustables):
        if plato.bloque or not _se_deja_ajustar(pieza, objetivo):
            filas.append(calcular_nutrientes(_Porcion(pieza.por_100g), pieza.gramos))
        else:
            movibles.append(j)
    return filas, movibles


def _resolver_dia(elegidos, objetivo: dict) -> list[tuple[str, PlatoCandidato, tuple[float, ...]]]:
    """Los gramos de cada plato del día, cada comida contra **su parte**.

    Cuadrar sólo el día dejaba que el desayuno se llevara lo que hiciera falta
    (990 kcal de un día de 2.000). Ahora cada comida persigue la suya
    (`repartir_por_hueco`), en dos pasos:

    1. Lo que no se mueve —un plato bloque, una comida fuera, lo que no tiene
       ningún ingrediente ajustable— se descuenta del día tal y como es.
    2. Lo que queda se reparte entre las comidas que sí se mueven, en el orden
       del día: cada una persigue su proporción de **lo que aún falta**, así que
       lo que una no alcanza —sus ingredientes topan con su banda— lo recogen
       las siguientes, y el día sigue cuadrando como cuadraba.

    Así una cena fuera de 800 kcal no la paga sólo el desayuno: la pagan las
    tres que quedan, en la medida de lo que les toca. Un nutriente que lo fijo
    no midió no se persigue en ningún hueco: perseguirlo contando como cero lo
    desconocido pondría de más justo lo que falta saber (`_dirigen`).
    """
    dia = _DiaRepartido(elegidos, objetivo)
    dia.pasada(dia.resto, sobre_lo_hecho=False)
    # Cierre: lo que el día aún no alcanza —una comida topó con su banda y las
    # anteriores ya estaban hechas— lo recogen las que tienen margen, cada una
    # en su proporción de lo que falta. Antes de esto el día cuadraba entero, y
    # repartirlo no puede costar que deje de cuadrar.
    for _ in range(_CIERRES):
        if dia.cuadrado():
            break
        dia.pasada(dict(dia.resto), sobre_lo_hecho=True)
    return dia.resueltos()


def _descontar(falta: dict, antes: dict, despues: dict) -> None:
    """Quita de `falta` lo que una comida ha cambiado. Lo que deja de saberse
    —un nutriente que la comida no midió— deja también de perseguirse."""
    for campo in list(falta):
        if despues.get(campo) is None or antes.get(campo) is None:
            del falta[campo]
        else:
            falta[campo] -= despues[campo] - antes[campo]


class _DiaRepartido:
    """El estado de `_resolver_dia`: los gramos de cada comida y lo que falta."""

    def __init__(self, elegidos, objetivo: dict):
        self.elegidos = elegidos
        self.objetivo = objetivo
        self.piezas = [_partes_del_plato(plato, objetivo) for _slot, plato in elegidos]
        self.gramos = [[pieza.gramos for pieza in plato.ajustables] for _slot, plato in elegidos]
        quietos = [i for i, (_filas, movibles) in enumerate(self.piezas) if not movibles]
        self.moviles = sorted(
            (i for i in range(len(elegidos)) if i not in quietos),
            key=lambda i: _ORDEN_DEL_DIA.get(elegidos[i][0], len(_ORDEN_DEL_DIA)),
        )
        # Lo que queda del día tras lo que no se mueve.
        self.resto = {campo: meta for campo, meta in objetivo.items() if meta is not None}
        for i in quietos:
            _descontar(self.resto, _CERO, self.hecho(i))

    def hecho(self, i: int) -> dict:
        plato = self.elegidos[i][1]
        # Un plato sin nada aporta cero, y es un número: sumar cero filas da
        # `None`, que aquí dejaría al día entero sin nada que perseguir.
        if not plato.fijo and not plato.ajustables:
            return dict(_CERO)
        return _macros_de(plato, self.gramos[i])

    def cuadrado(self) -> bool:
        meta = abs(self.objetivo.get("kcal") or 1)
        return not self.resto or abs(self.resto.get("kcal", 0.0)) <= _TOLERANCIA_KCAL * meta

    def pasada(self, falta: dict, *, sobre_lo_hecho: bool) -> None:
        """Una vuelta por las comidas que se mueven, en el orden del día.

        Cada una persigue su proporción de lo que falta repartido entre ella y
        las que vienen detrás; en el cierre, sumada a lo que ya tenía.
        """
        for n, i in enumerate(self.moviles):
            slot, plato = self.elegidos[i]
            antes = self.hecho(i)
            pendientes = [self.elegidos[k][0] for k in self.moviles[n:]]
            parte = repartir_por_hueco(falta, pendientes).get(slot, {})
            if sobre_lo_hecho:
                parte = {c: antes[c] + v for c, v in parte.items() if antes.get(c) is not None}
            filas, movibles = self.piezas[i]
            fijo, _ = sumar_nutrientes(filas) if filas else ({}, {})
            nuevos, _totales = ajustar_gramos(
                fijo, [plato.ajustables[j] for j in movibles], parte, escala=self.objetivo
            )
            for j, g in zip(movibles, nuevos):
                self.gramos[i][j] = g
            despues = self.hecho(i)
            _descontar(falta, antes if sobre_lo_hecho else _CERO, despues)
            if falta is not self.resto:
                _descontar(self.resto, antes, despues)

    def resueltos(self):
        return [(slot, plato, tuple(self.gramos[i])) for i, (slot, plato) in enumerate(self.elegidos)]


def reajustar_dia(elegidos, objetivo: dict) -> list[tuple[str, PlatoCandidato, tuple[float, ...]]]:
    """Los gramos de un día ya elegido, otra vez contra su objetivo.

    Para cuando el día cambia después de generarse —una cena fuera reservada
    (registro sin huecos, fase 4)—: lo que no se puede mover entra como
    `bloque` con su cifra en `fijo`, y lo demás se reparte el resto. Es el
    mismo ajuste que al generar, no otro.
    """
    return _resolver_dia(elegidos, objetivo)


# Pasadas al reajustar una sola comida. Arranca de lo que ya tenía y no de la
# receta, pero dos ingredientes que se pisan —el arroz también trae proteína—
# tardan más en asentarse que los seis del día entero, y una comida es barata.
_PASOS_DE_UNA_COMIDA = 30


def ajustar_comida(
    plato: PlatoCandidato, parte: dict, escala: dict, desde=None
) -> tuple[tuple[float, ...], dict]:
    """Los gramos de un solo plato contra su parte, y lo que suma con ellos.

    Para cuando una comida cambia de objetivo sin que cambie el resto del día
    —el hidrato que gana o cede al entrenar—. `escala` es el día, por lo mismo
    que en `_resolver_dia`: medido contra la parte, un gramo de más pesaría como
    un desastre. `desde` son los gramos con los que ya estaba, en el orden de
    `plato.ajustables`: se parte de ahí y no de la receta.
    """
    if desde is not None:
        plato = replace(
            plato,
            ajustables=tuple(replace(p, gramos=g) for p, g in zip(plato.ajustables, desde)),
        )
    filas, movibles = _partes_del_plato(plato, escala)
    fijo, _ = sumar_nutrientes(filas) if filas else ({}, {})
    nuevos, _totales = ajustar_gramos(
        fijo,
        [plato.ajustables[j] for j in movibles],
        parte,
        escala=escala,
        pasos=_PASOS_DE_UNA_COMIDA,
    )
    gramos = [pieza.gramos for pieza in plato.ajustables]
    for j, g in zip(movibles, nuevos):
        gramos[j] = g
    return tuple(gramos), _macros_de(plato, gramos)


def _dia_para_reglas(fecha: date, resueltos, entrenado: bool) -> rules.Dia:
    comidas = []
    filas = []
    metodos = []
    for slot, plato, gramos in resueltos:
        macros = _macros_de(plato, gramos)
        filas.append(macros)
        comidas.append(rules.Comida(slot=slot, familias=plato.familias, kcal=macros.get("kcal")))
        if plato.metodo:
            metodos.append(plato.metodo)
    totales, _ = sumar_nutrientes(filas)
    return rules.Dia(
        fecha=fecha,
        entrenado=entrenado,
        macros=totales,
        comidas=tuple(comidas),
        metodos=tuple(metodos),
    )


# --- la semana ----------------------------------------------------------------
def _una_semana(
    *,
    dias,
    huecos,
    candidatos,
    reglas,
    objetivos,
    historial,
    entrenos,
    rng,
    enfriamiento,
    exploracion,
    fijados,
):
    inicio = dias[0]
    usados: dict[int, date] = {}
    por_id = {p.id: p for p in candidatos}
    por_dia = []
    for fecha in dias:
        objetivo = objetivos.get(fecha, {})
        elegidos: list[tuple[str, PlatoCandidato]] = []
        hoy = set()
        for slot in huecos:
            # Lo que fija la pauta no se elige: ni reglas de hueco, ni
            # enfriamiento, ni memoria. Lo dijo el nutricionista. Sólo las
            # cantidades siguen siendo de aquí (`_resolver_dia`).
            fijo = por_id.get(fijados.get((fecha.weekday(), slot)))
            if fijo is not None:
                usados[fijo.id] = fecha
                hoy.add(fijo.id)
                elegidos.append((slot, fijo))
                continue
            opciones = [p for p in candidatos if _cabe(p, slot, fecha, objetivo, reglas)]
            disponibles = [p for p in opciones if p.id not in hoy]
            if not disponibles:
                return None, slot
            # Escalera: lo fresco y sin gastar primero; el enfriamiento y la
            # memoria ceden antes que el plan. Preferir un plan con
            # repeticiones a no dar plan es la misma decisión de `repertoire.py`.
            frescos = [p for p in disponibles if _frio(p, fecha, usados, enfriamiento)]
            preferidos = [p for p in frescos if not _gastado(p, inicio, historial)]
            elegido = _elegir(preferidos or frescos or disponibles, rng, exploracion)
            usados[elegido.id] = fecha
            hoy.add(elegido.id)
            elegidos.append((slot, elegido))
        por_dia.append((fecha, _resolver_dia(elegidos, objetivo)))
    return por_dia, None


def _distancia(dia: rules.Dia, objetivo: dict) -> float:
    """Cuánto se aleja el día de su objetivo, normalizado por el propio objetivo.

    Un macro sin objetivo no suma distancia, y uno cuyo total es desconocido
    tampoco: no se puede medir la distancia a un sitio que no se sabe dónde está.
    """
    total = 0.0
    for campo, meta in objetivo.items():
        if meta in (None, 0):
            continue
        valor = dia.macros.get(campo)
        if valor is None:
            continue
        total += abs(valor - meta) / abs(meta)
    return total


def _fold(veredictos: list[rules.Veredicto]) -> rules.Veredicto:
    """Los juicios de una misma regla a lo largo de la semana, en uno.

    Siete veredictos idénticos no dicen más que uno, y como `Veredicto` no lleva
    fecha, repetirlos sólo haría la lista más larga. Lo roto manda sobre lo
    desconocido, y lo desconocido sobre lo cumplido.
    """
    rotos = [v for v in veredictos if v.state == "broken"]
    if rotos:
        peor = max(rotos, key=lambda v: abs(v.short_by or 0))
        dias = len(rotos)
        return rules.Veredicto(
            rule_id=peor.rule_id,
            type=peor.type,
            hardness=peor.hardness,
            state="broken",
            short_by=peor.short_by,
            unclassified=peor.unclassified,
            detail=f"{dias} días" if dias > 1 else peor.detail,
        )
    dudosos = [v for v in veredictos if v.state == "unknown"]
    if dudosos:
        return rules.Veredicto(
            rule_id=dudosos[0].rule_id,
            type=dudosos[0].type,
            hardness=dudosos[0].hardness,
            state="unknown",
            unclassified=sum(v.unclassified for v in dudosos),
            detail=dudosos[0].detail,
        )
    return veredictos[0]


def _juzgar(semana: list[rules.Dia], reglas, kg) -> list[rules.Veredicto]:
    """Un veredicto por regla sobre la semana entera."""
    por_regla: dict[int, list[rules.Veredicto]] = {}
    for dia in semana:
        ctx = rules.Contexto(dia=dia, semana=tuple(semana), kg=kg)
        semanales = [r for r in reglas if r.get("scope") == "week"]
        diarias = [r for r in reglas if r.get("scope") != "week"]
        juzgadas = semanales if dia is semana[-1] else []
        for regla, veredicto in zip(diarias + juzgadas, rules.evaluar(diarias + juzgadas, ctx)):
            if veredicto.state == "n_a":
                continue
            por_regla.setdefault(id(regla), []).append(veredicto)
    return [_fold(v) for v in por_regla.values()]


def _coste(veredictos, distancia: float) -> float:
    duras = sum(1 for v in veredictos if v.hardness == "hard" and v.state == "broken")
    blandas = sum(1 for v in veredictos if v.hardness == "soft" and v.state == "broken")
    return _PESO_DURA * duras + _PESO_BLANDA * blandas + distancia


def generar(
    *,
    dias,
    candidatos,
    objetivos=None,
    reglas=(),
    huecos=HUECOS,
    entrenos=frozenset(),
    historial=None,
    kg=None,
    seed: int = 0,
    reinicios: int = REINICIOS,
    enfriamiento: int = ENFRIAMIENTO,
    exploracion: float = EXPLORACION,
    fijados=None,
) -> Plan:
    """La mejor de `reinicios` semanas, con la semilla por delante.

    Determinista: los mismos argumentos y la misma semilla dan el mismo plan.
    Levanta `PlanImposible` cuando ningún reinicio consigue llenar un hueco, y
    dice cuál.

    `fijados` es la pauta: `{(día de la semana, hueco): dish_id}`. Esos huecos
    llevan ese plato; el resto se elige como siempre.
    """
    fijados = dict(fijados or {})
    dias = tuple(dias)
    candidatos = list(candidatos)
    objetivos = dict(objetivos or {})
    historial = dict(historial or {})
    reglas = list(reglas)
    if not dias:
        raise PlanImposible("semana", "no hay días que planificar")

    mejor: Plan | None = None
    fallos: Counter = Counter()
    for intento in range(max(1, reinicios)):
        rng = random.Random(seed * 1000 + intento)
        por_dia, fallo = _una_semana(
            dias=dias,
            huecos=huecos,
            candidatos=candidatos,
            reglas=reglas,
            objetivos=objetivos,
            historial=historial,
            entrenos=entrenos,
            rng=rng,
            enfriamiento=enfriamiento,
            exploracion=exploracion,
            fijados=fijados,
        )
        if por_dia is None:
            fallos[fallo] += 1
            continue

        semana = [
            _dia_para_reglas(fecha, resueltos, fecha in entrenos) for fecha, resueltos in por_dia
        ]
        veredictos = _juzgar(semana, reglas, kg)
        distancia = sum(_distancia(dia, objetivos.get(dia.fecha, {})) for dia in semana)
        coste = _coste(veredictos, distancia)
        entradas = tuple(
            Entrada(
                fecha=fecha,
                slot=slot,
                dish_id=plato.id,
                gramos=gramos,
                kcal=_macros_de(plato, gramos).get("kcal"),
            )
            for fecha, resueltos in por_dia
            for slot, plato, gramos in resueltos
        )
        plan = Plan(
            seed=seed,
            entradas=entradas,
            veredictos=tuple(veredictos),
            puntuacion=round(coste, 3),
        )
        if mejor is None or plan.puntuacion < mejor.puntuacion:
            mejor = plan

    if mejor is None:
        slot, _ = fallos.most_common(1)[0]
        raise PlanImposible(slot)
    return mejor
