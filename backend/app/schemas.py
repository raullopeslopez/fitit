# Aliased so a model field named `date` doesn't shadow the `date` type.
from datetime import date as Date
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .auth import BCRYPT_MAX_BYTES

# Weights are kilos and distances kilometres, everywhere, with no alternative to
# name — so there are no unit types here any more. See DESIGN.md (2026-07-25).
# How an exercise is measured: strength (weight × reps) or cardio (duration + distance).
Kind = Literal["strength", "cardio"]


class ExerciseIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=120)
    muscle_group: str | None = Field(default=None, max_length=60)
    kind: Kind = "strength"


class ExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    muscle_group: str | None = None
    kind: str = "strength"
    # A standing note about the lift itself, shown on the card every session.
    note: str | None = None
    # How many sets are already logged against this exercise. The muscle group
    # lives here, not on the set, so re-tagging re-buckets all of them at once —
    # the client needs the number to say so before it happens, and the card you
    # re-tag from doesn't hold the log to count it itself.
    set_count: int = 0


class ExercisePatch(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    # muscle_group None clears the override, reverting to the auto-classifier.
    muscle_group: str | None = Field(default=None, max_length=60)
    # A new display name. Renaming is in place, so past sets follow (they
    # reference the exercise by id). Omitted leaves the name untouched.
    name: str | None = Field(default=None, min_length=1, max_length=120)
    # The standing note. Omitted leaves it untouched; null (or an empty string,
    # which is what clearing the input actually sends) erases it.
    note: str | None = Field(default=None, max_length=200)


class ExerciseMerge(BaseModel):
    """Fold this exercise into another one: its sets move, then it is deleted.

    The way out of a name typed wrong mid-session ("Fondo" beside "Fondos"),
    which renaming can't fix — the target name is already taken, which is the
    whole point.
    """

    into_id: int


class NameClash(BaseModel):
    """The exercise already holding the name a rename asked for.

    Everything the client needs to name the collision and price the way out of
    it, without going back to the server or rescanning a list that may not even
    contain the row. `set_count` counts the same thing `ExerciseOut.set_count`
    counts, so "moverías 137 series" is a number the user has already seen.
    `kind` is here because merging across kinds is itself refused — a client
    that knows both kinds up front can offer renaming instead of a merge the
    server is certain to reject.
    """

    id: int
    name: str  # as stored, not as typed
    kind: str
    set_count: int


class NameTaken(BaseModel):
    """The body of the 409 a rename gets when the name is already yours.

    `detail` used to be a bare string here. It is an object now, and `message`
    is that string: a client with no branch for this case can still show
    something, and one that has a branch reads `exercise` and offers the merge.
    """

    code: Literal["name_taken"] = "name_taken"
    message: str
    exercise: NameClash


class NameTakenError(BaseModel):
    """The envelope FastAPI wraps a raised detail in — declared so the 409 shows
    up in the schema as the shape it actually is."""

    detail: NameTaken


class SetIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    exercise_name: str = Field(min_length=1, max_length=120)
    # `kind` only matters when logging to a brand-new exercise; the router
    # resolves the effective kind and validates the metrics below against it.
    kind: Kind | None = None
    # Strength metrics (required for strength, absent for cardio).
    reps: int | None = Field(default=None, ge=1, le=1000)
    # Kilos, and optional even for strength: null is a set carrying no weight
    # (dominadas, fondos), which is not the same as a 0 someone typed.
    weight: float | None = Field(default=None, ge=0, le=1000)
    rpe: float | None = Field(default=None, ge=1, le=10)  # perceived exertion
    note: str | None = Field(default=None, max_length=280)
    # Cardio metrics (duration required for cardio, distance optional).
    duration_seconds: int | None = Field(default=None, ge=1, le=86400)
    distance: float | None = Field(default=None, ge=0, le=100000)  # kilometres
    # When the set was actually done, sent by the client. A set logged in a
    # basement sits in the outbox until the phone finds a network, so arrival
    # time answers a different question — and it is the one a session's length
    # gets measured from. Optional: an older client still logs sets, they just
    # stamp on arrival. Only honoured on create; correcting a set's reps has no
    # business moving it in time.
    # Spec: tests/features/set_moment.feature
    performed_at: datetime | None = None


class SetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise_id: int
    exercise_name: str
    kind: str = "strength"
    # The exercise's group, carried on the set so the per-muscle views can read
    # everything they need from /days. Null when the name isn't recognizable.
    muscle_group: str | None = None
    # What the lift trains on the way past — a bench press's triceps and front
    # delt. Half a set each downstream; the primary above is never in here.
    # Spec: tests/features/secondary_muscles.feature
    secondary_groups: list[str] = []
    set_index: int
    reps: int | None = None
    weight: float | None = None  # kilos
    rpe: float | None = None
    note: str | None = None
    duration_seconds: int | None = None
    distance: float | None = None  # kilometres
    created_at: datetime | None = None


class WorkoutIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, max_length=80)
    date: Date | None = None  # the training day; defaults to today when omitted


class WorkoutPatch(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, max_length=80)


class WorkoutOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: Date  # the day this workout belongs to
    name: str | None = None
    sets: list[SetOut] = []
    # How long the session took, derived from the sets' own moments — never
    # stored, so correcting or deleting a set can't leave a stale total behind.
    # None when there is nothing honest to say: a single set has no span, and a
    # session typed in days later times the typing.
    # Spec: tests/features/session_length.feature
    duration_seconds: int | None = None


class DayOut(BaseModel):
    id: int
    date: Date
    workouts: list[WorkoutOut] = []


class HistoryPoint(BaseModel):
    date: Date
    one_rm: float


class BestMark(BaseModel):
    """The single best set for one exercise, and how far it moved the record.

    `delta_one_rm` is the gap to the previous best, so a mark set today reads
    differently from one that has stood for months. None means nothing to
    compare against: a first-ever mark, or a record nothing has since beaten.

    `weight` is kilos, like every weight in the app.
    Spec: tests/features/best_marks.feature
    """

    exercise_id: int
    exercise_name: str
    muscle_group: str | None = None
    reps: int
    weight: float
    one_rm: float
    delta_one_rm: float | None = None


class RepMark(BaseModel):
    """The most weight ever moved at one rep count. Kilos, like every weight here."""

    reps: int
    weight: float


class PreviousMarks(BaseModel):
    exercise_name: str
    found: bool = False
    sets: list[SetOut] = []
    best_one_rm: float | None = None  # best estimated 1RM (Epley) across all sets
    # The bar a set has to clear to be a record, one entry per rep count ever
    # done. Deliberately not a single number: a record is "more than I ever did
    # at these reps or more", and collapsing the history into one estimated 1RM
    # lets a heavy double stand in front of every rep record you might set.
    # Empty when the lift has no history — then the first set is a baseline,
    # not an achievement.
    best_by_reps: list[RepMark] = []
    # The day those sets were trained. Not derivable from `sets[*].created_at`:
    # that is when the row was written, and a session logged on another date
    # ("Otra fecha", or a set added the next morning) makes the two disagree.
    # The card prints "Última vez · hace 3 días" off this, so it has to be the
    # day I trained. None when the lift has no history.
    last_date: Date | None = None
    kind: str | None = None  # the exercise's kind, or None if it doesn't exist yet


class RecentMuscle(BaseModel):
    """A muscle group trained inside the recovery window, and the day it was."""

    group: str
    last_date: Date


class LoginIn(BaseModel):
    username: str
    password: str


class RegisterIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8)

    @field_validator("password")
    @classmethod
    def _fits_bcrypt(cls, value: str) -> str:
        """bcrypt's ceiling is 72 bytes, not 72 characters — and in Spanish
        every accent costs two. Say so at sign-up rather than quietly hashing
        a prefix, which would let a different password open the account."""
        if len(value.encode()) > BCRYPT_MAX_BYTES:
            raise ValueError(
                f"la contraseña no puede superar {BCRYPT_MAX_BYTES} bytes "
                "(las tildes y la ñ cuentan doble)"
            )
        return value


class GoogleCredentialIn(BaseModel):
    """The ID token Google Identity Services hands the page, verbatim.

    Named `credential` because that is what Google calls it in the callback,
    and a field renamed in transit is a field somebody mismatches later.
    """

    credential: str = Field(min_length=1)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    # `None` es «todavía no lo has fijado», no cero: la misma distinción que
    # `foods.kcal_100g`, aplicada a un objetivo en vez de a una medida.
    objetivo_kcal: float | None = None
    objetivo_proteina: float | None = None
    objetivo_grasa: float | None = None
    objetivo_hidratos: float | None = None


class UserTargetsIn(BaseModel):
    """El objetivo diario, fijo por usuario. Manda los tres campos siempre —
    nunca un PATCH parcial — porque `None` aquí es una instrucción («bórralo»),
    no «no lo toques», y esas dos cosas no se pueden distinguir con un campo
    opcional que se omite.

    **Las kcal no están aquí a propósito**: son consecuencia del reparto, no una
    entrada. Fijarlas aparte dejaba guardar un total que sus propios macros no
    daban —2.600 con 160/300/80, que son 2.560— y dos cifras contradictorias en
    pantalla sin nada que dijera cuál manda. El servidor las deriva con
    `atwater_kcal`, los mismos factores con los que comprueba una etiqueta."""

    objetivo_proteina: float | None = Field(default=None, gt=0, le=1000)
    objetivo_grasa: float | None = Field(default=None, gt=0, le=1000)
    objetivo_hidratos: float | None = Field(default=None, gt=0, le=2000)


# ---------------------------------------------------------------------------
# Comida
#
# Every nutrient field below is `float | None` and none of them defaults to 0.
# Null means "nobody measured this", and the difference survives all the way to
# the screen: the day card prints a dash where a total is unknown, never a zero.
# ---------------------------------------------------------------------------

# When you ate it. Free-form would make "¿qué desayuno suelo hacer?" unanswerable.
MealSlot = Literal["desayuno", "comida", "cena", "snack"]
# How the entry got into the diary. 'manual' is all phase 1 writes; the rest are
# reserved for the barcode scanner, templates and the voice parser, and exist
# from the start so their adoption is measurable rather than remembered.
EntrySource = Literal["manual", "barcode", "template", "repeat", "voice"]


class PortionIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    label: str = Field(min_length=1, max_length=60)
    grams: float = Field(gt=0, le=5000)
    is_default: bool = False


class PortionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    grams: float
    is_default: bool = False


class FoodIn(BaseModel):
    """Creating a food by hand — the bakery's bread, your mother's piquillos.

    Nothing here is required beyond the name. A food you only know the calories
    of is still worth having; forcing a number for every macro would mean typing
    zeros that read as measurements.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=160)
    brand: str | None = Field(default=None, max_length=120)
    kcal_100g: float | None = Field(default=None, ge=0, le=1000)
    protein_100g: float | None = Field(default=None, ge=0, le=100)
    fat_100g: float | None = Field(default=None, ge=0, le=100)
    carbs_100g: float | None = Field(default=None, ge=0, le=100)
    fiber_100g: float | None = Field(default=None, ge=0, le=100)
    portions: list[PortionIn] = Field(default_factory=list, max_length=8)
    # El código que traía el escaneo, para que la segunda vez no haya que
    # preguntarle a nadie. Sólo llega desde un formulario que alguien confirmó:
    # escanear no da de alta nada por su cuenta.
    barcode: str | None = Field(default=None, max_length=14)

    @field_validator("brand")
    @classmethod
    def _blank_brand_is_none(cls, value: str | None) -> str | None:
        # An untouched input sends "", which is not a brand.
        return value or None


class FoodPatch(BaseModel):
    """Correcting a food you created. Never touches anything already logged."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=160)
    brand: str | None = Field(default=None, max_length=120)
    kcal_100g: float | None = Field(default=None, ge=0, le=1000)
    protein_100g: float | None = Field(default=None, ge=0, le=100)
    fat_100g: float | None = Field(default=None, ge=0, le=100)
    carbs_100g: float | None = Field(default=None, ge=0, le=100)
    fiber_100g: float | None = Field(default=None, ge=0, le=100)
    # Un EAN mal tecleado no tenía arreglo: se escribía al dar de alta y ya no
    # se tocaba. `null` lo borra, que es lo que quieres cuando el que pusiste
    # era de otro producto.
    barcode: str | None = Field(default=None, max_length=14)
    # La lista entera sustituye a la que hubiera. Reemplazar y no parchear
    # porque una ración no tiene identidad que preservar —el diario guarda los
    # gramos ya resueltos, nunca un puntero a la ración— así que rehacerlas no
    # puede desfechar nada. Omitido las deja como estén; `[]` las quita todas.
    portions: list[PortionIn] | None = Field(default=None, max_length=8)


class BarcodeClash(BaseModel):
    """El alimento tuyo que ya lleva el código que un alta acaba de traer."""

    id: int
    name: str
    brand: str | None = None


class BarcodeTaken(BaseModel):
    """El cuerpo del 409 cuando das de alta un código que ya tienes.

    Mismo trato que el 409 del renombrado de ejercicios: un objeto y no una
    cadena, porque el número por sí solo no deja hacer nada. Con el código ya
    puesto, lo que hace falta saber es **cuál** es el alimento que lo lleva —
    casi siempre uno que creaste sin enterarte, de un doble toque en Guardar—,
    y eso el cliente no puede averiguarlo: la búsqueda va por nombre, no por
    código, y el alimento que choca puede no estar en ninguna lista cargada.
    """

    message: str
    food: BarcodeClash


class BarcodeTakenError(BaseModel):
    """El sobre en que FastAPI envuelve el detalle, para que el 409 aparezca en
    el esquema con su forma (mismo motivo que `NameTakenError`)."""

    detail: BarcodeTaken


class FoodOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    brand: str | None = None
    source: str = "manual"
    carb_convention: str = "available"
    kcal_100g: float | None = None
    protein_100g: float | None = None
    fat_100g: float | None = None
    carbs_100g: float | None = None
    fiber_100g: float | None = None
    # El código del envase, cuando lo tiene. Sin él la pantalla no puede
    # enseñarlo, ni dejar corregirlo, ni distinguir un alimento escaneado de
    # uno tecleado a mano.
    barcode: str | None = None
    portions: list[PortionOut] = Field(default_factory=list)
    # True when this row is yours to correct. The shared CIQUAL catalogue is
    # reference data: the screen offers "Corregir" only where it would work.
    is_mine: bool = False


class FrequentFoodOut(BaseModel):
    """Un alimento del repertorio: lo que sueles comer, con la cantidad y la
    comida a la que suele ir.

    `kcal` es una **previsión** de la entrada que se escribiría al tocarlo, no
    una cifra congelada: se calcula desde el alimento de hoy, igual que la
    calculará `POST /food-log`. Nada de esto toca `log_entries`.
    """

    food_id: int
    name: str
    brand: str | None = None
    grams: float
    kcal: float | None = None
    meal_slot: str | None = None
    times: int


class LogEntryIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    food_id: int
    # Either weigh it or name a portion of it. Exactly one — a request carrying
    # both is two different amounts, and guessing which one was meant is how a
    # diary gets quietly wrong.
    grams: float | None = Field(default=None, gt=0, le=5000)
    portion_id: int | None = None
    quantity: float = Field(default=1, gt=0, le=100)  # "dos rebanadas"
    meal_slot: MealSlot | None = None
    # The instant, with the offset the phone is on. Absent means now.
    logged_at: datetime | None = None
    entry_source: EntrySource = "manual"

    @field_validator("portion_id")
    @classmethod
    def _one_amount_only(cls, value: int | None, info) -> int | None:
        if value is not None and info.data.get("grams") is not None:
            raise ValueError("send grams or portion_id, not both")
        return value


class LogEntryPatch(BaseModel):
    """Re-weigh, re-slot or re-date an entry. The nutrients ride along, rescaled
    from what was frozen — never re-read from the food, which may have been
    corrected since."""

    grams: float | None = Field(default=None, gt=0, le=5000)
    meal_slot: MealSlot | None = None
    # El instante, con el offset del móvil, igual que al crearla: es lo que
    # decide el día alimentario, y sin esto una entrada fechada en el día que
    # no era sólo se arreglaba borrándola y volviéndola a escribir.
    logged_at: datetime | None = None


class RecomputeIn(BaseModel):
    """Volver a aplicar un alimento corregido a lo registrado de un solo día."""

    food_id: int
    date: Date


class RecomputeOut(BaseModel):
    """Cuántas entradas se rehicieron. La pantalla lo dice antes de hacerlo y lo
    confirma después: un acto que reescribe el diario no puede terminar en
    silencio."""

    updated: int


class LogEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    logged_at: datetime
    log_date: Date
    meal_slot: str | None = None
    food_id: int | None = None
    food_name: str
    grams: float
    kcal: float | None = None
    protein: float | None = None
    fat: float | None = None
    carbs: float | None = None
    fiber: float | None = None
    entry_source: str = "manual"


class SlotTotalsOut(BaseModel):
    """Lo que suma una comida por su cuenta.

    Mismas reglas que el día entero, aplicadas a un trozo: un nutriente que a
    alguna entrada le falta sale `null`, y una comida en la que no hay nada
    suma `null` y no 0 — no has comido cero calorías en el almuerzo, es que
    todavía no has almorzado.
    """

    slot: MealSlot | None = None
    totals: dict[str, float | None]
    unknown: dict[str, int]


class FoodDayOut(BaseModel):
    """One food day: what was eaten, what it adds up to, and what it can't.

    `totals[n]` is null whenever any entry is missing that nutrient, and
    `unknown[n]` says how many were — so the screen can print "1.840 kcal" and
    "— · 3 sin fibra" instead of a total that quietly counts unknowns as zero.

    `by_slot` trae las cinco comidas **siempre**, tengan algo o no, y en el
    orden en que se comen. Que salgan todas es lo que deja a la pantalla
    dibujar un raíl vacío sin inventarse un total: la aritmética nutricional
    vive entera en `app/nutrition.py`, y sumar por comida en el cliente sería
    una segunda implementación de la regla de los nulos.
    """

    date: Date
    entries: list[LogEntryOut]
    totals: dict[str, float | None]
    unknown: dict[str, int]
    by_slot: list[SlotTotalsOut] = Field(default_factory=list)
    # El objetivo del perfil, tal cual — `None` si el usuario no lo ha fijado
    # todavía — y lo que queda de él, ya restado en el servidor por la misma
    # razón que los subtotales: para que la pantalla no reimplemente la regla
    # de los nulos (`restante`, en `nutrition.py`).
    target_kcal: float | None = None
    target_protein: float | None = None
    target_fat: float | None = None
    target_carbs: float | None = None
    remaining_kcal: float | None = None
    # Lo que falta de cada macro, restado aquí y no en la pantalla. La resta
    # tiene una regla de nulos (`restante`), la regla vive en `nutrition.py`, y
    # la cabecera de Comida imprime tres de estos números — el héroe de la
    # pantalla es lo que falta de proteína. Una segunda implementación de la
    # regla estaría, precisamente, en la cifra más grande que se lee.
    remaining_protein: float | None = None
    remaining_fat: float | None = None
    remaining_carbs: float | None = None
    # Si este servidor sabe leer una etiqueta, dicho **antes** de disparar.
    #
    # Vive en el día porque es donde la pantalla ya mira, y la cámara que este
    # booleano apaga vive dentro de esa misma pantalla. Sin él sólo se sabe
    # disparando —un 503 después de la foto—, que es enterarse de que el botón
    # no podía funcionar justo cuando ya has apuntado al envase.
    label_reading: bool = False


# Las kilocalorías declaradas y las que salen de los macros, cuando no
# coinciden. Es la única defensa contra un dígito mal leído: la fila existe, el
# número es plausible y la columna es la correcta, así que ningún otro filtro lo
# ve — pero las cifras de una etiqueta no son independientes, y romper esa
# igualdad delata la que se leyó mal.
class KcalMismatch(BaseModel):
    declared: float
    computed: float


# La etiqueta leída de una foto: una **propuesta** para el formulario de alta,
# nunca un alimento. Todo es opcional porque la mitad de las veces la foto sólo
# contesta a la mitad de las preguntas, y media respuesta sigue ahorrando
# trabajo.
class LabelReadOut(BaseModel):
    name: str | None = None
    brand: str | None = None
    # La cabecera de la que salieron los números, literal. Va a la pantalla: una
    # cifra que no dice de dónde viene no se puede confirmar, sólo aceptar.
    column_header: str | None = None
    # '100g' o '100ml'. La pantalla lo dice en tinta cuando es lo segundo: los
    # números se guardan tal cual, sin convertir, y quien confirma tiene que
    # saber de qué unidad salen antes de pulsar guardar.
    per: Literal["100g", "100ml"] | None = None
    # La tabla tal y como el modelo dice haberla transcrito, línea a línea. Es
    # lo único que contesta a «¿qué ha leído?» sin tener que creerse el
    # veredicto: con las filas delante se ve de un vistazo si leyó bien y el
    # backend descartó, o si leyó mal desde el principio.
    rows: list[str] = Field(default_factory=list)
    # Cuando las kcal y los macros no dan lo mismo. No se rechaza la lectura por
    # esto —el producto puede llevar polioles, o la etiqueta redondear raro—,
    # pero sí se dice: es lo que convierte confirmar en comprobar.
    mismatch: KcalMismatch | None = None
    # Las cinco claves siempre, con `None` donde no se sabe. Un nutriente que
    # falte del diccionario y uno que valga `None` significan lo mismo, y tener
    # una sola forma de decirlo evita que la pantalla los trate distinto.
    nutrients: dict[str, float | None] = Field(default_factory=dict)
    # Cifras que el modelo mandó y el backend tiró por no venir respaldadas por
    # ninguna fila transcrita. La pantalla las nombra: el hueco no puede
    # confundirse con "la etiqueta no lo declara".
    dropped: list[str] = Field(default_factory=list)
    # Por qué no hay lectura utilizable, cuando no la hay.
    #   'column'     — se leyó, pero de una columna que no es por 100 g
    #   'unreadable' — no hubo respuesta del modelo, o no se entendió
    #   'quota'      — no quedan peticiones; ver `quota_scope`
    refusal: Literal["column", "unreadable", "quota"] | None = None
    # 'minute' se pasa esperando; 'day' no se pasa hasta mañana. Separadas
    # porque mandar a esperar un minuto a quien tiene que volver mañana es un
    # minuto mirando el móvil para nada.
    quota_scope: Literal["minute", "day"] | None = None
    # La cabecera rechazada, para poder decir en pantalla cuál era.
    refused_column: str | None = None


# Un código de barras resuelto. Tres finales, y la pantalla los distingue por
# los campos que vienen:
#   `food`      — ya lo tenías. No se ha preguntado a nadie, y se registra ya.
#   propuesta   — OFF lo conoce: nombre, marca y macros para el formulario.
#   `refusal`   — no hay nada utilizable, y por qué.
class BarcodeLookupOut(BaseModel):
    barcode: str
    # El alimento tuyo que ya llevaba ese código. Cuando viene, la consulta no
    # ha salido de la base de datos: ni red, ni OFF, ni espera.
    food: FoodOut | None = None
    name: str | None = None
    brand: str | None = None
    per: Literal["100g", "100ml"] | None = None
    nutrients: dict[str, float | None] = Field(default_factory=dict)
    # Open Food Facts la rellena cualquiera, así que sus fichas también traen
    # cifras que no cuadran entre sí. Mismo aviso, misma razón.
    mismatch: KcalMismatch | None = None
    # 'unknown'  — OFF no lo conoce; das de alta a mano con el código puesto
    # 'unusable' — lo conoce, pero su ficha no sirve (ver `refused_reason`)
    # 'offline'  — no se pudo preguntar
    refusal: Literal["unknown", "unusable", "offline"] | None = None
    # Por qué no servía: 'por ración', 'por 100 ml', 'sin kcal'. A la pantalla,
    # porque «no me vale» sin motivo se lee como un fallo de la app.
    refused_reason: str | None = None


# --- Peso corporal -----------------------------------------------------------
# Una pesada creíble. El suelo y el techo no son paranoia: son la misma postura
# que `_sane()` en `label.py` — una cifra imposible es un error de tecleo, y
# guardarla la convierte en un dato que después hay que desmentir.
MIN_KG = 20.0
MAX_KG = 400.0


class BodyWeightIn(BaseModel):
    measured_on: Date
    kg: float = Field(gt=MIN_KG - 1e-9, le=MAX_KG)

    @field_validator("kg")
    @classmethod
    def creible(cls, value: float) -> float:
        if not MIN_KG <= value <= MAX_KG:
            raise ValueError(f"un peso corporal está entre {MIN_KG:g} y {MAX_KG:g} kg")
        return value


class BodyWeightOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    measured_on: Date
    kg: float


class WeightTrendOut(BaseModel):
    """La media reciente. `kg` es `None` cuando todavía no hay tendencia, y eso
    es una respuesta: la pantalla imprime `—`, no la última pesada."""

    kg: float | None = None
    # Cuántas pesadas la sostienen. Una tendencia sobre dos y una sobre veinte
    # no valen lo mismo, y quien la pinta tiene derecho a saberlo.
    weigh_ins: int = 0
    # Hasta cuándo está medida. Si es de hace un mes, que lo diga la pantalla.
    up_to: Date | None = None
