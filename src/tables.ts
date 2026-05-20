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
} from './types.js';

export interface TableEntry<T> {
  weight: number;
  value: T;
  label: string;
}

export function weightedRoll<E extends TableEntry<unknown>>(table: E[]): E {
  const total = table.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.floor(Math.random() * total);
  for (const entry of table) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return table[table.length - 1];
}

export function rollD(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

// Periodic check — every 60ft of passage. Weights approximate 1e DMG table.
export const PERIODIC_CHECK: TableEntry<PeriodicCheckResult>[] = [
  { weight: 30, value: 'continue',     label: 'Passage continues' },
  { weight: 15, value: 'turn',         label: 'Passage turns' },
  { weight: 10, value: 'door',         label: 'Door' },
  { weight: 15, value: 'side_passage', label: 'Side passage' },
  { weight: 20, value: 'chamber',      label: 'Chamber or Room' },
  { weight: 10, value: 'dead_end',     label: 'Dead end' },
];

// Turn type table
export const TURN_TYPE: TableEntry<TurnType>[] = [
  { weight: 15, value: 'left_90',       label: 'Left 90°' },
  { weight: 15, value: 'right_90',      label: 'Right 90°' },
  { weight: 20, value: 'left_45_ahead', label: 'Left 45° ahead' },
  { weight: 20, value: 'right_45_ahead',label: 'Right 45° ahead' },
  { weight: 10, value: 'y_intersection',label: 'Y intersection' },
  { weight: 10, value: 't_intersection',label: 'T intersection' },
  { weight: 10, value: 'x_intersection',label: 'X intersection' },
];

// Side passage table
export const SIDE_PASSAGE: TableEntry<SidePassageType>[] = [
  { weight: 30, value: 'left',           label: 'Left' },
  { weight: 30, value: 'right',          label: 'Right' },
  { weight: 15, value: 'both',           label: 'Both sides' },
  { weight: 15, value: 'ahead_left_right', label: 'Ahead, left and right' },
  { weight: 10, value: 'passage_t',      label: "Passage T's" },
];

// Passage width (units = 5ft)
export const PASSAGE_WIDTH: TableEntry<number>[] = [
  { weight: 40, value: 1, label: '5 ft' },
  { weight: 35, value: 2, label: '10 ft' },
  { weight: 15, value: 4, label: '20 ft' },
  { weight: 7,  value: 6, label: '30 ft' },
  { weight: 3,  value: 0, label: 'Special' },
];

// Room shape
export const ROOM_SHAPE: TableEntry<RoomShape>[] = [
  { weight: 35, value: 'square',    label: 'Square' },
  { weight: 40, value: 'rectangle', label: 'Rectangle' },
  { weight: 15, value: 'circle',    label: 'Circle' },
  { weight: 10, value: 'irregular', label: 'Irregular' },
];

// Room size in grid squares (one unit = 10ft), single dimension for square/circle
export const ROOM_SIZE_SMALL: TableEntry<number>[] = [
  { weight: 25, value: 2, label: '20 ft' },
  { weight: 35, value: 3, label: '30 ft' },
  { weight: 25, value: 4, label: '40 ft' },
  { weight: 15, value: 5, label: '50 ft' },
];

export const ROOM_SIZE_LARGE: TableEntry<number>[] = [
  { weight: 20, value: 4, label: '40 ft' },
  { weight: 30, value: 5, label: '50 ft' },
  { weight: 25, value: 6, label: '60 ft' },
  { weight: 15, value: 8, label: '80 ft' },
  { weight: 10, value: 10, label: '100 ft' },
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

// Number of exits for a room (varies by room size hint)
export const ROOM_EXITS: TableEntry<number>[] = [
  { weight: 20, value: 1, label: '1 exit' },
  { weight: 40, value: 2, label: '2 exits' },
  { weight: 25, value: 3, label: '3 exits' },
  { weight: 15, value: 4, label: '4 exits' },
];
