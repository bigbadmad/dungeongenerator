# AD&D Dungeon Generator

A browser-based tool for procedurally generating dungeon maps using classic
1st Edition AD&D Dungeon Master's Guide random dungeon tables — passage
length, turns, doors, side passages, chambers, room shape/size, contents,
traps, and dressing. Generate a whole dungeon in one click, or step through it
one roll at a time and watch it grow.

## Features

- **One-click dungeons** — **Generate Full Dungeon** builds a complete map
  instantly. Prefer to watch it grow? **Step by Step** resolves one periodic
  check at a time, and **Finish Dungeon** completes whatever is under way.
- **Size that means something** — *Small*, *Medium* and *Large* each have a
  room range. Every seed picks a target inside it, a dungeon is never allowed
  to die out below the minimum, and generation winds down once the target is
  reached.
- **Seeded and reproducible** — the same seed and settings
  always give the same dungeon. The seed is shown in the status line; type it
  back into the Seed box to regenerate it.
- **Real dice** — every roll uses an actual die (d100, d82, ...) sized to its
  table, and the outcome is read off the table band the die lands in. The log
  shows exactly what was rolled.
- **Rooms first** — chambers are the most likely result of a periodic check,
  passages are kept short, and rooms get few exits, so rooms make up around
  half of the floor area rather than being scattered along long corridors.
- **Proper junctions** — turns, side passages, T/X/Y intersections and 45°
  jogs are all built from a junction block with branches on its sides, so
  every branch you roll actually appears. Doors can sit in the passage or in a
  side wall leading into a chamber, dead ends can hide secret doors, and
  stairs end a passage.
- **Loops** — when a passage runs into an existing area it rolls whether to
  open onto it, so dungeons contain loops rather than being pure trees.
- **Varied rooms** — squares, rectangles, circles and irregular rooms
  (L-shaped, cross-shaped, notched, caverns). Passages can arrive and leave
  off-centre, and exits can be open, doored or secret.
- **Room contents** — level-appropriate monsters (rooms in the same zone tend
  to share inhabitants), treasure, traps with effects, special features and
  dressing.
- **Clean map rendering** — walls are drawn from the cell grid, so rooms and
  passages join up seamlessly. Rooms are tinted by zone and labelled with their
  number and contents (M monsters, T trap, $ treasure, * special).
- **Autosave** — the current dungeon (including room notes and any
  half-finished step-by-step run) is saved in your browser as you go, so it
  survives the tab being reloaded or discarded while you're busy elsewhere.
  **New** clears it. It lives in this browser only; use Save for a copy you
  can keep or move.
- **Save / Load** the dungeon as JSON, and **Export PNG** of the whole map
  (with scale bar and seed). Files from before version 2 can't be loaded.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL in your browser.

### Other scripts

```bash
npm run build    # type-check and build for production
npm run preview  # preview the production build
npm test         # run the test suite (vitest)
```

## Usage

1. Set the **Dungeon Level** (affects monsters and treasure), **Target Size**
   and **Starting Direction**, optionally type a **Seed**, then click
   **Generate Full Dungeon**.
2. Click a room on the map, or in the Room Key, to highlight it. Add notes to
   any room.
3. Read the roll log on the left (newest first, grouped by step) to see exactly
   what was rolled for each decision.
4. **Fit** re-centres the map; scroll to zoom and drag to pan. **Save** /
   **Load** persist a dungeon, **Export PNG** saves an image.

The map uses 5 ft squares. Passages grow in stretches of 30–90 ft, and a
periodic check is made at the end of each stretch.

## Project structure

```
src/
  generator.ts      # generation algorithm: steps, junctions, rooms
  geometry.ts       # grid maths, room shapes/masks, ownership + clearance checks
  tables.ts         # weighted random tables (AD&D DMG-style) and dice mapping
  content.ts        # monsters, treasure, special rooms, trap descriptions
  rng.ts            # seedable PRNG
  state.ts          # app state store, save/load
  types.ts          # shared type definitions
  ui/
    controls.ts     # settings, generation controls, roll log
    map.ts          # SVG map rendering, pan/zoom, PNG export
    roomkey.ts      # room key panel
  tests/            # vitest unit tests
```

Generation is a pure function of `(settings, seed)`: `DungeonState`
carries the RNG state, so a saved dungeon continues exactly as it would have.

## Tech stack

- TypeScript
- [Vite](https://vitejs.dev/) for dev server and bundling
- [Vitest](https://vitest.dev/) for testing
- No UI framework — plain DOM rendering
