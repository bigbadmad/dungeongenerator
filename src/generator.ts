import type {
  DungeonState,
  DungeonSettings,
  DungeonSize,
  Room,
  Corridor,
  CorridorKind,
  GenerationCursor,
  ForcedAction,
  Direction,
  GridPos,
  GridRect,
  RollRecord,
  Exit,
  DoorType,
  IrregularVariant,
  PeriodicCheckResult,
  RoomShape,
  StairType,
  TurnType,
} from './types.js';
import { Rng, randomSeed } from './rng.js';
import {
  rollTable,
  PERIODIC_CHECK,
  TURN_TYPE,
  SIDE_PASSAGE,
  DOOR_LOCATION,
  DEAD_END,
  PASSAGE_COLLISION,
  PASSAGE_LENGTH,
  PASSAGE_WIDTH,
  SPECIAL_PASSAGE,
  ROOM_SHAPE,
  IRREGULAR_VARIANT,
  ROOM_SIZE_SMALL,
  ROOM_SIZE_LARGE,
  ROOM_CONTENTS_BASE,
  ROOM_EXITS,
  EXIT_WIDTH,
  DOOR_TYPE,
  EXIT_DOOR,
  TRAP_TYPE,
  ROOM_DRESSING,
  STAIR_TYPE,
  roomContentsTable,
  type TableEntry,
} from './tables.js';
import {
  monsterTable,
  allMonsterOptions,
  describeMonsters,
  treasureTable,
  allTreasureOptions,
  describeTreasure,
  SPECIAL_FEATURE,
  trapDetail,
} from './content.js';
import {
  advance,
  turnLeft,
  turnRight,
  opposite,
  DIRECTIONS,
  isVertical,
  posKey,
  rectCells,
  claim,
  canPlace,
  corridorRect,
  edgePoint,
  roomCells,
  irregularCutouts,
  translateRects,
  exitCandidates,
  roomShapeLabel,
  buildOwners,
  type Owners,
} from './geometry.js';

export { advance, turnLeft, turnRight, opposite } from './geometry.js';

// ── Size budget ─────────────────────────────────────────────────────────────
//
// `settings.size` steers generation. Each seed picks a target room count
// between `min` and `max`: below `min` rooms the dungeon is not allowed to die
// out (and will sprout an extra passage if it has to); once the target is
// reached no more chambers or branches are made and everything winds down.

export const SIZE_BUDGET: Record<DungeonSize, { min: number; max: number }> = {
  small:  { min: 5,  max: 8 },
  medium: { min: 10, max: 16 },
  large:  { min: 20, max: 30 },
};

/** Cursors open at once beyond which no new branches are made. */
const MAX_OPEN_CURSORS = 6;
const MAX_WIDTH = 12;

// ── State construction ──────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: DungeonSettings = {
  level: 1,
  size: 'medium',
  startDirection: 'north',
};

export function createInitialState(
  settings: Partial<DungeonSettings> = {},
  seed: number = randomSeed(),
  overrides: Record<string, string> = {},
): DungeonState {
  return {
    version: 2,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    seed: seed >>> 0,
    rngState: seed >>> 0,
    nextId: 1,
    nextZone: 1,
    started: false,
    rooms: [],
    corridors: [],
    cursors: [],
    rollHistory: [],
    stepCount: 0,
    selectedRoomId: null,
    overrides: { ...overrides },
    zones: {},
  };
}

// ── Step context ────────────────────────────────────────────────────────────
//
// One Ctx lives for exactly one step. It is built from the previous state,
// mutated while the step runs, and folded back into a new state at the end.

interface Ctx {
  rng: Rng;
  settings: DungeonSettings;
  seed: number;
  overrides: Record<string, string>;
  step: number;
  rolls: RollRecord[];
  counters: Map<string, number>;
  owners: Owners;
  rooms: Room[];
  corridors: Corridor[];
  cursors: GenerationCursor[];
  zones: Record<string, string>;
  nextId: number;
  nextZone: number;
}

function makeCtx(state: DungeonState, step: number): Ctx {
  return {
    rng: new Rng(state.rngState),
    settings: state.settings,
    seed: state.seed,
    overrides: state.overrides ?? {},
    step,
    rolls: [],
    counters: new Map(),
    owners: buildOwners(state.rooms, state.corridors),
    rooms: [...state.rooms],
    corridors: [...state.corridors],
    cursors: [...state.cursors],
    zones: { ...state.zones },
    nextId: state.nextId,
    nextZone: state.nextZone,
  };
}

function finish(state: DungeonState, ctx: Ctx): DungeonState {
  return {
    ...state,
    started: true,
    rngState: ctx.rng.state,
    nextId: ctx.nextId,
    nextZone: ctx.nextZone,
    rooms: ctx.rooms,
    corridors: ctx.corridors,
    cursors: ctx.cursors,
    rollHistory: [...state.rollHistory, ...ctx.rolls],
    stepCount: ctx.step + 1,
    zones: ctx.zones,
  };
}

function newId(ctx: Ctx, prefix: string): string {
  return `${prefix}_${ctx.nextId++}`;
}

function newZone(ctx: Ctx): number {
  return ctx.nextZone++;
}

// ── Rolling ─────────────────────────────────────────────────────────────────

interface RollOpts<T> {
  note?: string;
  /** Full list of outcomes an override may choose from (defaults to the table rolled). */
  all?: readonly TableEntry<T>[];
}

/**
 * Rolls a table and logs it. The die is real: the outcome is read straight
 * off the table band the die lands in. If the user has overridden this roll,
 * the override replaces the outcome but the die is still consumed, so the rest
 * of the dungeon stays on the same random stream.
 */
function roll<T>(ctx: Ctx, table: string, entries: readonly TableEntry<T>[], opts: RollOpts<T> = {}): TableEntry<T> {
  const { entry: natural, die, sides } = rollTable(entries, ctx.rng);
  const n = (ctx.counters.get(table) ?? 0) + 1;
  ctx.counters.set(table, n);
  const key = `${ctx.step}|${table}|${n}`;

  let entry = natural;
  let overridden = false;
  const wanted = ctx.overrides[key];
  if (wanted !== undefined) {
    const found = (opts.all ?? entries).find(e => String(e.value) === wanted);
    if (found) { entry = found; overridden = true; }
  }

  ctx.rolls.push({
    id: key,
    key,
    table,
    note: opts.note,
    diceResult: die,
    sides,
    outcome: entry.label,
    outcomeKey: String(entry.value),
    overridden,
    naturalOutcome: overridden ? natural.label : undefined,
    step: ctx.step,
  });
  return entry;
}

/** A roll that is not shown or overridable (still draws from the RNG). */
function rollQuiet<T>(ctx: Ctx, entries: readonly TableEntry<T>[]): T {
  return rollTable(entries, ctx.rng).entry.value;
}

/** A log line for something that happened without a dice roll. */
function logEvent(ctx: Ctx, table: string, outcome: string, note?: string): void {
  const n = (ctx.counters.get(table) ?? 0) + 1;
  ctx.counters.set(table, n);
  const key = `${ctx.step}|${table}|${n}`;
  ctx.rolls.push({
    id: key, key, table, note, diceResult: 0, sides: 0,
    outcome, outcomeKey: '', overridden: false, step: ctx.step,
  });
}

function rollWidth(ctx: Ctx, note?: string): number {
  const e = roll(ctx, 'Passage Width', PASSAGE_WIDTH, { note });
  if (e.value !== 0) return e.value;
  return roll(ctx, 'Special Passage', SPECIAL_PASSAGE, { note }).value;
}

function areaName(ctx: Ctx, id: string): string {
  const i = ctx.rooms.findIndex(r => r.id === id);
  return i >= 0 ? `Room ${i + 1}` : 'a passage';
}

// ── Placement ───────────────────────────────────────────────────────────────

interface PassageSpec {
  start: GridPos;
  dir: Direction;
  maxLen: number;
  minLen?: number;
  width: number;
  parentId: string;
  zone: number;
  kind?: CorridorKind;
  doorType?: DoorType;
  stairs?: StairType;
  /** Whether running into an existing area may open onto it (making a loop). */
  allowJoin?: boolean;
}

interface Placed {
  corridor: Corridor;
  /** True if the passage ended by opening onto an existing area. */
  joined: boolean;
}

/**
 * Places a passage, shortening or narrowing it to fit. Looks along its centre
 * line for existing areas: running into one rolls on the collision table —
 * either the passage opens onto it (creating a loop) or stops short of the wall.
 */
function placePassage(ctx: Ctx, spec: PassageSpec): Placed | null {
  const minLen = spec.minLen ?? 2;
  let maxLen = spec.maxLen;
  let joinId: string | null = null;

  let obstacleAt = -1;
  for (let i = 0; i <= maxLen; i++) {
    const p = advance(spec.start, spec.dir, i);
    if (ctx.owners.has(posKey(p.x, p.y))) { obstacleAt = i; break; }
  }
  if (obstacleAt === 0) return null;
  if (obstacleAt > 0) {
    const p = advance(spec.start, spec.dir, obstacleAt);
    const other = ctx.owners.get(posKey(p.x, p.y))!;
    if (other !== spec.parentId && (spec.allowJoin ?? true)) {
      const res = roll(ctx, 'Passage Collision', PASSAGE_COLLISION, { note: `${areaName(ctx, other)} ahead` });
      if (res.value === 'join') { joinId = other; maxLen = obstacleAt; }
      else maxLen = obstacleAt - 2;
    } else {
      maxLen = obstacleAt - 2;
    }
    if (joinId === null && maxLen < minLen) return null;
  }

  const widths = [...new Set([spec.width, Math.min(spec.width, 2), 1])].sort((a, b) => b - a);
  const allowed = new Set([spec.parentId]);
  if (joinId) allowed.add(joinId);

  for (const w of widths) {
    for (let len = maxLen; len >= (joinId ? maxLen : minLen); len--) {
      const rect = corridorRect(spec.start, spec.dir, len, w);
      const cells = rectCells(rect);
      if (!canPlace(cells, ctx.owners, allowed)) continue;

      const corridor: Corridor = {
        id: newId(ctx, 'cor'),
        kind: spec.kind ?? 'passage',
        rect,
        direction: spec.dir,
        width: w,
        fromId: spec.parentId,
        joins: joinId ? [joinId] : [],
        zone: spec.zone,
        doorType: spec.doorType,
        stairs: spec.stairs,
      };
      claim(ctx.owners, cells, corridor.id);
      ctx.corridors.push(corridor);
      return { corridor, joined: joinId !== null };
    }
  }
  return null;
}

function cursorFor(corridor: Corridor, forced?: ForcedAction): GenerationCursor {
  return {
    type: 'corridor_end',
    corridorId: corridor.id,
    position: edgePoint(corridor.rect, corridor.direction),
    direction: corridor.direction,
    width: corridor.width,
    zone: corridor.zone,
    forced,
  };
}

interface BranchSpec {
  dir: Direction;
  label: string;
  width?: number;
  length?: number;
  minLen?: number;
  doorType?: DoorType;
  forced?: ForcedAction;
}

/**
 * Builds a junction block at the cursor and grows the requested branches from
 * its sides. Turns, side passages and intersections are all junctions with
 * different branch sets, so branches never overlap each other.
 */
function buildJunction(ctx: Ctx, cursor: GenerationCursor, branches: BranchSpec[]): boolean {
  const widths = branches.map(b => b.width ?? rollWidth(ctx, b.label));
  const wanted = Math.min(Math.max(cursor.width, ...widths), MAX_WIDTH);

  let rect: GridRect | null = null;
  for (let s = wanted; s >= cursor.width; s--) {
    const candidate = corridorRect(cursor.position, cursor.direction, s, s);
    if (canPlace(rectCells(candidate), ctx.owners, new Set([cursor.corridorId]))) { rect = candidate; break; }
  }
  if (!rect) return false;

  const junction: Corridor = {
    id: newId(ctx, 'jct'),
    kind: 'junction',
    rect,
    direction: cursor.direction,
    width: rect.w,
    fromId: cursor.corridorId,
    joins: [],
    zone: cursor.zone,
  };
  claim(ctx.owners, rectCells(rect), junction.id);
  ctx.corridors.push(junction);

  branches.forEach((b, i) => {
    const zone = i > 0 && ctx.rng.chance(0.4) ? newZone(ctx) : cursor.zone;
    const placed = placePassage(ctx, {
      start: edgePoint(rect!, b.dir),
      dir: b.dir,
      maxLen: b.length ?? rollQuiet(ctx, PASSAGE_LENGTH),
      minLen: b.minLen,
      width: Math.min(widths[i], rect!.w),
      parentId: junction.id,
      zone,
      doorType: b.doorType,
    });
    if (placed && !placed.joined) ctx.cursors.push(cursorFor(placed.corridor, b.forced));
  });
  return true;
}

// ── Size steering ───────────────────────────────────────────────────────────

function openCount(ctx: Ctx): number {
  return ctx.cursors.length + 1; // the cursor being resolved counts too
}

/** The room count this dungeon is aiming for: somewhere in the size's range, fixed by the seed. */
export function roomTarget(size: DungeonSize, seed: number): number {
  const { min, max } = SIZE_BUDGET[size];
  const mixed = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return min + (mixed % (max - min + 1));
}

function isOverBudget(ctx: Ctx): boolean {
  return ctx.rooms.length >= roomTarget(ctx.settings.size, ctx.seed);
}

function periodicTable(ctx: Ctx): TableEntry<PeriodicCheckResult>[] {
  const { min, max } = SIZE_BUDGET[ctx.settings.size];
  const rooms = ctx.rooms.length;
  const open = openCount(ctx);
  const over = isOverBudget(ctx);
  const under = rooms < min;
  const runaway = ctx.step > max * 30;

  return PERIODIC_CHECK.map(e => {
    let w = e.weight;
    if (runaway) {
      w = e.value === 'dead_end' ? 1 : 0;
    } else {
      switch (e.value) {
        case 'chamber':      w = over ? 0 : under ? w * 1.5 : w; break;
        case 'side_passage': w = over || open >= MAX_OPEN_CURSORS ? 0 : w; break;
        case 'door':         w = over ? 0 : w; break;
        case 'continue':     w = over ? w / 2 : w; break;
        case 'dead_end':     w = over ? w * 5 : under && open <= 1 ? 0 : w; break;
      }
    }
    return { ...e, weight: Math.round(w) };
  });
}

function turnTable(ctx: Ctx): TableEntry<TurnType>[] {
  const crowded = isOverBudget(ctx) || openCount(ctx) >= MAX_OPEN_CURSORS;
  return TURN_TYPE.map(e =>
    crowded && (e.value === 'y_intersection' || e.value === 't_intersection' || e.value === 'x_intersection')
      ? { ...e, weight: 0 }
      : e,
  );
}

// ── generateStart ───────────────────────────────────────────────────────────

export function generateStart(state: DungeonState): DungeonState {
  const ctx = makeCtx(state, 0);
  const dir = state.settings.startDirection;
  const entrance: GridPos = { x: 0, y: 0 };

  const width = rollWidth(ctx, 'entrance');
  const len = roll(ctx, 'Passage Length', PASSAGE_LENGTH, { note: 'entrance' }).value;

  const placed = placePassage(ctx, {
    start: entrance, dir, maxLen: len, width, parentId: 'entrance', zone: 0, allowJoin: false,
  });
  if (placed) ctx.cursors.push(cursorFor(placed.corridor));

  return finish({ ...state, started: true }, ctx);
}

// ── generateNext ────────────────────────────────────────────────────────────

export function generateNext(state: DungeonState): DungeonState {
  if (state.cursors.length === 0) return state;

  const ctx = makeCtx(state, state.stepCount);
  const cursor = ctx.cursors.shift()!;

  if (ctx.owners.has(posKey(cursor.position.x, cursor.position.y))) {
    resolveBlockedCursor(ctx, cursor);
  } else if (cursor.forced?.kind === 'bend') {
    handleBend(ctx, cursor, cursor.forced.dir);
  } else if (cursor.forced?.kind === 'chamber') {
    if (!generateRoom(ctx, cursor)) logEvent(ctx, 'Chamber', 'No room for the chamber beyond the door — it opens onto solid rock');
  } else {
    const periodic = roll(ctx, 'Periodic Check', periodicTable(ctx), { all: PERIODIC_CHECK });
    switch (periodic.value) {
      case 'continue':     handleContinue(ctx, cursor); break;
      case 'turn':         handleTurn(ctx, cursor); break;
      case 'door':         handleDoor(ctx, cursor); break;
      case 'side_passage': handleSidePassage(ctx, cursor); break;
      case 'chamber':
        if (!generateRoom(ctx, cursor)) logEvent(ctx, 'Chamber', 'No room for a chamber here — passage ends');
        break;
      case 'stairs':       handleStairs(ctx, cursor); break;
      case 'dead_end':     handleDeadEnd(ctx, cursor); break;
    }
  }

  // A dungeon below its minimum size may not simply stop.
  const { min, max } = SIZE_BUDGET[ctx.settings.size];
  if (ctx.cursors.length === 0 && ctx.rooms.length < min && ctx.step < max * 30) rescue(ctx);

  return finish(state, ctx);
}

/** Runs generateNext until nothing is left to explore. */
export function generateAll(state: DungeonState, maxSteps = 5000): DungeonState {
  let s = state;
  let guard = 0;
  while (s.cursors.length > 0 && guard++ < maxSteps) s = generateNext(s);
  return s;
}

export function isComplete(state: DungeonState): boolean {
  return state.started && state.cursors.length === 0;
}

// ── Step handlers ───────────────────────────────────────────────────────────

/** Another area has grown into the cell this cursor points at. */
function resolveBlockedCursor(ctx: Ctx, cursor: GenerationCursor): void {
  const other = ctx.owners.get(posKey(cursor.position.x, cursor.position.y))!;
  const res = roll(ctx, 'Passage Collision', PASSAGE_COLLISION, { note: `${areaName(ctx, other)} ahead` });
  if (res.value === 'join') {
    ctx.corridors = ctx.corridors.map(c =>
      c.id === cursor.corridorId && !c.joins.includes(other) ? { ...c, joins: [...c.joins, other] } : c,
    );
  }
}

function handleContinue(ctx: Ctx, cursor: GenerationCursor): void {
  const width = rollWidth(ctx);
  const len = roll(ctx, 'Passage Length', PASSAGE_LENGTH).value;
  const placed = placePassage(ctx, {
    start: cursor.position, dir: cursor.direction, maxLen: len, width,
    parentId: cursor.corridorId, zone: cursor.zone,
  });
  if (!placed) { logEvent(ctx, 'Passage', 'Blocked — the passage ends here'); return; }
  if (!placed.joined) ctx.cursors.push(cursorFor(placed.corridor));
}

function handleBend(ctx: Ctx, cursor: GenerationCursor, dir: Direction): void {
  logEvent(ctx, 'Passage Jog', 'The passage bends back to its original heading');
  buildJunction(ctx, cursor, [{ dir, label: 'jog', width: cursor.width }]);
}

function handleTurn(ctx: Ctx, cursor: GenerationCursor): void {
  const turn = roll(ctx, 'Turn Type', turnTable(ctx), { all: TURN_TYPE });
  const d = cursor.direction;
  const left = turnLeft(d);
  const right = turnRight(d);
  const ahead: ForcedAction = { kind: 'bend', dir: d };

  const branch = (dir: Direction, label: string, jog = 0): BranchSpec =>
    jog > 0 ? { dir, label, length: jog, minLen: 1, forced: ahead } : { dir, label };

  let branches: BranchSpec[];
  switch (turn.value) {
    case 'left_90':        branches = [branch(left, 'left')]; break;
    case 'right_90':       branches = [branch(right, 'right')]; break;
    case 'left_45_ahead':  branches = [branch(left, 'left jog', 2)]; break;
    case 'right_45_ahead': branches = [branch(right, 'right jog', 2)]; break;
    case 'y_intersection': branches = [branch(left, 'left fork', 3), branch(right, 'right fork', 3)]; break;
    case 't_intersection': branches = [branch(left, 'left'), branch(right, 'right')]; break;
    case 'x_intersection': branches = [branch(left, 'left'), branch(d, 'ahead'), branch(right, 'right')]; break;
  }
  if (!buildJunction(ctx, cursor, branches)) logEvent(ctx, 'Passage', 'Blocked — the passage ends here');
}

function handleSidePassage(ctx: Ctx, cursor: GenerationCursor): void {
  const side = roll(ctx, 'Side Passage', SIDE_PASSAGE);
  const d = cursor.direction;
  const left = turnLeft(d);
  const right = turnRight(d);
  const b = (dir: Direction, label: string): BranchSpec => ({ dir, label });

  let branches: BranchSpec[];
  switch (side.value) {
    case 'left':      branches = [b(d, 'ahead'), b(left, 'left')]; break;
    case 'right':     branches = [b(d, 'ahead'), b(right, 'right')]; break;
    case 'both':      branches = [b(d, 'ahead'), b(left, 'left'), b(right, 'right')]; break;
    case 'passage_t': branches = [b(left, 'left'), b(right, 'right')]; break;
  }
  if (!buildJunction(ctx, cursor, branches)) logEvent(ctx, 'Passage', 'Blocked — the passage ends here');
}

function handleDoor(ctx: Ctx, cursor: GenerationCursor): void {
  const where = roll(ctx, 'Door Location', DOOR_LOCATION);
  const doorType = roll(ctx, 'Door Type', DOOR_TYPE).value;
  const doorWidth = Math.min(cursor.width, 2);

  if (where.value === 'ahead') {
    const placed = placePassage(ctx, {
      start: cursor.position, dir: cursor.direction,
      maxLen: rollQuiet(ctx, PASSAGE_LENGTH), width: doorWidth,
      parentId: cursor.corridorId, zone: cursor.zone, doorType,
    });
    if (!placed) { logEvent(ctx, 'Passage', 'Blocked — the passage ends here'); return; }
    if (!placed.joined) ctx.cursors.push(cursorFor(placed.corridor));
    return;
  }

  // A door in the side wall: the passage carries on, and the door opens into a chamber.
  const sideDir = where.value === 'left' ? turnLeft(cursor.direction) : turnRight(cursor.direction);
  const ok = buildJunction(ctx, cursor, [
    { dir: cursor.direction, label: 'ahead' },
    { dir: sideDir, label: 'door', width: doorWidth, length: 1, minLen: 1, doorType, forced: { kind: 'chamber' } },
  ]);
  if (!ok) logEvent(ctx, 'Passage', 'Blocked — the passage ends here');
}

function handleDeadEnd(ctx: Ctx, cursor: GenerationCursor): void {
  const res = roll(ctx, 'Dead End', DEAD_END);
  if (res.value !== 'secret_door') return;
  const placed = placePassage(ctx, {
    start: cursor.position, dir: cursor.direction,
    maxLen: rollQuiet(ctx, PASSAGE_LENGTH), width: Math.min(cursor.width, 2),
    parentId: cursor.corridorId, zone: cursor.zone, doorType: 'stone_secret',
  });
  if (placed && !placed.joined) ctx.cursors.push(cursorFor(placed.corridor));
}

function handleStairs(ctx: Ctx, cursor: GenerationCursor): void {
  const stairs = roll(ctx, 'Stair Type', STAIR_TYPE);
  const placed = placePassage(ctx, {
    start: cursor.position, dir: cursor.direction, maxLen: 3, minLen: 2,
    width: Math.min(cursor.width, 2), parentId: cursor.corridorId, zone: cursor.zone,
    kind: 'stairs', stairs: stairs.value, allowJoin: false,
  });
  if (!placed) logEvent(ctx, 'Passage', 'No room for stairs — the passage ends here');
}

/**
 * Gives a too-small dungeon somewhere to go: a passage branching off some
 * existing wall. Only used when every other cursor has died.
 */
function rescue(ctx: Ctx): void {
  const stairIds = new Set(ctx.corridors.filter(c => c.kind === 'stairs').map(c => c.id));
  const candidates: { cell: GridPos; dir: Direction; owner: string }[] = [];
  for (const [key, owner] of ctx.owners) {
    if (stairIds.has(owner)) continue;
    const [x, y] = key.split(',').map(Number);
    for (const dir of DIRECTIONS) {
      const n = advance({ x, y }, dir, 1);
      if (!ctx.owners.has(posKey(n.x, n.y))) candidates.push({ cell: n, dir, owner });
    }
  }
  const zoneOf = (id: string): number =>
    ctx.corridors.find(c => c.id === id)?.zone ?? ctx.rooms.find(r => r.id === id)?.zone ?? 0;

  for (const c of ctx.rng.shuffle(candidates).slice(0, 80)) {
    const placed = placePassage(ctx, {
      start: c.cell, dir: c.dir, maxLen: rollQuiet(ctx, PASSAGE_LENGTH), minLen: 3, width: 2,
      parentId: c.owner, zone: zoneOf(c.owner), allowJoin: false,
    });
    if (placed) {
      logEvent(ctx, 'Extra Passage', 'Every passage ended too soon — a further passage leads off an existing wall');
      ctx.cursors.push(cursorFor(placed.corridor));
      return;
    }
  }
}

// ── Rooms ───────────────────────────────────────────────────────────────────

function roomRectAt(pos: GridPos, dir: Direction, w: number, h: number, offset: number): GridRect {
  switch (dir) {
    case 'north': return { x: pos.x - offset, y: pos.y - h + 1, w, h };
    case 'south': return { x: pos.x - offset, y: pos.y,         w, h };
    case 'east':  return { x: pos.x,          y: pos.y - offset, w, h };
    case 'west':  return { x: pos.x - w + 1,  y: pos.y - offset, w, h };
  }
}

interface RoomSpot {
  rect: GridRect;
  cutouts: GridRect[];
  cells: GridPos[];
}

/**
 * Finds a spot for a room whose entry wall meets the arriving passage. The
 * room slides along that wall, so the passage does not always arrive dead centre.
 */
function findRoomSpot(
  ctx: Ctx, cursor: GenerationCursor, shape: RoomShape, variant: IrregularVariant | undefined, w: number, h: number,
): RoomSpot | null {
  const local = shape === 'irregular' && variant ? irregularCutouts(variant, w, h, ctx.rng) : [];
  const along = isVertical(cursor.direction) ? w : h;
  const all = Array.from({ length: along }, (_, i) => i);
  const centre = Math.floor(along / 2);
  const order = ctx.rng.chance(0.4)
    ? [centre, ...ctx.rng.shuffle(all.filter(o => o !== centre))]
    : ctx.rng.shuffle(all);

  const half = Math.floor(cursor.width / 2);
  const span: GridPos[] = [];
  for (let k = 0; k < cursor.width; k++) {
    span.push(isVertical(cursor.direction)
      ? { x: cursor.position.x - half + k, y: cursor.position.y }
      : { x: cursor.position.x, y: cursor.position.y - half + k });
  }
  const allowed = new Set([cursor.corridorId]);

  for (const offset of order) {
    const rect = roomRectAt(cursor.position, cursor.direction, w, h, offset);
    const cutouts = translateRects(local, rect.x, rect.y);
    const cells = roomCells({ shape, rect, cutouts });
    const set = new Set(cells.map(c => posKey(c.x, c.y)));
    if (!span.every(c => set.has(posKey(c.x, c.y)))) continue;
    if (!canPlace(cells, ctx.owners, allowed)) continue;
    return { rect, cutouts, cells };
  }
  return null;
}

function generateRoom(ctx: Ctx, cursor: GenerationCursor): boolean {
  const level = ctx.settings.level;
  const over = isOverBudget(ctx);

  const shapeEntry = roll(ctx, 'Room Shape', ROOM_SHAPE);
  let shape: RoomShape = shapeEntry.value;
  const compact = shape === 'square' || shape === 'circle';
  const sizeTable = compact ? ROOM_SIZE_SMALL : ROOM_SIZE_LARGE;

  let w = roll(ctx, 'Room Width', sizeTable, { all: ROOM_SIZE_LARGE }).value;
  let h = w;
  if (!compact) h = roll(ctx, 'Room Depth', sizeTable, { all: ROOM_SIZE_LARGE }).value;

  let variant: IrregularVariant | undefined;
  if (shape === 'irregular') {
    variant = roll(ctx, 'Irregular Shape', IRREGULAR_VARIANT).value;
    w = Math.max(6, w);
    h = Math.max(6, h);
  }

  // Try the rolled size, then smaller fallbacks.
  const minDim = shape === 'irregular' ? 6 : 4;
  const attempts: [number, number][] = [[w, h], [Math.max(minDim, w - 2), Math.max(minDim, h - 2)], [minDim, minDim]];
  let spot: RoomSpot | null = null;
  for (const [aw, ah] of attempts) {
    spot = findRoomSpot(ctx, cursor, shape, variant, aw, ah);
    if (spot) { w = aw; h = ah; break; }
  }
  if (!spot && shape !== 'square') {
    spot = findRoomSpot(ctx, cursor, 'square', undefined, 4, 4);
    if (spot) { shape = 'square'; variant = undefined; }
  }
  if (!spot) return false;

  const room: Room = {
    id: newId(ctx, 'room'),
    shape,
    variant,
    rect: spot.rect,
    cutouts: spot.cutouts,
    zone: cursor.zone,
    contents: 'empty',
    exits: [],
    notes: '',
  };
  claim(ctx.owners, spot.cells, room.id);
  ctx.rooms.push(room);

  fillRoomContents(ctx, room, level);

  // The passage that brought us here is the room's entry.
  const entryDir = opposite(cursor.direction);
  room.exits.push({ direction: entryDir, corridorId: cursor.corridorId, exitPoint: cursor.position });

  // Exits (none once the dungeon has reached its size).
  const wanted = roll(ctx, 'Room Exits', ROOM_EXITS).value;
  const count = over ? 0 : wanted;
  if (over) logEvent(ctx, 'Room Exits', 'Dungeon is full — no further exits', 'size limit');

  let made = 0;
  for (const dir of ctx.rng.shuffle(DIRECTIONS.filter(d => d !== entryDir))) {
    if (made >= count) break;
    if (makeRoomExit(ctx, room, spot.cells, dir)) made++;
  }
  return true;
}

function makeRoomExit(ctx: Ctx, room: Room, cells: GridPos[], dir: Direction): boolean {
  const rolled = rollQuiet(ctx, EXIT_WIDTH);
  for (const width of [...new Set([rolled, Math.min(rolled, 2), 1])].sort((a, b) => b - a)) {
    const spots = ctx.rng.shuffle(exitCandidates(cells, room.rect, dir, width));
    for (const start of spots.slice(0, 6)) {
      const zone = ctx.rng.chance(0.35) ? newZone(ctx) : room.zone;
      const placed = placePassage(ctx, {
        start, dir, maxLen: rollQuiet(ctx, PASSAGE_LENGTH), width,
        parentId: room.id, zone,
      });
      if (!placed) continue;

      const door = roll(ctx, 'Exit Door', EXIT_DOOR, { note: `${dir} exit`, all: EXIT_DOOR });
      const doorType = door.value === 'none' ? undefined : door.value;
      placed.corridor.doorType = doorType;

      const exit: Exit = { direction: dir, doorType, corridorId: placed.corridor.id, exitPoint: start };
      room.exits.push(exit);
      if (!placed.joined) ctx.cursors.push(cursorFor(placed.corridor));
      return true;
    }
  }
  return false;
}

function fillRoomContents(ctx: Ctx, room: Room, level: number): void {
  const contents = roll(ctx, 'Room Contents', roomContentsTable(level), { all: ROOM_CONTENTS_BASE });
  room.contents = contents.value;

  if (contents.value === 'monster' || contents.value === 'monster_treasure') {
    const zoneKey = String(room.zone);
    if (!ctx.zones[zoneKey]) {
      ctx.zones[zoneKey] = roll(ctx, 'Zone Inhabitants', monsterTable(level), {
        note: `zone ${room.zone}`, all: allMonsterOptions(),
      }).value;
    }
    // Rooms in the same zone tend to share their inhabitants.
    const favoured = ctx.zones[zoneKey];
    const table = monsterTable(level).map(e => (e.value === favoured ? { ...e, weight: e.weight * 4 } : e));
    const monster = roll(ctx, 'Monster', table, { all: allMonsterOptions() });
    room.monster = describeMonsters(monster.value, ctx.rng);
  }

  if (contents.value === 'monster_treasure' || contents.value === 'trap_treasure' || contents.value === 'treasure') {
    const kind = roll(ctx, 'Treasure', treasureTable(level), { all: allTreasureOptions() });
    room.treasure = describeTreasure(kind.value, level, ctx.rng);
  }

  if (contents.value === 'trap' || contents.value === 'trap_treasure') {
    room.trap = roll(ctx, 'Trap Type', TRAP_TYPE).value;
  }

  if (contents.value === 'special') {
    room.special = roll(ctx, 'Special Feature', SPECIAL_FEATURE).label;
  }

  if (contents.value === 'empty' || contents.value === 'treasure' || contents.value === 'special') {
    const picked = roll(ctx, 'Room Dressing', ROOM_DRESSING);
    const entry = ROOM_DRESSING.find(e => e.value === picked.value)!;
    const flavour = ctx.rng.pick(entry.flavours);
    ctx.rolls[ctx.rolls.length - 1].outcome = `${entry.label}: ${flavour}`;
    room.dressing = { type: entry.value, flavour };
  }
}

// ── Overrides & replay ──────────────────────────────────────────────────────

/**
 * Rebuilds the dungeon from its seed, applying the current overrides, and
 * plays it forward to the same number of steps. Room notes and the selection
 * are carried across for rooms that still exist.
 */
export function regenerate(state: DungeonState): DungeonState {
  const target = state.stepCount;
  let s = generateStart(createInitialState(state.settings, state.seed, state.overrides));
  while (s.stepCount < target && s.cursors.length > 0) s = generateNext(s);

  const notes = new Map(state.rooms.map(r => [r.id, r.notes] as const));
  return {
    ...s,
    rooms: s.rooms.map(r => (notes.get(r.id) ? { ...r, notes: notes.get(r.id)! } : r)),
    selectedRoomId: s.rooms.some(r => r.id === state.selectedRoomId) ? state.selectedRoomId : null,
  };
}

export function applyOverride(state: DungeonState, rollKey: string, value: string): DungeonState {
  return regenerate({ ...state, overrides: { ...state.overrides, [rollKey]: value } });
}

export function clearOverride(state: DungeonState, rollKey: string): DungeonState {
  const overrides = { ...state.overrides };
  delete overrides[rollKey];
  return regenerate({ ...state, overrides });
}

// ── Descriptions ────────────────────────────────────────────────────────────

const CONTENTS_LABEL: Record<string, string> = {
  empty: 'Empty', monster: 'Monsters', monster_treasure: 'Monsters with treasure',
  trap: 'Trap', trap_treasure: 'Trapped treasure', special: 'Special', treasure: 'Unguarded treasure',
};

export function describeRoomLines(room: Room): string[] {
  const lines: string[] = [];
  const size = room.shape === 'circle'
    ? `${room.rect.w * 5} ft across`
    : `${room.rect.w * 5}×${room.rect.h * 5} ft`;
  lines.push(`${roomShapeLabel(room.shape, room.variant)} room, ${size}. ${CONTENTS_LABEL[room.contents] ?? room.contents}.`);
  if (room.monster) lines.push(`Inhabitants: ${room.monster}.`);
  if (room.trap) lines.push(`Trap: ${trapDetail(room.trap)}.`);
  if (room.treasure) lines.push(`Treasure: ${room.treasure}.`);
  if (room.special) lines.push(room.special + '.');
  if (room.dressing) lines.push(room.dressing.flavour + '.');
  return lines;
}

export function buildRoomDescription(room: Room): string {
  return describeRoomLines(room).join(' ');
}
