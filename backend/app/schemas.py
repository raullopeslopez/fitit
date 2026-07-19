# Aliased so a model field named `date` doesn't shadow the `date` type.
from datetime import date as Date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# The weight unit for strength sets.
Unit = Literal["kg", "lb"]
# The distance unit for cardio sets.
DistanceUnit = Literal["km", "mi"]
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


class SetIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    exercise_name: str = Field(min_length=1, max_length=120)
    # `kind` only matters when logging to a brand-new exercise; the router
    # resolves the effective kind and validates the metrics below against it.
    kind: Kind | None = None
    # Strength metrics (required for strength, absent for cardio).
    reps: int | None = Field(default=None, ge=1, le=1000)
    weight: float | None = Field(default=None, ge=0, le=1000)  # 0 is valid (bodyweight)
    unit: Unit = "kg"
    rpe: float | None = Field(default=None, ge=1, le=10)  # perceived exertion
    note: str | None = Field(default=None, max_length=280)
    # Cardio metrics (duration required for cardio, distance optional).
    duration_seconds: int | None = Field(default=None, ge=1, le=86400)
    distance: float | None = Field(default=None, ge=0, le=100000)
    distance_unit: DistanceUnit | None = None


class SetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise_id: int
    exercise_name: str
    kind: str = "strength"
    set_index: int
    reps: int | None = None
    weight: float | None = None
    unit: str
    rpe: float | None = None
    note: str | None = None
    duration_seconds: int | None = None
    distance: float | None = None
    distance_unit: str | None = None


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


class DayOut(BaseModel):
    id: int
    date: Date
    workouts: list[WorkoutOut] = []


class HistoryPoint(BaseModel):
    date: Date
    one_rm: float


class PreviousMarks(BaseModel):
    exercise_name: str
    found: bool = False
    sets: list[SetOut] = []
    best_one_rm: float | None = None  # best estimated 1RM (Epley) across all sets
    kind: str | None = None  # the exercise's kind, or None if it doesn't exist yet


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
