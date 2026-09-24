from datetime import UTC, date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
    or_,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    # Null for an account that only ever signs in with Google: there is no
    # password to hash, and a placeholder hash would be a password nobody set.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Deliberately not writable over HTTP. Linking a Google sign-in to an
    # existing account keys off this column, so an address the user merely
    # typed at registration would be a way into somebody else's history.
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    # Google's stable per-account id (`sub`). Survives the user renaming
    # themselves or changing their Gmail address, which the email does not.
    google_sub: Mapped[str | None] = mapped_column(
        String(255), unique=True, index=True, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Un objetivo diario, fijo por usuario y no por día: cuánto y (de proteína)
    # cuánto quieres comer. `NULL` es «todavía no lo has fijado», no cero — igual
    # que un nutriente sin medir en `foods`, la ausencia no es una medida.
    objetivo_kcal: Mapped[float | None] = mapped_column(Float, nullable=True)
    objetivo_proteina: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Grasa e hidratos entran por la misma puerta, y por un motivo de pantalla:
    # la cabecera de Comida pinta lo que **falta** de cada macro, y sin objetivo
    # no hay nada que faltar. Una barra sin meta no mide nada.
    #
    # No hay objetivo de fibra: la cabecera no la pinta, y una columna que nada
    # lee es una que se acaba llenando de cifras que nadie mira.
    objetivo_grasa: Mapped[float | None] = mapped_column(Float, nullable=True)
    objetivo_hidratos: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Lo que hace falta para que las kcal dejen de teclearse: qué quieres que le
    # pase a tu cuerpo, y lo mínimo sobre él para poder estimar el gasto
    # mientras no haya historial con el que medirlo.
    #
    # Todo nullable, y no es pereza: una app que no sabe tu altura no debe
    # inventarse una media. Sin estos datos `targets.py` dice qué le falta en
    # vez de estimar a ciegas.
    goal: Mapped[str | None] = mapped_column(String(12), nullable=True)  # cut|maintain|gain
    goal_rate: Mapped[float | None] = mapped_column(Float, nullable=True)  # kg por semana
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    birth_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sex: Mapped[str | None] = mapped_column(String(8), nullable=True)  # male|female


class Exercise(Base):
    __tablename__ = "exercises"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_exercises_user_id_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    muscle_group: Mapped[str | None] = mapped_column(String(60), nullable=True)
    # The one thing worth remembering about how you do this lift — the grip, the
    # seat height, the shoulder that complains. It hangs off the exercise, not
    # off a set, because it is true of every session and you want it in front of
    # you before the first rep, not buried in last week's log.
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # "strength" (weight × reps) or "cardio" (duration + optional distance).
    kind: Mapped[str] = mapped_column(
        String(16), default="strength", server_default="strength", nullable=False
    )

    sets: Mapped[list["SetEntry"]] = relationship(back_populates="exercise")


class Day(Base):
    """A calendar date of training that groups one or more workouts."""

    __tablename__ = "days"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_days_user_id_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Newest first, matching the day feed itself (Day.date.desc()). The workout
    # you're still in is the one you want at the top of the screen, not the one
    # you finished this morning. Spec: tests/features/newest_first.feature
    workouts: Mapped[list["Workout"]] = relationship(
        back_populates="day",
        cascade="all, delete-orphan",
        order_by="Workout.id.desc()",
    )


class Workout(Base):
    __tablename__ = "workouts"

    id: Mapped[int] = mapped_column(primary_key=True)
    day_id: Mapped[int] = mapped_column(ForeignKey("days.id", ondelete="CASCADE"), index=True)
    name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    day: Mapped["Day"] = relationship(back_populates="workouts")
    sets: Mapped[list["SetEntry"]] = relationship(
        back_populates="workout",
        cascade="all, delete-orphan",
        order_by="SetEntry.set_index",
    )


class SetEntry(Base):
    __tablename__ = "sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    workout_id: Mapped[int] = mapped_column(
        ForeignKey("workouts.id", ondelete="CASCADE"), index=True
    )
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"), index=True)
    set_index: Mapped[int] = mapped_column(Integer)
    # Strength metrics (null for cardio sets). `weight` is kilos — there is no
    # other unit, so there is nothing to record alongside it and nothing to
    # convert. It used to carry `unit` + a canonical `weight_kg` beside it; both
    # went with the kg/lb toggle they existed to serve.
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    rpe: Mapped[float | None] = mapped_column(Float, nullable=True)
    note: Mapped[str | None] = mapped_column(String(280), nullable=True)
    # Cardio metrics (null for strength sets).
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    distance: Mapped[float | None] = mapped_column(Float, nullable=True)  # kilometres
    # The workout carries the date, the set carries the moment — it's what
    # separates a tight five-set block from one spread over an hour.
    #
    # Both defaults on purpose. Sessions run with expire_on_commit=False, so a
    # server_default alone is never read back after INSERT and the API would
    # answer created_at: null for the set it just wrote. The Python default
    # populates the object; the server default still covers rows inserted
    # outside the ORM (migrations, manual SQL).
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )

    workout: Mapped["Workout"] = relationship(back_populates="sets")
    exercise: Mapped["Exercise"] = relationship(back_populates="sets")


class Food(Base):
    """An item you can put in the diary — a CIQUAL row, or one you typed.

    `user_id` is null for the shared catalogue (CIQUAL, and later Open Food
    Facts): those rows are reference data, not somebody's belongings, and
    duplicating three thousand of them per account would be storing the same
    measurement over and over. A food you created yourself carries your id, is
    only ever yours, and is the only kind you are allowed to correct.
    """

    __tablename__ = "foods"
    # La clave de procedencia, y lo que hace idempotente el import de CIQUAL:
    # un `alim_code` es un alimento, ejecutar el import dos veces actualiza en
    # vez de duplicar. Los alimentos manuales llevan `source_ref` a NULL y no
    # chocan entre sí — Postgres y SQLite tratan cada NULL como distinto.
    __table_args__ = (
        UniqueConstraint("source", "source_ref", name="uq_foods_source_source_ref"),
        # Por usuario y no global, que es donde este esquema se separa del que
        # el plan escribió cuando esto era una app de un solo usuario. Un EAN
        # identifica el mismo producto para todo el mundo, pero el alimento que
        # lo lleva es de quien lo dio de alta: con una clave global, el segundo
        # en escanear un Actimel chocaría contra la fila del primero.
        #
        # Los NULL no chocan entre sí ni en Postgres ni en SQLite, así que los
        # alimentos sin código —CIQUAL entero— caben sin estorbar.
        UniqueConstraint("user_id", "barcode", name="uq_foods_user_barcode"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True
    )
    name: Mapped[str] = mapped_column(String(160))
    # Accent-stripped, lowercased, whitespace-collapsed — the key the search
    # box matches on. Stored rather than computed per query because there is no
    # portable SQL for it: Postgres would need `unaccent` and SQLite has
    # nothing. Same reasoning, and the same folding function, as exercise names
    # (see app/naming.py).
    name_folded: Mapped[str] = mapped_column(String(160), index=True)
    brand: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Plegada, y por el mismo motivo que `name_folded`: sin forma portable de
    # quitar acentos en SQL, buscar "dia" no encontraría un yogur de "Día". La
    # marca es la mitad de cómo recuerdas un producto envasado —"el de
    # Hacendado"—, así que tiene que entrar en la búsqueda igual que el nombre.
    brand_folded: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)
    # El código de barras del envase, cuando lo tiene. Es lo que hace que la
    # segunda vez que escaneas el mismo yogur no se le pregunte a nadie: se
    # busca aquí, se encuentra, y no hay ni red ni modelo de por medio.
    #
    # Columna y no tabla aparte: un alimento es un producto y un producto lleva
    # un código. Si algún día hicieran falta dos EAN para el mismo alimento —el
    # mismo yogur en pack de 4 y de 8—, esto se promueve a tabla sin perder
    # nada por el camino.
    barcode: Mapped[str | None] = mapped_column(String(14), index=True, nullable=True)
    # 'ciqual' | 'off' | 'manual' | 'fdc'
    source: Mapped[str] = mapped_column(String(16), default="manual", server_default="manual")
    source_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 'available' (the European convention CIQUAL uses, fibre counted apart) or
    # 'by_difference' (the US one, fibre inside the carbohydrate figure). Two
    # numbers that mean different things must not be added together silently.
    carb_convention: Mapped[str] = mapped_column(
        String(16), default="available", server_default="available"
    )
    # Every one of these is nullable on purpose. Null is "nobody measured it",
    # which a zero would misreport as "measured, and there is none".
    kcal_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    protein_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    fat_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    carbs_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    fiber_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Everything CIQUAL carries beyond the five macros, as a JSON object.
    nutrients_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # La clasificación de CIQUAL, en códigos. `0201` es verdura, `0203`
    # legumbre, `0202` tubérculo — el mapa a familias vive en
    # `app/food_groups.py`. Nullable porque hay 45 filas de CIQUAL sin grupo y
    # porque ningún alimento que des de alta a mano lo trae: eso es **sin
    # clasificar**, nunca «no es verdura».
    group_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    subgroup_code: Mapped[str | None] = mapped_column(String(8), index=True, nullable=True)
    is_recipe: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # Hidden from search without breaking the entries that point at it.
    archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    aliases: Mapped[list["FoodAlias"]] = relationship(
        back_populates="food", cascade="all, delete-orphan"
    )
    portions: Mapped[list["Portion"]] = relationship(
        back_populates="food", cascade="all, delete-orphan", order_by="Portion.id"
    )


def visible_foods(user_id: int):
    """Las filas de `foods` que existen para este usuario.

    El catálogo compartido más lo tuyo, sin lo archivado. Vive aquí y no en un
    router porque los dos la necesitan —el catálogo para buscar, el diario para
    no dejarte registrar un alimento que retiraste— y dos copias de esta regla
    es como `food_log` acabó pudiendo escribir contra filas que la búsqueda ya
    no enseñaba.
    """
    return (Food.archived.is_(False)) & (or_(Food.user_id.is_(None), Food.user_id == user_id))


class FoodAlias(Base):
    """Another name the same food answers to — "judías", "alubias", "habichuelas"."""

    __tablename__ = "food_aliases"

    id: Mapped[int] = mapped_column(primary_key=True)
    food_id: Mapped[int] = mapped_column(ForeignKey("foods.id", ondelete="CASCADE"), index=True)
    alias: Mapped[str] = mapped_column(String(160))
    alias_folded: Mapped[str] = mapped_column(String(160), index=True)

    food: Mapped["Food"] = relationship(back_populates="aliases")


class Portion(Base):
    """A household measure — "rebanada", "unidad mediana", "cazo".

    The point of the whole table is that logging one slice of bread should not
    make you weigh it.
    """

    __tablename__ = "portions"

    id: Mapped[int] = mapped_column(primary_key=True)
    food_id: Mapped[int] = mapped_column(ForeignKey("foods.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(60))
    grams: Mapped[float] = mapped_column(Float)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

    food: Mapped["Food"] = relationship(back_populates="portions")


class LogEntry(Base):
    """One thing eaten, with its nutrients frozen at the moment it was recorded.

    The macro columns are a copy, not a reference, and that is the design: a
    food corrected next March must not rewrite what last September's total said.
    Nothing recomputes them from `foods` — see app/nutrition.py.
    """

    __tablename__ = "log_entries"
    # Every read of the diary is "this user, this day", so that is the index.
    __table_args__ = (Index("idx_log_entries_user_date", "user_id", "log_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # The instant, stored UTC (SQLite hands it back naive; every moment here is
    # UTC, same convention as sets).
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # The food day it belongs to: 04:00 → 04:00 on the clock the client sent.
    # Derived once, on write, because the offset that decided it is not
    # recoverable from a UTC timestamp afterwards.
    log_date: Mapped[date] = mapped_column(Date)
    meal_slot: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # Nullable, and deliberately not cascading: deleting a food you no longer
    # buy must not delete the fortnight you ate it. The snapshot below is what
    # keeps the row readable once the pointer is gone.
    food_id: Mapped[int | None] = mapped_column(
        ForeignKey("foods.id", ondelete="SET NULL"), index=True, nullable=True
    )
    food_name_snapshot: Mapped[str] = mapped_column(String(160))
    grams: Mapped[float] = mapped_column(Float)
    # FROZEN. Never recalculated from `foods`.
    kcal: Mapped[float | None] = mapped_column(Float, nullable=True)
    protein: Mapped[float | None] = mapped_column(Float, nullable=True)
    fat: Mapped[float | None] = mapped_column(Float, nullable=True)
    carbs: Mapped[float | None] = mapped_column(Float, nullable=True)
    fiber: Mapped[float | None] = mapped_column(Float, nullable=True)
    nutrients_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # De qué plato salió esta entrada, cuando salió de uno. No cascadea y no
    # manda: los macros ya están congelados arriba y la fila se lee igual sin
    # él. Sirve para una sola cosa, que es agrupar en pantalla las cinco filas
    # de unas lentejas bajo el nombre del plato.
    dish_id: Mapped[int | None] = mapped_column(
        ForeignKey("dishes.id", ondelete="SET NULL"), index=True, nullable=True
    )
    # 'manual' | 'barcode' | 'template' | 'repeat' | 'voice' | 'dish' — kept from day one
    # so that, a month in, "how much do I actually use the voice parser?" is a
    # query rather than a guess.
    entry_source: Mapped[str] = mapped_column(String(16), default="manual", server_default="manual")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )


class BodyWeight(Base):
    """Lo que pesas un día, y sólo eso.

    Una fila por día y por usuario: la báscula no acumula, mide. Pesarte dos
    veces el mismo día reescribe la cifra del día en vez de añadir una segunda,
    porque las dos son medidas del mismo hecho y la buena es la última.

    `measured_on` es una fecha civil, no un instante, y **no pasa por
    `food_log_date()`**: el corte de las 04:00 es del diario de comida, donde
    una cena de la 01:00 pertenece al día anterior. Aplicarlo aquí haría que
    pesarte de madrugada contara para ayer, que no significa nada — una pesada
    no tiene hora útil.

    No hay columna nullable que valga: si no te pesaste, no hay fila. La
    ausencia es ausencia, y quien la lea tiene que tratarla como desconocida y
    no como un cero (ver `app/weight.py`).
    """

    __tablename__ = "body_weights"
    __table_args__ = (
        UniqueConstraint("user_id", "measured_on", name="uq_body_weights_user_day"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    measured_on: Mapped[date] = mapped_column(Date, index=True)
    kg: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Dish(Base):
    """Un plato: lo que de verdad te comes.

    Un plato **no es un alimento** y no vive en `foods`. La diferencia no es de
    forma —los dos tienen nombre y macros— sino de procedencia: un alimento es
    una medida (CIQUAL, una etiqueta, un código de barras) y un plato es una
    combinación tuya de medidas. Colarlos en el catálogo llenaría la búsqueda de
    cosas que no son alimentos y dejaría a `POST /foods` de ser la única puerta
    que es.

    `basis` dice **cómo lo pesas**, que es la decisión que sin tomar hace mentir
    a un plan entero: un filete pierde en torno a un cuarto de su peso al
    cocinarse. No hay conversión automática entre las dos bases y es a
    propósito: si el plato habla en cocinado, sus ingredientes tienen que ser
    filas de catálogo medidas en cocinado — CIQUAL trae las dos. Convertir sin
    un factor de merma con fuente sería inventarse la cifra.

    Un plato no se borra: se corrige. Igual que un alimento, y por lo mismo —
    hay entradas congeladas apuntándolo, y las habrá de planes.
    """

    __tablename__ = "dishes"
    __table_args__ = (
        UniqueConstraint("user_id", "name_folded", name="uq_dishes_user_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # NOT NULL, al revés que en `foods`: no hay catálogo compartido de platos.
    # Una receta es de quien la cocina.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    # Plegado con `fold_exercise_name()`, igual que alimentos y ejercicios.
    # Nada de FTS5: no existe ni en Postgres ni en el SQLite de los tests.
    name_folded: Mapped[str] = mapped_column(String(160), index=True)
    # 'air_fryer' | 'plancha' | 'horno' | 'sarten' | 'cocido' | 'crudo'. Nullable
    # porque hay platos que no se cocinan.
    method: Mapped[str | None] = mapped_column(String(24), nullable=True)
    # 'raw' | 'cooked'. NOT NULL: un plato que no dice cómo se pesa es un plato
    # que miente a medias.
    basis: Mapped[str] = mapped_column(String(8), default="raw", server_default="raw")
    servings: Mapped[float] = mapped_column(Float, default=1, server_default="1")
    # Huecos en los que sirve, separados por comas. NULL es «no lo has dicho»,
    # y se lee como «vale para cualquiera»: el repertorio que ya existe no lo
    # declaró, y negárselo lo dejaría fuera del plan entero.
    slots: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Un guiso es lo que es —450 kcal y punto— y no aporta ajuste (§39). El
    # resto del día compensa. Sin esto, exigir que todo plato sea ajustable
    # manda al generador hacia platos de báscula.
    is_block: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    ingredients: Mapped[list["DishIngredient"]] = relationship(
        back_populates="dish",
        cascade="all, delete-orphan",
        order_by="DishIngredient.id",
    )


class DishIngredient(Base):
    """Un alimento dentro de un plato, en gramos.

    Los gramos son los del plato entero, no los de una ración: dividir por
    raciones es cosa de `nutrition.py`, que es donde vive toda la aritmética.
    """

    __tablename__ = "dish_ingredients"

    id: Mapped[int] = mapped_column(primary_key=True)
    dish_id: Mapped[int] = mapped_column(ForeignKey("dishes.id", ondelete="CASCADE"), index=True)
    # Sin `ondelete`: un alimento no se borra en esta app, así que no hay
    # huérfanos que planear. Si algún día los hubiera, el plato tendría que
    # decirlo en vez de quedarse callado sumando de menos.
    food_id: Mapped[int] = mapped_column(ForeignKey("foods.id"), index=True)
    grams: Mapped[float] = mapped_column(Float)
    # La banda de lo que el generador puede mover. NULL **no** es un número
    # desconocido: es que nadie ha dicho que este ingrediente se pueda tocar, y
    # sin banda se queda donde la receta lo puso.
    min_grams: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_grams: Mapped[float | None] = mapped_column(Float, nullable=True)

    dish: Mapped["Dish"] = relationship(back_populates="ingredients")


class DailyTarget(Base):
    """Lo que tocaba comer **ese día**, congelado.

    En cuanto el objetivo se deriva, congelarlo por día deja de ser opcional.
    `comida-pendiente.md` ya avisaba de que un objetivo del perfil reescribe el
    pasado al cambiarlo; con un número que se mueve solo —porque bajas de peso,
    porque hay más historial— eso pasa de molestia a garantizar un pasado falso:
    la racha de septiembre medida contra el objetivo de diciembre.

    Se escribe una fila por día **la primera vez que ese día se lee**, y nunca
    se reescribe sola. Los días anteriores a esta feature no tienen fila y no se
    les inventa una: no había objetivo congelado, y rellenarlo hacia atrás sería
    exactamente la mentira que esto viene a evitar.

    Sólo kcal. El reparto en macros es de las reglas — otra capa y otra fase.
    """

    __tablename__ = "daily_targets"
    __table_args__ = (
        UniqueConstraint("user_id", "log_date", name="uq_daily_targets_user_day"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    log_date: Mapped[date] = mapped_column(Date, index=True)
    kcal: Mapped[float] = mapped_column(Float)
    # 'formula' | 'measured' | 'manual'. Lo que la pantalla necesita para no
    # pintar una estimación con la misma tinta que una medición.
    source: Mapped[str] = mapped_column(String(10), default="manual", server_default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Rule(Base):
    """Una regla que sigues al comer.

    Tres cosas la describen y las tres hacen falta: **ámbito** (`day`, `week`,
    `slot`), **condición** (`training`, `rest`, o ninguna) y **dureza** (`hard`,
    `soft`). Sin ámbito, «verdura» no dice dónde; sin condición, «más hidratos
    los días que entreno» no se puede expresar; y sin dureza, un día normal
    incumpliría siempre y el número dejaría de mirarse.

    `params_json` y no columnas: los seis tipos piden cosas distintas —una banda
    por kilo, un porcentaje, una familia, un modo de cocinado— y seis juegos de
    columnas mayormente nulas describen peor lo que hay. **La garantía la dan
    el validador y los tests, no el esquema**: `app/rules.py` tiene el catálogo
    cerrado y nada llega aquí sin pasar por él.

    **Una regla no se borra: se retira**, poniéndole `active_to`. Cambiar de
    opinión en octubre no puede reescribir cómo se juzgó septiembre — la misma
    razón por la que las entradas del diario congelan sus macros.
    """

    __tablename__ = "rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(24))
    scope: Mapped[str] = mapped_column(String(8))
    # Sólo cuando `scope` es 'slot': desayuno | comida | cena | snack.
    slot: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # 'training' | 'rest' | NULL. NULL es «todos los días», no «ninguno».
    day_condition: Mapped[str | None] = mapped_column(String(12), nullable=True)
    hardness: Mapped[str] = mapped_column(String(4), default="soft", server_default="soft")
    params_json: Mapped[str] = mapped_column(Text)
    active_from: Mapped[date] = mapped_column(Date)
    # NULL es «sigue vigente». Retirarla es ponerle fecha, no borrar la fila.
    active_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Plan(Base):
    """Una semana generada.

    Se guarda **la semilla**, no sólo el resultado: sin ella el plan no se puede
    volver a obtener, y entonces «regenerar con una regla nueva y comparar las
    dos semanas» no existe — sólo habría una semana nueva sin nada con que
    medirla.
    """

    __tablename__ = "plans"
    __table_args__ = (UniqueConstraint("user_id", "week_start", name="uq_plans_user_week"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    week_start: Mapped[date] = mapped_column(Date)
    seed: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    entries: Mapped[list["PlanEntry"]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="PlanEntry.id",
    )


class PlanEntry(Base):
    """Un hueco del plan: qué plato, qué día, y con cuántos gramos.

    `grams_json` **congela** los gramos que el generador resolvió. Volver a
    resolverlos mañana daría otra cifra —el objetivo se mueve con el peso— y
    habrías comido la de hoy: es la misma razón por la que `log_entries` no se
    recalcula desde `foods`.

    `status` es nullable y **NULL es «no dicho», no «saltado»**. Un plan que
    diera por incumplido lo que todavía no ha pasado contaría mal la adherencia
    desde el lunes por la mañana.
    """

    __tablename__ = "plan_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id", ondelete="CASCADE"), index=True)
    log_date: Mapped[date] = mapped_column(Date)
    slot: Mapped[str] = mapped_column(String(16))
    # Sin `ondelete`: un plato no se borra en esta app, se corrige.
    dish_id: Mapped[int] = mapped_column(ForeignKey("dishes.id"))
    grams_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 'done' | 'swapped' | 'skipped' | NULL.
    status: Mapped[str | None] = mapped_column(String(12), nullable=True)
    log_entry_id: Mapped[int | None] = mapped_column(
        ForeignKey("log_entries.id", ondelete="SET NULL"), nullable=True
    )

    plan: Mapped["Plan"] = relationship(back_populates="entries")
