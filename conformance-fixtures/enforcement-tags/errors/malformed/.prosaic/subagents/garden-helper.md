---
name: garden-helper
description: Answer allotment questions.
---
- Water before noon. <!-- enforce: Water_Time() -->
- Rotate the beds yearly. <!-- enforce: rotation -->
- Compost kitchen scraps. <!-- enforce: compost(kind=green,) -->
- Share spare seedlings. <!-- enforce: seedlings(count=3, count=4) -->
- Keep paths clear. <!-- enforce: paths(widths=[[1], 2]) -->
- Close the gate. <!-- enforce: gate(note="unterminated) -->
- Return borrowed tools. <!-- enforce: tools(note=12abc) -->
- Log every visit. <!-- prose-only: -->
- Greet new members. <!-- enforce: greet(stage=final)
- Lock the shed. <!-- enforce: shed_lock() -->
- Turn off the tap. <!-- enforce: tap_off(
  stage=final) -->
