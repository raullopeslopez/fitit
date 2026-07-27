from datetime import UTC, date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Exercise(Base):
    __tablename__ = "exercises"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_exercises_user_id_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120), index=True)
    muscle_group: Mapped[str | None] = mapped_column(String(60), nullable=True)
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
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

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
    day_id: Mapped[int] = mapped_column(
        ForeignKey("days.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

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
