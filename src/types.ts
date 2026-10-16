export type Direction = 'north' | 'east' | 'south' | 'west';
export type DungeonSize = 'small' | 'medium' | 'large';
export type RoomShape = 'square' | 'rectangle' | 'circle' | 'irregular';
export type IrregularVariant = 'l_shape' | 'cross' | 'notched' | 'cavern';
export type RoomContentsType =
  | 'empty'
  | 'monster'
  | 'monster_treasure'
  | 'trap'
  | 'trap_treasure'
  | 'special'
  | 'treasure';

export type DoorType =
  | 'wooden'
  | 'wooden_locked'
  | 'wooden_stuck'
  | 'stone'
  | 'stone_secret'
  | 'iron'
  | 'portcullis'
  | 'archway';

export type PeriodicCheckResult =
  | 'continue'
  | 'turn'
  | 'door'
  | 'side_passage'
  | 'chamber'
  | 'stairs'
  | 'dead_end';

export type TurnType =
  | 'left_90'
  | 'right_90'
  | 'left_45_ahead'
  | 'right_45_ahead'
  | 'y_intersection'
  | 't_intersection'
  | 'x_intersection';

export type SidePassageType = 'left' | 'right' | 'both' | 'passage_t';
export type DoorLocation = 'ahead' | 'left' | 'right';
export type DeadEndResult = 'dead_end' | 'secret_door';
export type CollisionResult = 'join' | 'wall';

export type StairType =
  | 'down_one'
  | 'down_two'
  | 'up_one'
  | 'up_dead_end'
  | 'trap_door_down'
  | 'chimney_up'
  | 'shaft';

export type TrapType =
  | 'pit'
  | 'spiked_pit'
  | 'chute'
  | 'teleporter'
  | 'gas'
  | 'flooding'
  | 'ceiling_block'
  | 'dart'
  | 'spear'
  | 'pendulum_blade'
  | 'rolling_rock'
  | 'portcullis_drop';

export type DressingType =
  | 'furnishings'
  | 'debris'
  | 'refuse'
  | 'shrine'
  | 'pool'
  | 'statue'
  | 'tapestry'
  | 'writing'
  | 'bones'
  | 'tracks'
  | 'smell'
  | 'sound';

// One grid cell is 5 ft.
export interface GridPos {
  x: number;
  y: number;
}

export interface GridRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Room {
  id: string;
  shape: RoomShape;
  variant?: IrregularVariant;
  /** Bounding rectangle. Cells inside `cutouts` are solid rock, not floor. */
  rect: GridRect;
  cutouts: GridRect[];
  zone: number;
  contents: RoomContentsType;
  trap?: TrapType;
  dressing?: { type: DressingType; flavour: string };
  monster?: string;
  treasure?: string;
  special?: string;
  exits: Exit[];
  notes: string;
}

export type CorridorKind = 'passage' | 'junction' | 'stairs';

export interface Corridor {
  id: string;
  kind: CorridorKind;
  rect: GridRect;
  direction: Direction;
  /** Cross-section in cells. */
  width: number;
  fromId: string;
  /** Ids of existing areas this passage runs into and opens onto (loops). */
  joins: string[];
  zone: number;
  /** Door on the entry face of this passage. */
  doorType?: DoorType;
  stairs?: StairType;
}

export interface Exit {
  direction: Direction;
  doorType?: DoorType;
  corridorId: string | null;
  exitPoint: GridPos;
}

export type ForcedAction =
  /** Turn the passage to `dir` without rolling (used to finish a jog). */
  | { kind: 'bend'; dir: Direction }
  /** The passage opens straight into a chamber (a side door). */
  | { kind: 'chamber' };

export interface GenerationCursor {
  type: 'corridor_end';
  corridorId: string;
  /** First free cell beyond the end of the passage, on its centre line. */
  position: GridPos;
  direction: Direction;
  /** Width of the passage that arrived here, in cells. */
  width: number;
  zone: number;
  forced?: ForcedAction;
}

export interface RollRecord {
  id: string;
  table: string;
  /** Extra context, e.g. "left branch". */
  note?: string;
  /** The die as actually rolled (1..sides). */
  diceResult: number;
  sides: number;
  outcome: string;
  outcomeKey: string;
  step: number;
}

export interface DungeonSettings {
  level: number;
  size: DungeonSize;
  startDirection: Direction;
}

export interface DungeonState {
  version: 2;
  settings: DungeonSettings;
  seed: number;
  rngState: number;
  nextId: number;
  nextZone: number;
  started: boolean;
  rooms: Room[];
  corridors: Corridor[];
  cursors: GenerationCursor[];
  rollHistory: RollRecord[];
  stepCount: number;
  selectedRoomId: string | null;
  /** zone id -> dominant monster name. */
  zones: Record<string, string>;
}
