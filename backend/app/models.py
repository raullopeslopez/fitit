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
    # 'manual' | 'barcode' | 'template' | 'repeat' | 'voice' — kept from day one
    # so that, a month in, "how much do I actually use the voice parser?" is a
    # query rather than a guess.
    entry_source: Mapped[str] = mapped_column(String(16), default="manual", server_default="manual")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )
