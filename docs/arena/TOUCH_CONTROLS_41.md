# Brian's Arena touch-control update (#41)

Brian moved Dash, Skill, and Pause into the game viewport so iPad and phone players can use them without reaching below the canvas. Dash and Skill are round buttons on the right. Auto-lock remains available below the game, and the existing top-left ability indicators and keyboard bindings remain in place.

Pressing either ability during its cooldown shows the remaining time next to the player for 1.1 seconds, with a short fade. Touch controls hide while quiz, pause, and other dialogs are open. Additional movement touches cannot replace the active movement pointer. Devices with touch plus a trackpad are recognized through touch capability rather than only their primary pointer type.

The touch canvas fits the available frame height. On short landscape screens the game header is hidden during a run to leave space for play. This is a focused control improvement, not completion of the broader viewport work in #42.

## Local validation

- Production build passed.
- Arena bridge, public-game, and Chinese translation/font checks: 10 passed.
- Synthetic browser checks at 1180×820, 820×1180, 390×844, and 844×390 passed: action buttons inside the canvas without overlap; movement pointer retained while using abilities; cooldown feedback triggered; pause/resume and control visibility worked.
- The local fixture used no production account or database. It injected test access only into an in-memory copy; the shipped game has no test hooks.

Physical iPad/Safari multitouch and comfort still need Brian's acceptance on the personal preview. The production website and database are unchanged. New characters, balance changes, onboarding, and broader gameplay feedback are outside this update.
