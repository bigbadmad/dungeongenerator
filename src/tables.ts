import { Rng } from './rng.js';
import type {
  PeriodicCheckResult,
  TurnType,
  SidePassageType,
  RoomShape,
  RoomContentsType,
  DoorType,
  TrapType,
  DressingType,
  StairType,
  DoorLocation,
  DeadEndResult,
  CollisionResult,
  IrregularVariant,
} from './types.js';

export interface TableEntry<T> {
  weight: number;
  value: T;
  label: string;
}

/** Sum of weights = the number of sides of the die used to roll this table. */
export function tableSides(table: readonly TableEntry<unknown>[]): number {
  return table.reduce((sum, e) => sum + e.weight, 0);
}

/** Maps a die result (1..sides) onto the table band that contains it. */
export function entryForDie<E extends TableEntry<unknown>>(table: readonly E[], die: number): E {
  let remaining = die;
  for (const entry of table) {
    remaining -= entry.weight;
    if (remaining <= 0 && entry.weight > 0) return entry;
  }
  return table[table.length - 1];
}

export interface TableRoll<E> {
  entry: E;
  die: number;
  sides: number;
}

/** Rolls a die of the right size and reads the result off the table. */
export function rollTable<E extends TableEntry<unknown>>(table: readonly E[], rng: Rng): TableRoll<E> {
  const sides = tableSides(table);
  const die = rng.int(1, sides);
  return { entry: entryForDie(table, die), die, sides };
}

export function rollD(sides: number, rng: Rng): number {
  return rng.int(1, sides);
}

// Periodic check — made at the end of every stretch of passage (DMG: every 60 ft).
// The generator adjusts these weights to steer towards the requested dungeon size.
export const PERIODIC_CHECK: TableEntry<PeriodicCheckResult>[] = [
  { weight: 12, value: 'continue',     label: 'Passage continues' },
  { weight: 10, value: 'turn',         label: 'Passage turns' },
  { weight: 12, value: 'door',         label: 'Door' },
  { weight: 10, value: 'side_passage', label: 'Side passage' },
  { weight: 44, value: 'chamber',      label: 'Chamber or Room' },
  { weight: 2,  value: 'stairs',       label: 'Stairs' },
  { weight: 10, value: 'dead_end',     label: 'Dead end' },
];

// Turn type table. 45° bends are drawn as a short jog on the square grid.
export const TURN_TYPE: TableEntry<TurnType>[] = [
  { weight: 15, value: 'left_90',       label: 'Left 90°' },
  { weight: 15, value: 'right_90',      label: 'Right 90°' },
  { weight: 20, value: 'left_45_ahead', label: 'Left 45° ahead' },
  { weight: 20, value: 'right_45_ahead',label: 'Right 45° ahead' },
  { weight: 10, value: 'y_intersection',label: 'Y intersection' },
  { weight: 10, value: 't_intersection',label: 'T intersection' },
  { weight: 10, value: 'x_intersection',label: 'X intersection' },
];

// Side passage table. The main passage carries on except for "Passage T's".
export const SIDE_PASSAGE: TableEntry<SidePassageType>[] = [
  { weight: 35, value: 'left',      label: 'Left' },
  { weight: 35, value: 'right',     label: 'Right' },
  { weight: 20, value: 'both',      label: 'Both sides' },
  { weight: 10, value: 'passage_t', label: "Passage T's" },
];

// Where a door sits relative to the passage.
export const DOOR_LOCATION: TableEntry<DoorLocation>[] = [
  { weight: 30, value: 'ahead', label: 'Ahead (in the passage)' },
  { weight: 35, value: 'left',  label: 'Left (into a chamber)' },
  { weight: 35, value: 'right', label: 'Right (into a chamber)' },
];

export const DEAD_END: TableEntry<DeadEndResult>[] = [
  { weight: 75, value: 'dead_end',    label: 'Passage ends' },
  { weight: 25, value: 'secret_door', label: 'Secret door (passage continues)' },
];

// What happens when a passage runs into an existing area.
export const PASSAGE_COLLISION: TableEntry<CollisionResult>[] = [
  { weight: 40, value: 'join', label: 'Opens onto the existing area' },
  { weight: 60, value: 'wall', label: 'Stops short at a wall' },
];

// Length of one stretch of passage, in 5 ft cells.
export const PASSAGE_LENGTH: TableEntry<number>[] = [
  { weight: 55, value: 6,  label: '30 ft' },
  { weight: 40, value: 12, label: '60 ft' },
  { weight: 5,  value: 18, label: '90 ft' },
];

// Passage width, in 5 ft cells. 0 = "special" (see SPECIAL_PASSAGE).
export const PASSAGE_WIDTH: TableEntry<number>[] = [
  { weight: 20, value: 1, label: '5 ft' },
  { weight: 62, value: 2, label: '10 ft' },
  { weight: 13, value: 4, label: '20 ft' },
  { weight: 3,  value: 6, label: '30 ft' },
  { weight: 2,  value: 0, label: 'Special' },
];

export const SPECIAL_PASSAGE: TableEntry<number>[] = [
  { weight: 5, value: 8,  label: '40 ft gallery' },
  { weight: 3, value: 3,  label: '15 ft passage' },
  { weight: 2, value: 12, label: '60 ft great hall' },
];

// Room shape
export const ROOM_SHAPE: TableEntry<RoomShape>[] = [
  { weight: 35, value: 'square',    label: 'Square' },
  { weight: 40, value: 'rectangle', label: 'Rectangle' },
  { weight: 15, value: 'circle',    label: 'Circle' },
  { weight: 10, value: 'irregular', label: 'Irregular' },
];

export const IRREGULAR_VARIANT: TableEntry<IrregularVariant>[] = [
  { weight: 30, value: 'l_shape', label: 'L-shaped' },
  { weight: 20, value: 'cross',   label: 'Cross-shaped' },
  { weight: 25, value: 'notched', label: 'Notched' },
  { weight: 25, value: 'cavern',  label: 'Rough cavern' },
];

// Room dimensions in 5 ft cells. Squares and circles use the small table;
// rectangles and irregular rooms use the large one.
export const ROOM_SIZE_SMALL: TableEntry<number>[] = [
  { weight: 15, value: 4,  label: '20 ft' },
  { weight: 35, value: 6,  label: '30 ft' },
  { weight: 30, value: 8,  label: '40 ft' },
  { weight: 20, value: 10, label: '50 ft' },
];

export const ROOM_SIZE_LARGE: TableEntry<number>[] = [
  { weight: 5,  value: 4,  label: '20 ft' },
  { weight: 20, value: 6,  label: '30 ft' },
  { weight: 27, value: 8,  label: '40 ft' },
  { weight: 25, value: 10, label: '50 ft' },
  { weight: 15, value: 12, label: '60 ft' },
  { weight: 7,  value: 16, label: '80 ft' },
  { weight: 1,  value: 20, label: '100 ft' },
];

// Room contents. Level-adjusted: higher level shifts monster weight up.
export const ROOM_CONTENTS_BASE: TableEntry<RoomContentsType>[] = [
  { weight: 30, value: 'empty',            label: 'Empty' },
  { weight: 25, value: 'monster',          label: 'Monster' },
  { weight: 15, value: 'monster_treasure', label: 'Monster with Treasure' },
  { weight: 10, value: 'trap',             label: 'Trap' },
  { weight: 5,  value: 'trap_treasure',    label: 'Trap with Treasure' },
  { weight: 5,  value: 'special',          label: 'Special' },
  { weight: 10, value: 'treasure',         label: 'Unguarded Treasure' },
];

export function roomContentsTable(level: number): TableEntry<RoomContentsType>[] {
  const bonus = Math.min(level - 1, 9) * 2;
  return ROOM_CONTENTS_BASE.map(e => ({
    ...e,
    weight: e.value === 'monster' || e.value === 'monster_treasure'
      ? e.weight + bonus
      : Math.max(1, e.weight - Math.floor(bonus / 2)),
  }));
}

// Door type
export const DOOR_TYPE: TableEntry<DoorType>[] = [
  { weight: 30, value: 'wooden',        label: 'Wooden' },
  { weight: 10, value: 'wooden_locked', label: 'Wooden (locked)' },
  { weight: 10, value: 'wooden_stuck',  label: 'Wooden (stuck)' },
  { weight: 15, value: 'stone',         label: 'Stone' },
  { weight: 10, value: 'stone_secret',  label: 'Stone (secret)' },
  { weight: 10, value: 'iron',          label: 'Iron' },
  { weight: 10, value: 'portcullis',    label: 'Portcullis' },
  { weight: 5,  value: 'archway',       label: 'Archway (no door)' },
];

// Door on a room exit: half the time there simply isn't one.
export type ExitDoorResult = DoorType | 'none';
export const EXIT_DOOR: TableEntry<ExitDoorResult>[] = [
  { weight: 50, value: 'none', label: 'Open (no door)' },
  ...DOOR_TYPE.map(e => ({ ...e, weight: Math.max(1, Math.round(e.weight / 2)) })),
];

// Trap types — used for both passage and room traps
export const TRAP_TYPE: TableEntry<TrapType>[] = [
  { weight: 15, value: 'pit',            label: 'Pit' },
  { weight: 10, value: 'spiked_pit',     label: 'Spiked pit' },
  { weight: 8,  value: 'chute',          label: 'Chute' },
  { weight: 8,  value: 'teleporter',     label: 'Teleporter' },
  { weight: 8,  value: 'gas',            label: 'Gas' },
  { weight: 8,  value: 'flooding',       label: 'Flooding room' },
  { weight: 8,  value: 'ceiling_block',  label: 'Ceiling block' },
  { weight: 10, value: 'dart',           label: 'Dart trap' },
  { weight: 8,  value: 'spear',          label: 'Spear trap' },
  { weight: 7,  value: 'pendulum_blade', label: 'Pendulum blade' },
  { weight: 5,  value: 'rolling_rock',   label: 'Rolling rock' },
  { weight: 5,  value: 'portcullis_drop',label: 'Portcullis drop' },
];

// Room dressing with flavour strings
export interface DressingEntry extends TableEntry<DressingType> {
  flavours: string[];
}

export const ROOM_DRESSING: DressingEntry[] = [
  {
    weight: 12, value: 'furnishings', label: 'Furnishings',
    flavours: [
      'Rotting wooden table and benches', 'Overturned iron throne',
      'Crude straw pallets lining the walls', 'Heavy oak desk, drawers empty',
    ],
  },
  {
    weight: 10, value: 'debris', label: 'Debris',
    flavours: [
      'Broken pottery and shattered crates', 'Scattered bones of small animals',
      'Crumbled plaster and stone chips', 'Tattered cloth scraps and splinters',
    ],
  },
  {
    weight: 8, value: 'refuse', label: 'Refuse',
    flavours: [
      'Heaped gnawed bones and offal', 'Reeking refuse pile, recently disturbed',
      'Discarded equipment and rags', 'Rotten food and broken weapons',
    ],
  },
  {
    weight: 6, value: 'shrine', label: 'Shrine',
    flavours: [
      'Crude altar of stacked stones, stained dark', 'Stone idol of unknown deity, eyes inlaid with dull glass',
      'Candle-blackened alcove with guttered torches', 'Defaced holy symbol carved into the floor',
    ],
  },
  {
    weight: 6, value: 'pool', label: 'Pool',
    flavours: [
      'Stagnant black water, no apparent bottom', 'Shallow pool, faintly luminescent',
      'Natural spring, water cold and clear', 'Brackish pool ringed with yellow mineral deposits',
    ],
  },
  {
    weight: 8, value: 'statue', label: 'Statue',
    flavours: [
      'Stern warrior in archaic armour, sword raised', 'Crouching gargoyle, chipped and worn',
      'Faceless figure, hands outstretched', 'Broken pedestal, no statue remains',
    ],
  },
  {
    weight: 6, value: 'tapestry', label: 'Tapestry',
    flavours: [
      'Faded tapestry depicting a siege, moths have ruined the edges',
      'Rotting cloth banner bearing an unknown heraldic device',
      'Tattered map-like weaving, details obscured by age',
    ],
  },
  {
    weight: 8, value: 'writing', label: 'Writing on wall',
    flavours: [
      'Warning scratched in common: "Do not open the lower door"',
      'Tally marks, hundreds of them', 'Names carved deeply — none recognisable',
      'Arcane notation chalked across the entire east wall',
    ],
  },
  {
    weight: 10, value: 'bones', label: 'Bones',
    flavours: [
      'Humanoid skeleton slumped against the wall, manacled',
      'Scattered bones of many creatures, long picked clean',
      'Fresh gnaw marks on a large ribcage',
      'Skulls arranged in a deliberate pattern on the floor',
    ],
  },
  {
    weight: 8, value: 'tracks', label: 'Tracks',
    flavours: [
      'Large clawed tracks lead north and do not return',
      'Numerous booted footprints, several days old',
      'Drag marks through the dust, heading east',
      'Small rodent tracks everywhere, overlapping',
    ],
  },
  {
    weight: 9, value: 'smell', label: 'Smell',
    flavours: [
      'Pervasive smell of decay', 'Sharp tang of burnt pitch',
      'Sweet sickly odour with no visible source',
      'Metallic blood scent, stronger near the south wall',
    ],
  },
  {
    weight: 9, value: 'sound', label: 'Sound',
    flavours: [
      'Faint dripping from somewhere above',
      'Distant rhythmic scraping, direction unclear',
      'Low moaning carried on a faint draft',
      'Intermittent clicking, like claws on stone',
    ],
  },
];

// Stairs
export const STAIR_TYPE: TableEntry<StairType>[] = [
  { weight: 25, value: 'down_one',       label: 'Down one level' },
  { weight: 10, value: 'down_two',       label: 'Down two levels' },
  { weight: 15, value: 'up_one',         label: 'Up one level' },
  { weight: 10, value: 'up_dead_end',    label: 'Up to dead end' },
  { weight: 15, value: 'trap_door_down', label: 'Trap door down' },
  { weight: 15, value: 'chimney_up',     label: 'Chimney up' },
  { weight: 10, value: 'shaft',          label: 'Shaft (up or down)' },
];

// Number of exits for a room (besides the one you came in by)
export const ROOM_EXITS: TableEntry<number>[] = [
  { weight: 35, value: 1, label: '1 exit' },
  { weight: 40, value: 2, label: '2 exits' },
  { weight: 20, value: 3, label: '3 exits' },
  { weight: 5,  value: 4, label: '4 exits' },
];

// Width of a passage leaving a room, in cells. Rolled silently.
export const EXIT_WIDTH: TableEntry<number>[] = [
  { weight: 30, value: 1, label: '5 ft' },
  { weight: 55, value: 2, label: '10 ft' },
  { weight: 15, value: 4, label: '20 ft' },
];
