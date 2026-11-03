---
name: bike-courier
description: Plan bicycle deliveries.
---
- Confirm each drop-off. <!-- enforce: dropoff_confirmed(on_violation=ignore) -->
- Plan routes on cycle paths. <!-- enforce: cycle_paths(on_violation=Retry) -->
- Report delays honestly. <!-- enforce: delay_report(on_violation=[fix]) -->
