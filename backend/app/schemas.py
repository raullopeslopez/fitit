# Aliased so a model field named `date` doesn't shadow the `date` type.
from datetime import date as Date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# The weight unit. kg only for now (design decision), lb reserved for later.
Unit = Literal["kg", "lb"]


class ExerciseIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=120)
    muscle_group: str | None = Field(default=None, max_length=60)


class ExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    muscle_group: str | None = None


class SetIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    exercise_name: str = Field(min_length=1, max_length=120)
    reps: int = Field(ge=1, le=1000)
    weight: float = Field(ge=0, le=1000)  # 0 is valid (bodyweight)
    unit: Unit = "kg"
    rpe: float | None = Field(default=None, ge=1, le=10)  # perceived exertion
    note: str | None = Field(default=None, max_length=280)


class SetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise_id: int
    exercise_name: str
    set_index: int
    reps: int
    weight: float
    unit: str
    rpe: float | None = None
    note: str | None = None


class WorkoutIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, max_length=80)
    date: Date | None = None  # the training day; defaults to today when omitted


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


class PreviousMarks(BaseModel):
    exercise_name: str
    found: bool = False
    sets: list[SetOut] = []


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
