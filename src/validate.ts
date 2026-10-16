import { TRAP_DETAIL } from './content.js';

// Structural validation for dungeon state that comes from outside the app
// (the autosave slot, or a file the user loads). Anything the renderer or the
// generator would dereference must be present and the right type, otherwise a
// damaged entry could crash the app on every start.

const DIRECTIONS = ['north', 'east', 'south', 'west'];
const SIZES = ['small', 'medium', 'large'];
const SHAPES = ['square', 'rectangle', 'circle', 'irregular'];
const VARIANTS = ['l_shape', 'cross', 'notched', 'cavern'];
const CONTENTS = ['empty', 'monster', 'monster_treasure', 'trap', 'trap_treasure', 'special', 'treasure'];
const KINDS = ['passage', 'junction', 'stairs'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const oneOf = (v: unknown, list: string[]): boolean => isStr(v) && list.includes(v);

function validRect(v: unknown, positive = true): boolean {
  if (!isObj(v)) return false;
  if (![v.x, v.y, v.w, v.h].every(isNum)) return false;
  return !positive || ((v.w as number) > 0 && (v.h as number) > 0);
}

function validPos(v: unknown): boolean {
  return isObj(v) && isNum(v.x) && isNum(v.y);
}

/** Returns a description of the first problem found, or null if the state is usable. */
export function validateState(value: unknown): string | null {
  if (!isObj(value)) return 'it is not an object';
  const s = value;

  if (s.version !== 2) return 'it has the wrong version';
  if (typeof s.started !== 'boolean') return '"started" is missing';
  for (const k of ['seed', 'rngState', 'nextId', 'nextZone', 'stepCount']) {
    if (!isNum(s[k])) return `"${k}" is missing or not a number`;
  }
  if (s.selectedRoomId !== null && !isStr(s.selectedRoomId)) return '"selectedRoomId" is invalid';
  if (!isObj(s.zones) || !Object.values(s.zones).every(isStr)) return '"zones" is invalid';

  const set = s.settings;
  if (!isObj(set) || !isNum(set.level) || !oneOf(set.size, SIZES) || !oneOf(set.startDirection, DIRECTIONS)) {
    return '"settings" is invalid';
  }

  for (const k of ['rooms', 'corridors', 'cursors', 'rollHistory']) {
    if (!Array.isArray(s[k])) return `"${k}" is missing`;
  }

  for (const [i, r] of (s.rooms as unknown[]).entries()) {
    const at = `rooms[${i}]`;
    if (!isObj(r)) return `${at} is not an object`;
    if (!isStr(r.id)) return `${at}.id is invalid`;
    if (!oneOf(r.shape, SHAPES)) return `${at}.shape is invalid`;
    if (r.variant !== undefined && !oneOf(r.variant, VARIANTS)) return `${at}.variant is invalid`;
    if (!validRect(r.rect)) return `${at}.rect is invalid`;
    if (!Array.isArray(r.cutouts) || !r.cutouts.every(c => validRect(c, false))) return `${at}.cutouts is invalid`;
    if (!isNum(r.zone)) return `${at}.zone is invalid`;
    if (!oneOf(r.contents, CONTENTS)) return `${at}.contents is invalid`;
    if (r.trap !== undefined && !(isStr(r.trap) && r.trap in TRAP_DETAIL)) return `${at}.trap is invalid`;
    for (const k of ['monster', 'treasure', 'special']) {
      if (r[k] !== undefined && !isStr(r[k])) return `${at}.${k} is invalid`;
    }
    if (r.dressing !== undefined && !(isObj(r.dressing) && isStr(r.dressing.type) && isStr(r.dressing.flavour))) {
      return `${at}.dressing is invalid`;
    }
    if (!isStr(r.notes)) return `${at}.notes is invalid`;
    if (!Array.isArray(r.exits) || !r.exits.every(e => isObj(e) && oneOf(e.direction, DIRECTIONS) && validPos(e.exitPoint))) {
      return `${at}.exits is invalid`;
    }
  }

  for (const [i, c] of (s.corridors as unknown[]).entries()) {
    const at = `corridors[${i}]`;
    if (!isObj(c)) return `${at} is not an object`;
    if (!isStr(c.id) || !isStr(c.fromId)) return `${at} has an invalid id`;
    if (!oneOf(c.kind, KINDS)) return `${at}.kind is invalid`;
    if (!validRect(c.rect)) return `${at}.rect is invalid`;
    if (!oneOf(c.direction, DIRECTIONS)) return `${at}.direction is invalid`;
    if (!isNum(c.width) || !isNum(c.zone)) return `${at} has an invalid width or zone`;
    if (!Array.isArray(c.joins) || !c.joins.every(isStr)) return `${at}.joins is invalid`;
    if (c.doorType !== undefined && !isStr(c.doorType)) return `${at}.doorType is invalid`;
  }

  for (const [i, c] of (s.cursors as unknown[]).entries()) {
    const at = `cursors[${i}]`;
    if (!isObj(c)) return `${at} is not an object`;
    if (!isStr(c.corridorId)) return `${at}.corridorId is invalid`;
    if (!validPos(c.position)) return `${at}.position is invalid`;
    if (!oneOf(c.direction, DIRECTIONS)) return `${at}.direction is invalid`;
    if (!isNum(c.width) || !isNum(c.zone)) return `${at} has an invalid width or zone`;
    const f = c.forced;
    if (f !== undefined) {
      const ok = isObj(f) && (f.kind === 'chamber' || (f.kind === 'bend' && oneOf(f.dir, DIRECTIONS)));
      if (!ok) return `${at}.forced is invalid`;
    }
  }

  for (const [i, r] of (s.rollHistory as unknown[]).entries()) {
    const at = `rollHistory[${i}]`;
    if (!isObj(r)) return `${at} is not an object`;
    if (![r.id, r.table, r.outcome, r.outcomeKey].every(isStr)) return `${at} has invalid text fields`;
    if (![r.diceResult, r.sides, r.step].every(isNum)) return `${at} has invalid numbers`;
    if (r.note !== undefined && !isStr(r.note)) return `${at}.note is invalid`;
  }

  return null;
}
