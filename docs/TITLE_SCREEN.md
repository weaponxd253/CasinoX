# Luxury opening screen

The title page now follows the supplied reference with a gold two-line headline,
gold gradient Continue button, equal secondary actions, translucent emerald/navy
room card, ornamental gold borders, keyboard indicators and centered footer.
All text, buttons, navigation and dialogs remain real HTML.

Only `index.html` and the new, title-scoped `world/title.css` implement this change.
`world/start.js`, shared styles, gameplay, NPCs, hotel/casino calculations, wallet
and world-save version 2 are unchanged. Prior Phase 5B work is preserved.

## Artwork limitation

The repository has no clean copy of the exact grand-staircase background shown in
the reference. The redesign uses the existing local
`world/assets/lobby/central-lobby.png` for both the full-viewport backdrop and the
room preview. No reference UI was embedded, no external image URL was added, and
no replacement artwork was generated. The different room layout is the main
remaining visual difference from the supplied reference. The real preview keeps
its complete 3:2 aspect ratio rather than cropping or stretching the room.

The opening screen uses a fixed cinematic dark palette; the existing Settings
preferences and their behavior in game remain intact.

## Captures

- [1920 × 1080](screenshots/title-1920x1080.png)
- [1440 × 900](screenshots/title-1440x900.png)
- [768 × 1024](screenshots/title-768x1024.png)
- [390 × 844](screenshots/title-390x844.png)
- [320 × 720](screenshots/title-320x720.png)

Desktop captures were compared against the reference and refined for header,
columns, card proportions, headline, action spacing and footer placement.
Narrow layouts stack and retain accessible actions without horizontal scrolling.

## Verification

**34 existing automated tests passed in 22.1 seconds, one worker, across desktop
and mobile**, covering title loading, Continue, New Game safeguards/cancellation,
Settings/cancellation/preferences, saved owner location, hotel navigation,
malformed save handling and byte-for-byte game-save preservation. No test failed
or required an isolated retry. The full gameplay suite was not rerun for this
title-only HTML/CSS change; the preceding Phase 5B suite passed all 478 cases.

Additional rendered checks at all five viewport sizes verified no horizontal
overflow, preserved image ratio, unchanged stored values, keyboard tab order,
keyboard opening of Settings and focus restoration after closing the dialog.
An initial review-script comparison incorrectly treated localStorage key order
as significant; comparing each stored value by key confirmed no save change.

The existing Windows test server MIME workaround is described in
[Phase 5B notes](PHASE_5B_QUEUE.md). Focused command:

```powershell
npx playwright test tests/world.spec.js tests/casino.spec.js --workers=1 --grep "title|Continue|New Game|Settings|older hotel data|reported and never replaced"
```
