# Real 1.1 game layout candidate

Source: the publicly published AB Topic 1.1 game, downloaded read-only during this task.
Storage object: `93124428-92f4-48d2-a6dc-e5f9e010248b/41981408-efd8-440e-bfbe-558ddd37f934/0fb24b9f-b823-4dd2-be18-59b65725d2a2.html`.
Original UTF-8 SHA-256: `c76645dcad2fca6d1b326d0824eb53b5e0c336f960b5f592002b88b7f74454a7`.
Candidate UTF-8 SHA-256: `4871bb732b46c7ac9bde704e6ededb1eb740023db95e83c9fcaa6a4fb6f3d698`.

The candidate adds only the `o2i-compact-landscape` stylesheet. Removing that block reproduces the downloaded source byte-for-byte. Scripts, game rules, stages, formulas and text are unchanged; mathematical/teaching correctness is not re-approved by this layout test.

At landscape widths >=700px and viewport heights <=1000px, the game uses a viewport-height grid, a single scrolling stage row, an aspect-preserving canvas and visible touch controls. Records and achievements retain their own scrolling when needed. Narrow/portrait layouts retain the source behavior and page scrolling.

This file is a **local candidate**, not a deployed replacement. After the database/frontend release, upload it through Admin for AB 1.1, preview, and save. Keep the old immutable object for recovery. Share the reviewed lesson explicitly with BC after resolving any pre-existing BC draft.
