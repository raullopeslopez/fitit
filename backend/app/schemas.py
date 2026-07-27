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


class ExercisePatch(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    # muscle_group None clears the override, reverting to the auto-classifier.
    muscle_group: str | None = Field(default=None, max_length=60)
    # A new display name. Renaming is in place, so past sets follow (they
    # reference the exercise by id). Omitted leaves the name untouched.
    name: str | None = Field(default=None, min_length=1, max_length=120)


class SetIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    exercise_name: str = Field(min_length=1, max_length=120)
    # `kind` only matters when logging to a brand-new exercise; the router
    # resolves the effective kind and validates the metrics below against it.
    kind: Kind | None = None
    # Strength metrics (required for strength, absent for cardio).
    reps: int | None = Field(default=None, ge=1, le=1000)
    # Kilos. 0 is valid (bodyweight).
    weight: float | None = Field(default=None, ge=0, le=1000)
    rpe: float | None = Field(default=None, ge=1, le=10)  # perceived exertion
    note: str | None = Field(default=None, max_length=280)
    # Cardio metrics (duration required for cardio, distance optional).
    duration_seconds: int | None = Field(default=None, ge=1, le=86400)
    distance: float | None = Field(default=None, ge=0, le=100000)  # kilometres


class SetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise_id: int
    exercise_name: str
    kind: str = "strength"
    # The exercise's group, carried on the set so the per-muscle views can read
    # everything they need from /days. Null when the name isn't recognizable.
    muscle_group: str | None = None
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


class PreviousMarks(BaseModel):
    exercise_name: str
    found: bool = False
    sets: list[SetOut] = []
    best_one_rm: float | None = None  # best estimated 1RM (Epley) across all sets
    kind: str | None = None  # the exercise's kind, or None if it doesn't exist yet


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


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
