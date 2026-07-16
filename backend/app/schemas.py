from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class ExerciseIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    muscle_group: str | None = None


class ExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    muscle_group: str | None = None


class SetIn(BaseModel):
    exercise_name: str = Field(min_length=1, max_length=120)
    reps: int = Field(ge=0)
    weight: float = Field(ge=0)
    unit: str = Field(default="kg", max_length=4)


class SetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise_id: int
    exercise_name: str
    set_index: int
    reps: int
    weight: float
    unit: str


class WorkoutIn(BaseModel):
    name: str | None = None


class WorkoutOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: date
    name: str | None = None
    sets: list[SetOut] = []


class PreviousMarks(BaseModel):
    exercise_name: str
    found: bool = False
    sets: list[SetOut] = []
