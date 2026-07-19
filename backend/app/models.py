from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    muscle_group: Mapped[str | None] = mapped_column(String(60), nullable=True)
    # "strength" (weight × reps) or "cardio" (duration + optional distance).
    kind: Mapped[str] = mapped_column(
        String(16), default="strength", server_default="strength", nullable=False
    )

    sets: Mapped[list["SetEntry"]] = relationship(back_populates="exercise")


class Day(Base):
    """A calendar date of training that groups one or more workouts."""

    __tablename__ = "days"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    workouts: Mapped[list["Workout"]] = relationship(
        back_populates="day",
        cascade="all, delete-orphan",
        order_by="Workout.id",
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
    # Strength metrics (null for cardio sets).
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str] = mapped_column(String(4), default="kg")
    rpe: Mapped[float | None] = mapped_column(Float, nullable=True)
    note: Mapped[str | None] = mapped_column(String(280), nullable=True)
    # Cardio metrics (null for strength sets).
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    distance: Mapped[float | None] = mapped_column(Float, nullable=True)
    distance_unit: Mapped[str | None] = mapped_column(String(4), nullable=True)

    workout: Mapped["Workout"] = relationship(back_populates="sets")
    exercise: Mapped["Exercise"] = relationship(back_populates="sets")
