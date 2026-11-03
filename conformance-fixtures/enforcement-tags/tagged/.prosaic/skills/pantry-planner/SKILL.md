---
name: pantry-planner
description: Plan a week of shared pantry meals.
---
Plan meals from the pantry list in [reference](./reference.md).

1. Use only listed ingredients. <!-- enforce: pantry_only(list="reference.md") -->
2. Flag allergens before suggesting a dish.
   <!-- enforce: allergen_check(stage=before_answer, on_violation=fail) -->
