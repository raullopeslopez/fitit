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

    sets: Mapped[list["SetEntry"]] = relationship(back_populates="exercise")


class Workout(Base):
    __tablename__ = "workouts"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, default=date.today, index=True)
    name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

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
    reps: Mapped[int] = mapped_column(Integer)
    weight: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(4), default="kg")

    workout: Mapped["Workout"] = relationship(back_populates="sets")
    exercise: Mapped["Exercise"] = relationship(back_populates="sets")
