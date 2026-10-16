import {
  PERIODIC_CHECK, TURN_TYPE, SIDE_PASSAGE, DOOR_LOCATION, DEAD_END, PASSAGE_COLLISION,
  PASSAGE_LENGTH, PASSAGE_WIDTH, SPECIAL_PASSAGE, ROOM_SHAPE, IRREGULAR_VARIANT,
  ROOM_SIZE_LARGE, ROOM_CONTENTS_BASE, ROOM_EXITS, DOOR_TYPE, EXIT_DOOR, TRAP_TYPE,
  ROOM_DRESSING, STAIR_TYPE, type TableEntry,
} from './tables.js';
import { allMonsterOptions, allTreasureOptions, SPECIAL_FEATURE } from './content.js';

export type OptionEntry = { value: string | number; label: string };

function options(table: readonly TableEntry<unknown>[]): OptionEntry[] {
  return table.map(e => ({ value: String(e.value), label: e.label }));
}

/**
 * The outcomes a user may force for each logged table. Built from the real
 * tables so the two cannot drift apart.
 */
export const TABLE_OPTIONS: Record<string, OptionEntry[]> = {
  'Periodic Check': options(PERIODIC_CHECK),
  'Turn Type': options(TURN_TYPE),
  'Side Passage': options(SIDE_PASSAGE),
  'Door Location': options(DOOR_LOCATION),
  'Dead End': options(DEAD_END),
  'Passage Collision': options(PASSAGE_COLLISION),
  'Passage Length': options(PASSAGE_LENGTH),
  'Passage Width': options(PASSAGE_WIDTH),
  'Special Passage': options(SPECIAL_PASSAGE),
  'Stair Type': options(STAIR_TYPE),
  'Room Shape': options(ROOM_SHAPE),
  'Irregular Shape': options(IRREGULAR_VARIANT),
  'Room Width': options(ROOM_SIZE_LARGE),
  'Room Depth': options(ROOM_SIZE_LARGE),
  'Room Contents': options(ROOM_CONTENTS_BASE),
  'Room Exits': options(ROOM_EXITS),
  'Exit Door': options(EXIT_DOOR),
  'Door Type': options(DOOR_TYPE),
  'Trap Type': options(TRAP_TYPE),
  'Room Dressing': options(ROOM_DRESSING),
  'Monster': options(allMonsterOptions()),
  'Zone Inhabitants': options(allMonsterOptions()),
  'Treasure': options(allTreasureOptions()),
  'Special Feature': options(SPECIAL_FEATURE),
};
