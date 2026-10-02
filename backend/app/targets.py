"""De qué quieres que le pase a tu cuerpo a cuántas kcal tocan hoy.

Tres capas, y ésta es la de en medio: **objetivo → derivación → reglas**. Aquí
sólo salen kcal. El reparto en macros es de las reglas, que es otra cosa y otro
módulo: una cosa es cuánto comes y otra cómo lo repartes.

Dos formas de llegar al número, y la diferencia entre ellas es grande:

- **Por fórmula** (Mifflin-St Jeor). Necesita peso, altura, edad, sexo y un
  factor de actividad. Da un número con pinta de exacto y un error de un par de
  cientos de kcal con facilidad — el factor de actividad es un dedo al viento
  con decimales. Sirve para arrancar y para nada más.
- **Midiéndolo en tus datos.** Tu gasto real es lo que comiste de media,
  corregido por lo que se movió el peso. Es mucho más fiable que cualquier
  fórmula, y **sólo lo puede hacer una app que tenga las dos cosas**.

La medición manda en cuanto hay con qué, y el resultado dice de cuál de las dos
salió. Presentar una estimación con la misma tinta que una medición es la clase
de mentira tranquila que esta app evita en todo lo demás.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Cuánta energía hay en un kilo de peso corporal. Es el número que convierte
# «he bajado un kilo» en «he comido 7.700 kcal menos de las que gasté».
# Aproximación clásica del tejido graso; con cambios de agua de por medio, la
# ventana larga es lo que la hace utilizable.
KCAL_PER_KG = 7700.0

# Por debajo de esto no se propone nada, se diga lo que se diga en el objetivo.
# No es prescribir: es negarse a escribir en pantalla una cifra que sale de
# multiplicar mal un ritmo de bajada. Y se dice cuando pasa, no se hace callando.
MIN_KCAL = 1200.0

# Cuántos días de registro hacen falta para creerse una medición. Menos que esto
# y lo que se está midiendo es el agua de la semana, no el gasto.
MIN_DAYS = 14

# El factor de actividad, elegido por lo que la app **ya sabe**: cuántos días
# entrenas por semana. Es la escalera clásica de Harris-Benedict. Sigue siendo
# una estimación —por eso la medición la sustituye en cuanto puede—, pero al
# menos no se la inventa quien rellena el formulario.
def factor_actividad(dias_por_semana: float) -> float:
    if dias_por_semana <= 0:
        return 1.2
    if dias_por_semana <= 3:
        return 1.375
    if dias_por_semana <= 5:
        return 1.55
    return 1.725


@dataclass(frozen=True)
class Gasto:
    """Lo que gastas al día, y de dónde ha salido ese número."""

    kcal: float | None
    # 'measured' | 'formula' | None cuando no hay ninguna de las dos.
    source: str | None = None
    # Sobre cuántos días se midió. 0 en la fórmula: no se midió nada.
    days: int = 0
    # Qué falta para poder calcularlo, por su nombre. Vacío cuando sí se pudo.
    missing: list[str] = field(default_factory=list)
    # Cuando la actividad se contó en vez de adivinarse: la media de pasos y lo
    # que cuestan al día tus sesiones. `None` cuando se usó la escalera.
    steps_per_day: int | None = None
    training_kcal_per_day: int | None = None


# Con pasos, la actividad deja de adivinarse: se parte del basal sedentario y se
# suma lo que se ha contado.
SEDENTARIO = 1.2

# Lo que cuesta un paso, por kilo de peso: ~0,04 kcal por paso a 80 kg. Lo que
# pesas es lo que se mueve, así que escala con el peso.
KCAL_PASO_KG = 0.0005

# Cuántos días con pasos hacen falta para creerse una media. Tres días de
# vacaciones andando no son tu semana.
MIN_DIAS_PASOS = 7

# Lo que cuesta una hora de pesas por encima de estar sentado: 5 MET de un
# entreno de fuerza moderado menos el 1 del reposo, que ya está en el basal.
MET_NETO_ENTRENO = 4.0


def kcal_entreno(*, kg: float, horas: float) -> float:
    """Lo que cuesta entrenar `horas`, por encima del reposo."""
    return MET_NETO_ENTRENO * kg * horas


def mifflin(*, sex: str, kg: float, cm: float, age: int) -> float:
    """El metabolismo basal según Mifflin-St Jeor, en kcal/día."""
    base = 10.0 * kg + 6.25 * cm - 5.0 * age
    return base + (5.0 if sex == "male" else -161.0)


def gasto_por_formula(
    *,
    sex,
    kg,
    cm,
    age,
    dias_entreno: float,
    pasos_por_dia: list[int] | None = None,
    entreno_kcal_dia: float = 0.0,
) -> Gasto:
    """El gasto estimado, o qué falta para poder estimarlo.

    Con al menos `MIN_DIAS_PASOS` días de pasos, la actividad se cuenta: basal
    sedentario + lo que cuestan tus pasos + lo que cuestan tus sesiones. Sin
    ellos, la escalera por días de entreno.
    """
    faltan = [
        nombre
        for nombre, valor in (("peso", kg), ("altura", cm), ("edad", age), ("sexo", sex))
        if valor in (None, "")
    ]
    if faltan:
        return Gasto(kcal=None, source=None, missing=faltan)
    basal = mifflin(sex=sex, kg=kg, cm=cm, age=age)
    if pasos_por_dia and len(pasos_por_dia) >= MIN_DIAS_PASOS:
        media = sum(pasos_por_dia) / len(pasos_por_dia)
        kcal = basal * SEDENTARIO + media * KCAL_PASO_KG * kg + entreno_kcal_dia
        return Gasto(
            kcal=round(kcal, 0),
            source="formula",
            steps_per_day=round(media),
            training_kcal_per_day=round(entreno_kcal_dia),
        )
    return Gasto(kcal=round(basal * factor_actividad(dias_entreno), 0), source="formula")


def gasto_medido(*, kcal_por_dia: list[float], dias: int, delta_kg: float | None) -> Gasto | None:
    """Tu gasto real: lo que comiste de media, corregido por lo que se movió el peso.

    `None` cuando no hay con qué — y eso es una respuesta, no un hueco que
    rellenar con la fórmula sin decirlo. Quien llama decide si cae a la
    estimación, pero el resultado va a decir de cuál de las dos salió.

    Si subiste de peso comiendo 2.600, tu mantenimiento está por debajo de
    2.600; si bajaste, por encima. Eso es todo lo que hace la corrección.
    """
    if delta_kg is None or dias < MIN_DAYS or len(kcal_por_dia) < MIN_DAYS:
        return None
    media = sum(kcal_por_dia) / len(kcal_por_dia)
    ajuste = (delta_kg * KCAL_PER_KG) / dias
    return Gasto(kcal=round(media - ajuste, 0), source="measured", days=dias)


@dataclass(frozen=True)
class Propuesta:
    """Lo que la app propone comer hoy. Todavía no es tu objetivo."""

    kcal: float | None
    source: str | None
    days: int = 0
    missing: list[str] = field(default_factory=list)
    steps_per_day: int | None = None
    training_kcal_per_day: int | None = None
    # Si hubo que subir la cifra hasta el suelo. Se dice: una propuesta
    # recortada en silencio es una propuesta que no es lo que pediste.
    floored: bool = False
    # El gasto del que sale `kcal`, antes de aplicar el ritmo. `None` sin gasto.
    expenditure: float | None = None


def proponer(gasto: Gasto, *, goal: str, rate_kg_week: float | None) -> Propuesta:
    """Del gasto al objetivo, según lo que quieras que pase.

    `rate_kg_week` es cuánto quieres moverte por semana; se reparte entre siete
    días y se convierte en kcal con `KCAL_PER_KG`.
    """
    if gasto.kcal is None:
        return Propuesta(kcal=None, source=None, missing=list(gasto.missing))

    rate = abs(rate_kg_week or 0.0)
    diario = (rate * KCAL_PER_KG) / 7.0
    if goal == "cut":
        objetivo = gasto.kcal - diario
    elif goal == "gain":
        objetivo = gasto.kcal + diario
    else:
        objetivo = gasto.kcal

    floored = objetivo < MIN_KCAL
    return Propuesta(
        kcal=round(max(objetivo, MIN_KCAL), 0),
        source=gasto.source,
        days=gasto.days,
        steps_per_day=gasto.steps_per_day,
        training_kcal_per_day=gasto.training_kcal_per_day,
        floored=floored,
        expenditure=round(gasto.kcal, 0),
    )
