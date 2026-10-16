import type { Direction, GridPos, GridRect, Room, Corridor } from './types.js';
import { Rng } from './rng.js';
import type { IrregularVariant, RoomShape } from './types.js';

// ── Direction helpers ───────────────────────────────────────────────────────

export function advance(pos: GridPos, dir: Direction, n: number): GridPos {
  switch (dir) {
    case 'north': return { x: pos.x, y: pos.y - n };
    case 'south': return { x: pos.x, y: pos.y + n };
    case 'east':  return { x: pos.x + n, y: pos.y };
    case 'west':  return { x: pos.x - n, y: pos.y };
  }
}

export function turnLeft(dir: Direction): Direction {
  const map: Record<Direction, Direction> = { north: 'west', west: 'south', south: 'east', east: 'north' };
  return map[dir];
}

export function turnRight(dir: Direction): Direction {
  const map: Record<Direction, Direction> = { north: 'east', east: 'south', south: 'west', west: 'north' };
  return map[dir];
}

export function opposite(dir: Direction): Direction {
  const map: Record<Direction, Direction> = { north: 'south', south: 'north', east: 'west', west: 'east' };
  return map[dir];
}

export const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];

export function isVertical(dir: Direction): boolean {
  return dir === 'north' || dir === 'south';
}

// ── Cells & ownership ───────────────────────────────────────────────────────
//
// Every floor cell belongs to exactly one area (a passage, junction or room).
// `Owners` maps "x,y" -> area id and is the single source of truth for both
// collision detection and wall drawing.

export type Owners = Map<string, string>;

export function posKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function rectCells(rect: GridRect): GridPos[] {
  const cells: GridPos[] = [];
  for (let dy = 0; dy < rect.h; dy++)
    for (let dx = 0; dx < rect.w; dx++)
      cells.push({ x: rect.x + dx, y: rect.y + dy });
  return cells;
}

export function claim(owners: Owners, cells: GridPos[], id: string): void {
  for (const c of cells) owners.set(posKey(c.x, c.y), id);
}

/**
 * A footprint can be placed when none of its cells are taken AND no cell
 * touching it (edge-adjacent) belongs to an area other than those in
 * `allowed`. The second rule keeps unrelated areas from sharing walls.
 */
export function canPlace(cells: GridPos[], owners: Owners, allowed: ReadonlySet<string>): boolean {
  const own = new Set<string>();
  for (const c of cells) {
    const k = posKey(c.x, c.y);
    if (owners.has(k)) return false;
    own.add(k);
  }
  for (const c of cells) {
    for (const d of DIRECTIONS) {
      const n = advance(c, d, 1);
      const k = posKey(n.x, n.y);
      if (own.has(k)) continue;
      const o = owners.get(k);
      if (o !== undefined && !allowed.has(o)) return false;
    }
  }
  return true;
}

// ── Passages ────────────────────────────────────────────────────────────────
//
// `start` is the ENTRY cell of a passage — the cell nearest whatever it
// grows from — and the passage runs away from it in `dir`. The cross-section
// is centred on `start` (offset floor(width/2) for even widths).

export function corridorRect(start: GridPos, dir: Direction, length: number, width: number): GridRect {
  const w = Math.max(width, 1);
  const off = Math.floor(w / 2);
  switch (dir) {
    case 'north': return { x: start.x - off, y: start.y - length + 1, w, h: length };
    case 'south': return { x: start.x - off, y: start.y,              w, h: length };
    case 'east':  return { x: start.x,        y: start.y - off,       w: length, h: w };
    case 'west':  return { x: start.x - length + 1, y: start.y - off, w: length, h: w };
  }
}

/** First free cell beyond `dir` side of a rect, on its centre line. */
export function edgePoint(rect: GridRect, dir: Direction): GridPos {
  switch (dir) {
    case 'north': return { x: rect.x + Math.floor(rect.w / 2), y: rect.y - 1 };
    case 'south': return { x: rect.x + Math.floor(rect.w / 2), y: rect.y + rect.h };
    case 'east':  return { x: rect.x + rect.w,                 y: rect.y + Math.floor(rect.h / 2) };
    case 'west':  return { x: rect.x - 1,                      y: rect.y + Math.floor(rect.h / 2) };
  }
}

// ── Rooms ───────────────────────────────────────────────────────────────────

type RoomLike = Pick<Room, 'shape' | 'rect' | 'cutouts'>;

/** Floor cells of a room: the whole rect, minus cutouts, trimmed to an ellipse for circles. */
export function roomCells(room: RoomLike): GridPos[] {
  const { rect, cutouts, shape } = room;
  const cells: GridPos[] = [];
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      const x = rect.x + dx;
      const y = rect.y + dy;
      if (shape === 'circle') {
        const nx = (dx + 0.5 - rect.w / 2) / (rect.w / 2);
        const ny = (dy + 0.5 - rect.h / 2) / (rect.h / 2);
        if (nx * nx + ny * ny > 1.0) continue;
      }
      if (cutouts.some(c => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h)) continue;
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * Cutouts (in local coordinates, origin at the rect's corner) that carve an
 * irregular room out of its bounding box. The centre row and column are never
 * cut, so every room keeps a usable middle and stays in one piece.
 */
export function irregularCutouts(variant: IrregularVariant, w: number, h: number, rng: Rng): GridRect[] {
  const aMax = Math.max(1, Math.floor((w - 1) / 2));
  const bMax = Math.max(1, Math.floor((h - 1) / 2));
  const corner = (c: number, a: number, b: number): GridRect => ({
    x: c % 2 === 0 ? 0 : w - a,
    y: c < 2 ? 0 : h - b,
    w: a,
    h: b,
  });
  const cuts: GridRect[] = [];
  switch (variant) {
    case 'l_shape': {
      const a = rng.int(Math.max(1, aMax - 1), aMax);
      const b = rng.int(Math.max(1, bMax - 1), bMax);
      cuts.push(corner(rng.int(0, 3), a, b));
      break;
    }
    case 'cross':
      for (let c = 0; c < 4; c++) cuts.push(corner(c, aMax, bMax));
      break;
    case 'notched': {
      const order = rng.shuffle([0, 1, 2, 3]).slice(0, rng.int(2, 3));
      for (const c of order) cuts.push(corner(c, rng.int(1, Math.min(2, aMax)), rng.int(1, Math.min(2, bMax))));
      break;
    }
    case 'cavern': {
      for (let c = 0; c < 4; c++) cuts.push(corner(c, rng.int(1, aMax), rng.int(1, bMax)));
      const cx = Math.floor(w / 2);
      const cy = Math.floor(h / 2);
      const notches = rng.int(2, 5);
      for (let i = 0; i < notches; i++) {
        const side = rng.int(0, 3);
        if (side < 2) {
          const x = rng.int(1, w - 2);
          if (x === cx) continue;
          cuts.push({ x, y: side === 0 ? 0 : h - 1, w: 1, h: 1 });
        } else {
          const y = rng.int(1, h - 2);
          if (y === cy) continue;
          cuts.push({ x: side === 2 ? 0 : w - 1, y, w: 1, h: 1 });
        }
      }
      break;
    }
  }
  return cuts;
}

export function translateRects(rects: GridRect[], dx: number, dy: number): GridRect[] {
  return rects.map(r => ({ ...r, x: r.x + dx, y: r.y + dy }));
}

/**
 * Candidate places for a passage of `width` to leave a room on side `dir`.
 * A candidate needs a flat stretch of wall, and the stretch must not sit next
 * to a protruding part of the room (otherwise the passage would run along it).
 */
export function exitCandidates(
  cells: GridPos[], rect: GridRect, dir: Direction, width: number,
): GridPos[] {
  const vertical = isVertical(dir);
  // extreme[i]: the outermost floor coordinate on this side for line i.
  const lo = vertical ? rect.x : rect.y;
  const n = vertical ? rect.w : rect.h;
  const extreme: (number | null)[] = new Array(n).fill(null);
  for (const c of cells) {
    const i = (vertical ? c.x : c.y) - lo;
    const v = vertical ? c.y : c.x;
    const cur = extreme[i];
    if (cur === null) extreme[i] = v;
    else if (dir === 'north' || dir === 'west') extreme[i] = Math.min(cur, v);
    else extreme[i] = Math.max(cur, v);
  }
  // "outside" means further out than the wall in the exit direction.
  const protrudes = (a: number | null, wall: number): boolean => {
    if (a === null) return false;
    return dir === 'north' || dir === 'west' ? a <= wall - 1 : a >= wall + 1;
  };

  const out: GridPos[] = [];
  for (let s = 0; s + width <= n; s++) {
    const wall = extreme[s];
    if (wall === null) continue;
    let flat = true;
    for (let k = 1; k < width; k++) if (extreme[s + k] !== wall) { flat = false; break; }
    if (!flat) continue;
    if (s > 0 && protrudes(extreme[s - 1], wall)) continue;
    if (s + width < n && protrudes(extreme[s + width], wall)) continue;
    const centre = lo + s + Math.floor(width / 2);
    const beyond = dir === 'north' || dir === 'west' ? wall - 1 : wall + 1;
    out.push(vertical ? { x: centre, y: beyond } : { x: beyond, y: centre });
  }
  return out;
}

export function roomShapeLabel(shape: RoomShape, variant?: IrregularVariant): string {
  if (shape === 'irregular' && variant) {
    return { l_shape: 'L-shaped', cross: 'Cross-shaped', notched: 'Notched', cavern: 'Cavern' }[variant];
  }
  return { square: 'Square', rectangle: 'Rectangular', circle: 'Circular', irregular: 'Irregular' }[shape];
}

// ── Whole-dungeon helpers ───────────────────────────────────────────────────

export function buildOwners(rooms: readonly Room[], corridors: readonly Corridor[]): Owners {
  const owners: Owners = new Map();
  for (const c of corridors) claim(owners, rectCells(c.rect), c.id);
  for (const r of rooms) claim(owners, roomCells(r), r.id);
  return owners;
}

/** Undirected pairs of areas that are open to each other (no wall between them). */
export function buildLinks(rooms: readonly Room[], corridors: readonly Corridor[]): Set<string> {
  const links = new Set<string>();
  const add = (a: string, b: string) => links.add(a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const c of corridors) {
    add(c.fromId, c.id);
    for (const j of c.joins) add(c.id, j);
  }
  for (const r of rooms) {
    for (const e of r.exits) if (e.corridorId) add(r.id, e.corridorId);
  }
  return links;
}

export function isLinked(links: ReadonlySet<string>, a: string, b: string): boolean {
  return links.has(a < b ? `${a}|${b}` : `${b}|${a}`);
}
