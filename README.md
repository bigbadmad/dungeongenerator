# AD&D Dungeon Generator

A browser-based tool for procedurally generating dungeon maps using classic
1st Edition AD&D Dungeon Master's Guide random dungeon tables — passage
length, turns, doors, side passages, chambers, room shape/size, contents,
traps, and dressing. Generation proceeds one roll at a time so you can watch
the dungeon grow, and every roll can be overridden if you'd rather steer the
outcome by hand.

## Features

- **Step-by-step generation** — start a dungeon from an entrance and click
  "Generate Next" to resolve one periodic check at a time (passage continues,
  turns, doors, side passages, chambers, or dead ends), fanning out cursors
  for every open corridor end.
- **Full AD&D-style tables** — passage width, turn type, side passages, room
  shape/size, room contents (weighted by dungeon level), traps, door types,
  and room dressing with flavour text, all driven by weighted random tables
  in [src/tables.ts](src/tables.ts).
- **Roll overrides** — every roll is logged with its table, die result, and
  outcome; any roll can be overridden with a different table result via the
  roll log UI.
- **Collision-aware placement** — corridors and rooms are placed on an
  occupancy grid and shrink or are skipped if they'd overlap existing
  geometry.
- **SVG map rendering** with a room key panel describing each room's shape,
  size, and contents.
- **Save / Load** the dungeon state as JSON, and **Export PNG** of the
  rendered map.

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

1. Set the **Dungeon Level** (affects monster/treasure weighting), **Target
   Size**, and **Starting Direction**, then click **Start Dungeon**.
2. Click **Generate Next** repeatedly to extend the dungeon — each click
   resolves the next open passage/room cursor.
3. Review rolls in the roll log on the left; use the dropdown + **Apply** on
   supported rolls to update the displayed outcome. Overrides do not currently
   regenerate the dungeon.
4. Use **Save** / **Load** to persist a dungeon to a JSON file, or **Export
   PNG** to save the current map as an image.

## Project structure

```
src/
  generator.ts      # core generation algorithm (placement, cursors, rooms/corridors)
  tables.ts          # weighted random tables (AD&D DMG-style)
  tableOptions.ts     # option lists used for roll overrides in the UI
  state.ts            # app state store, save/load
  types.ts            # shared type definitions
  ui/
    controls.ts        # settings + roll log panel
    map.ts              # SVG map rendering + PNG export
    roomkey.ts          # room key panel
  tests/               # vitest unit tests for generator and tables
```

## Tech stack

- TypeScript
- [Vite](https://vitejs.dev/) for dev server and bundling
- [Vitest](https://vitest.dev/) for testing
- No UI framework — plain DOM rendering
