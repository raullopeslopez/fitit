"""Row → response shapes for the food endpoints.

Its own module so `foods.py` and `food_log.py` can both use it without one
importing the other (the diary needs to describe a food; the catalogue never
needs to know about the diary).
"""

from datetime import UTC

from .models import Food, LogEntry
from .schemas import FoodOut, LogEntryOut, PortionOut


def to_food_out(food: Food, user_id: int) -> FoodOut:
    return FoodOut(
        id=food.id,
        name=food.name,
        brand=food.brand,
        source=food.source,
        carb_convention=food.carb_convention,
        kcal_100g=food.kcal_100g,
        protein_100g=food.protein_100g,
        fat_100g=food.fat_100g,
        carbs_100g=food.carbs_100g,
        fiber_100g=food.fiber_100g,
        barcode=food.barcode,
        portions=[PortionOut.model_validate(p) for p in food.portions],
        is_mine=food.user_id == user_id,
    )


def to_entry_out(entry: LogEntry) -> LogEntryOut:
    return LogEntryOut(
        id=entry.id,
        # SQLite hands moments back naive; every one stored here is UTC. Without
        # the stamp the browser reads it as local time and a supper drifts by
        # the offset (same convention as app/session_length.py).
        logged_at=entry.logged_at
        if entry.logged_at.tzinfo
        else entry.logged_at.replace(tzinfo=UTC),
        log_date=entry.log_date,
        meal_slot=entry.meal_slot,
        food_id=entry.food_id,
        food_name=entry.food_name_snapshot,
        grams=entry.grams,
        kcal=entry.kcal,
        protein=entry.protein,
        fat=entry.fat,
        carbs=entry.carbs,
        fiber=entry.fiber,
        entry_source=entry.entry_source,
        dish_id=entry.dish_id,
    )
