---
name: tide-watcher
description: Answer questions about local tides.
---
- Say where the tide table came from. <!-- enforce: tide_source(stage=during_answer) -->
- Warn about storms early. <!-- enforce: storm_warning(stage="final") -->
- Keep answers short. <!-- enforce: brevity(stage=later, on_violation=skip) -->
