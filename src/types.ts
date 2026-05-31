export type Direction = 'north' | 'east' | 'south' | 'west';
export type DungeonSize = 'small' | 'medium' | 'large';
export type RoomShape = 'square' | 'rectangle' | 'circle' | 'irregular';
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
  | 'dead_end';

export type TurnType =
  | 'left_90'
  | 'right_90'
  | 'left_45_ahead'
  | 'right_45_ahead'
  | 'y_intersection'
  | 't_intersection'
  | 'x_intersection';

export type SidePassageType =
  | 'left'
  | 'right'
  | 'both'
  | 'ahead_left_right'
  | 'passage_t';

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
  rect: GridRect;
  contents: RoomContentsType;
  trap?: TrapType;
  dressing?: { type: DressingType; flavour: string };
  exits: Exit[];
  notes: string;
  isEntrance: boolean;
}

export interface Corridor {
  id: string;
  rect: GridRect;
  direction: Direction;
  fromId: string;
  toId: string | null;
  doorType?: DoorType;
}

export interface Exit {
  direction: Direction;
  doorType?: DoorType;
  corridorId: string | null;
  exitPoint: GridPos;
}

export interface GenerationCursor {
  type: 'corridor_end';
  corridorId: string;
  position: GridPos;
  direction: Direction;
}

export interface RollRecord {
  id: string;
  table: string;
  diceResult: number;
  outcome: string;
  outcomeKey: string;
  overridden: boolean;
  overrideValue?: string;
  step: number;
  targetId?: string;
}

export interface DungeonSettings {
  level: number;
  size: DungeonSize;
  startDirection: Direction;
}

export interface DungeonState {
  settings: DungeonSettings;
  started: boolean;
  rooms: Room[];
  corridors: Corridor[];
  cursors: GenerationCursor[];
  rollHistory: RollRecord[];
  stepCount: number;
  selectedRoomId: string | null;
  occupied: string[];
}
