import type { DungeonState, Room, Corridor, Direction, DoorType, GridRect } from '../types.js';
import { setState } from '../state.js';
import { exportCanvasWidth } from '../exportLayout.js';
import {
  buildOwners,
  buildLinks,
  isLinked,
  roomCells,
  advance,
  opposite,
  isVertical,
  posKey,
} from '../geometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CELL = 12; // px per grid cell (one cell = 5 ft)
const PADDING = 3; // cells of margin around the dungeon when fitting
const INK = '#1a1a1a';
const FLOOR = '#fffdf7';

let _svg: SVGSVGElement;
let _mapGroup: SVGGElement;

// Pan/zoom state
let _viewX = 0;
let _viewY = 0;
let _zoom = 1;
let _dragging = false;
let _dragStart = { x: 0, y: 0 };
let _viewStart = { x: 0, y: 0 };
let _userMoved = false;
let _lastSeed: number | null = null;
let _lastState: DungeonState | null = null;

export function initMap(): void {
  _svg = document.getElementById('dungeon-map') as unknown as SVGSVGElement;
  _mapGroup = document.getElementById('map-elements') as unknown as SVGGElement;

  _svg.addEventListener('mousedown', onMouseDown);
  _svg.addEventListener('mousemove', onMouseMove);
  _svg.addEventListener('mouseup', onMouseUp);
  _svg.addEventListener('mouseleave', onMouseUp);
  _svg.addEventListener('wheel', onWheel, { passive: false });

  _svg.addEventListener('touchstart', onTouchStart, { passive: true });
  _svg.addEventListener('touchmove', onTouchMove, { passive: false });
  _svg.addEventListener('touchend', onTouchEnd);

  window.addEventListener('resize', () => { if (_lastState && !_userMoved) autoFit(_lastState); });
}

// ── Pan / zoom ──────────────────────────────────────────────────────────────

let _moved = 0;

function onMouseDown(e: MouseEvent): void {
  _dragging = true;
  _moved = 0;
  _dragStart = { x: e.clientX, y: e.clientY };
  _viewStart = { x: _viewX, y: _viewY };
}

function onMouseMove(e: MouseEvent): void {
  if (!_dragging) return;
  const dx = e.clientX - _dragStart.x;
  const dy = e.clientY - _dragStart.y;
  _moved = Math.max(_moved, Math.abs(dx) + Math.abs(dy));
  if (_moved > 3) _userMoved = true;
  _viewX = _viewStart.x + dx;
  _viewY = _viewStart.y + dy;
  applyTransform();
}

function onMouseUp(): void {
  _dragging = false;
}

function onWheel(e: WheelEvent): void {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const next = Math.min(Math.max(_zoom * factor, 0.1), 8);
  const applied = next / _zoom;
  const rect = _svg.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  _viewX = cx - (cx - _viewX) * applied;
  _viewY = cy - (cy - _viewY) * applied;
  _zoom = next;
  _userMoved = true;
  applyTransform();
}

let _touchLast = { x: 0, y: 0 };
function onTouchStart(e: TouchEvent): void {
  if (e.touches.length === 1) {
    _dragging = true;
    _touchLast = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    _viewStart = { x: _viewX, y: _viewY };
  }
}

function onTouchMove(e: TouchEvent): void {
  if (!_dragging || e.touches.length !== 1) return;
  e.preventDefault();
  _userMoved = true;
  _viewX = _viewStart.x + (e.touches[0].clientX - _touchLast.x);
  _viewY = _viewStart.y + (e.touches[0].clientY - _touchLast.y);
  applyTransform();
}

function onTouchEnd(): void {
  _dragging = false;
}

function applyTransform(): void {
  _mapGroup.setAttribute('transform', `translate(${_viewX},${_viewY}) scale(${_zoom})`);
}

/** Re-centres the whole dungeon in view. */
export function fitView(): void {
  _userMoved = false;
  if (_lastState) autoFit(_lastState);
}

// ── SVG helpers ─────────────────────────────────────────────────────────────

function el<T extends SVGElement>(tag: string, attrs: Record<string, string | number> = {}): T {
  const e = document.createElementNS(SVG_NS, tag) as T;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function zoneTint(zone: number): string {
  return `hsl(${(zone * 53) % 360} 38% 93%)`;
}

const CONTENT_GLYPH: Record<string, string> = {
  empty: '', monster: 'M', monster_treasure: 'M$', trap: 'T', trap_treasure: 'T$', special: '*', treasure: '$',
};

// ── Rendering ───────────────────────────────────────────────────────────────
//
// Everything is drawn from the cell grid: floors are unions of unit squares,
// and a wall is drawn on every cell edge that faces rock or faces an area it
// is not open to. That is why rooms and passages join up without seams.

export function renderMap(state: DungeonState): void {
  _lastState = state;
  while (_mapGroup.firstChild) _mapGroup.removeChild(_mapGroup.firstChild);

  if (state.seed !== _lastSeed || !state.started) {
    _userMoved = false;
    _lastSeed = state.seed;
  }
  if (!state.started) return;

  const owners = buildOwners(state.rooms, state.corridors);
  const links = buildLinks(state.rooms, state.corridors);

  const defs = el<SVGDefsElement>('defs');
  const pattern = el<SVGPatternElement>('pattern', {
    id: 'floor-grid', width: CELL, height: CELL, patternUnits: 'userSpaceOnUse',
  });
  pattern.appendChild(el('path', { d: `M ${CELL} 0 V ${CELL} H 0`, fill: 'none', stroke: '#d9dfe8', 'stroke-width': 0.5 }));
  defs.appendChild(pattern);
  _mapGroup.appendChild(defs);

  renderFloors(state);
  renderStairs(state.corridors);
  renderWalls(state, owners, links);
  for (const c of state.corridors) if (c.doorType) renderDoor(c, c.doorType);
  renderEntrance(state);
  renderRoomLabels(state);
  for (const cursor of state.cursors) {
    const p = cursor.position;
    const s = CELL * 0.35;
    const x = p.x * CELL + CELL / 2;
    const y = p.y * CELL + CELL / 2;
    _mapGroup.appendChild(el('polygon', {
      points: `${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`,
      fill: '#d97706', opacity: 0.85, 'pointer-events': 'none',
    }));
  }

  if (!_userMoved) autoFit(state);
  else applyTransform();
}

function cellPath(cells: { x: number; y: number }[]): string {
  let d = '';
  for (const c of cells) d += `M${c.x * CELL} ${c.y * CELL}h${CELL}v${CELL}h${-CELL}z`;
  return d;
}

function rectPath(r: GridRect): string {
  return `M${r.x * CELL} ${r.y * CELL}h${r.w * CELL}v${r.h * CELL}h${-r.w * CELL}z`;
}

function renderFloors(state: DungeonState): void {
  // Passages and junctions share one path.
  let d = '';
  for (const c of state.corridors) d += rectPath(c.rect);
  _mapGroup.appendChild(el('path', { d, fill: FLOOR, stroke: FLOOR, 'stroke-width': 0.6, 'pointer-events': 'none' }));

  for (const room of state.rooms) {
    const selected = state.selectedRoomId === room.id;
    const fill = selected ? '#f3e2a9' : zoneTint(room.zone);
    const path = el<SVGPathElement>('path', {
      d: cellPath(roomCells(room)), fill, stroke: fill, 'stroke-width': 0.6,
      'data-room-id': room.id, style: 'cursor:pointer',
    });
    path.addEventListener('click', () => {
      if (_moved > 3) return; // that was a drag, not a click
      setState(s => ({ ...s, selectedRoomId: s.selectedRoomId === room.id ? null : room.id }));
    });
    _mapGroup.appendChild(path);
  }

  // Faint 5 ft grid over every floor.
  let all = d;
  for (const room of state.rooms) all += cellPath(roomCells(room));
  _mapGroup.appendChild(el('path', { d: all, fill: 'url(#floor-grid)', 'pointer-events': 'none' }));
}

function renderWalls(state: DungeonState, owners: Map<string, string>, links: Set<string>): void {
  // The face of the entrance is open: you walk in from outside the map.
  const entrance = state.corridors.find(c => c.fromId === 'entrance');
  const skip = new Set<string>();
  if (entrance) {
    const back = opposite(entrance.direction);
    for (let y = entrance.rect.y; y < entrance.rect.y + entrance.rect.h; y++) {
      for (let x = entrance.rect.x; x < entrance.rect.x + entrance.rect.w; x++) {
        const outside = advance({ x, y }, back, 1);
        if (!owners.has(posKey(outside.x, outside.y)) && onEntryFace(entrance.rect, entrance.direction, x, y)) {
          skip.add(`${x},${y},${back}`);
        }
      }
    }
  }

  let d = '';
  for (const [key, owner] of owners) {
    const [x, y] = key.split(',').map(Number);
    const px = x * CELL;
    const py = y * CELL;
    const dirs: Direction[] = ['north', 'east', 'south', 'west'];
    for (const dir of dirs) {
      const n = advance({ x, y }, dir, 1);
      const other = owners.get(posKey(n.x, n.y));
      let wall = false;
      if (other === undefined) wall = !skip.has(`${x},${y},${dir}`);
      else if (other !== owner && !isLinked(links, owner, other)) {
        // Both sides are floor: draw the shared wall once.
        wall = dir === 'east' || dir === 'south';
      }
      if (!wall) continue;
      switch (dir) {
        case 'north': d += `M${px} ${py}h${CELL}`; break;
        case 'south': d += `M${px} ${py + CELL}h${CELL}`; break;
        case 'west':  d += `M${px} ${py}v${CELL}`; break;
        case 'east':  d += `M${px + CELL} ${py}v${CELL}`; break;
      }
    }
  }
  _mapGroup.appendChild(el('path', {
    d, fill: 'none', stroke: INK, 'stroke-width': 2, 'stroke-linecap': 'square', 'pointer-events': 'none',
  }));
}

function onEntryFace(rect: GridRect, dir: Direction, x: number, y: number): boolean {
  switch (dir) {
    case 'north': return y === rect.y + rect.h - 1;
    case 'south': return y === rect.y;
    case 'east':  return x === rect.x;
    case 'west':  return x === rect.x + rect.w - 1;
  }
}

/** The line segment (in px) across the entry face of a passage. */
function entryFace(rect: GridRect, dir: Direction): { x1: number; y1: number; x2: number; y2: number } {
  switch (dir) {
    case 'north': return { x1: rect.x * CELL, y1: (rect.y + rect.h) * CELL, x2: (rect.x + rect.w) * CELL, y2: (rect.y + rect.h) * CELL };
    case 'south': return { x1: rect.x * CELL, y1: rect.y * CELL, x2: (rect.x + rect.w) * CELL, y2: rect.y * CELL };
    case 'east':  return { x1: rect.x * CELL, y1: rect.y * CELL, x2: rect.x * CELL, y2: (rect.y + rect.h) * CELL };
    case 'west':  return { x1: (rect.x + rect.w) * CELL, y1: rect.y * CELL, x2: (rect.x + rect.w) * CELL, y2: (rect.y + rect.h) * CELL };
  }
}

function renderDoor(corridor: Corridor, doorType: DoorType): void {
  const f = entryFace(corridor.rect, corridor.direction);
  const cx = (f.x1 + f.x2) / 2;
  const cy = (f.y1 + f.y2) / 2;
  const vertical = isVertical(corridor.direction); // face runs horizontally when travelling N/S
  const span = Math.max(Math.abs(f.x2 - f.x1), Math.abs(f.y2 - f.y1));
  const len = Math.max(span - 3, CELL * 0.6);
  const thick = 4;

  const g = el<SVGGElement>('g', { 'pointer-events': 'none' });
  const bw = vertical ? len : thick;
  const bh = vertical ? thick : len;

  if (doorType === 'stone_secret') {
    // Hide the wall behind the door glyph so the S reads clearly.
    g.appendChild(el('rect', { x: cx - bw / 2, y: cy - bh / 2, width: bw, height: bh, fill: FLOOR }));
    const t = el<SVGTextElement>('text', {
      x: cx, y: cy, 'font-family': 'Courier New, monospace', 'font-size': 9, 'font-weight': 'bold',
      fill: INK, 'dominant-baseline': 'central', 'text-anchor': 'middle',
    });
    t.textContent = 'S';
    g.appendChild(t);
    _mapGroup.appendChild(g);
    return;
  }

  if (doorType === 'archway') {
    const post = 2.5;
    const a = vertical ? { x: cx - len / 2 - post / 2, y: cy - post / 2 } : { x: cx - post / 2, y: cy - len / 2 - post / 2 };
    const b = vertical ? { x: cx + len / 2 - post / 2, y: cy - post / 2 } : { x: cx - post / 2, y: cy + len / 2 - post / 2 };
    g.appendChild(el('rect', { x: a.x, y: a.y, width: post, height: post, fill: INK }));
    g.appendChild(el('rect', { x: b.x, y: b.y, width: post, height: post, fill: INK }));
    _mapGroup.appendChild(g);
    return;
  }

  const solid = doorType === 'stone' || doorType === 'iron';
  g.appendChild(el('rect', {
    x: cx - bw / 2, y: cy - bh / 2, width: bw, height: bh,
    fill: solid ? INK : FLOOR, stroke: INK, 'stroke-width': 1,
  }));

  if (doorType === 'wooden_locked' || doorType === 'iron') {
    g.appendChild(el('circle', { cx, cy, r: 2, fill: solid ? FLOOR : INK, stroke: INK, 'stroke-width': 0.5 }));
  }
  if (doorType === 'wooden_stuck') {
    const t = el<SVGTextElement>('text', {
      x: cx, y: cy, 'font-family': 'Courier New, monospace', 'font-size': 7, fill: INK,
      'dominant-baseline': 'central', 'text-anchor': 'middle',
    });
    t.textContent = '×';
    g.appendChild(t);
  }
  if (doorType === 'portcullis') {
    const steps = Math.max(2, Math.round(len / 4));
    for (let i = 1; i < steps; i++) {
      const o = -len / 2 + (len / steps) * i;
      g.appendChild(vertical
        ? el('line', { x1: cx + o, y1: cy - thick, x2: cx + o, y2: cy + thick, stroke: INK, 'stroke-width': 1 })
        : el('line', { x1: cx - thick, y1: cy + o, x2: cx + thick, y2: cy + o, stroke: INK, 'stroke-width': 1 }));
    }
  }
  _mapGroup.appendChild(g);
}

function renderStairs(corridors: Corridor[]): void {
  let d = '';
  for (const c of corridors) {
    if (c.kind !== 'stairs') continue;
    const r = c.rect;
    if (isVertical(c.direction)) {
      for (let y = r.y; y <= r.y + r.h; y++) d += `M${r.x * CELL} ${y * CELL}h${r.w * CELL}`;
    } else {
      for (let x = r.x; x <= r.x + r.w; x++) d += `M${x * CELL} ${r.y * CELL}v${r.h * CELL}`;
    }
  }
  if (d) _mapGroup.appendChild(el('path', { d, stroke: INK, 'stroke-width': 1, fill: 'none', 'pointer-events': 'none' }));
}

function renderEntrance(state: DungeonState): void {
  const c = state.corridors.find(k => k.fromId === 'entrance');
  if (!c) return;
  const f = entryFace(c.rect, c.direction);
  const back = opposite(c.direction);
  const off = CELL * 1.1;
  const dx = back === 'east' ? off : back === 'west' ? -off : 0;
  const dy = back === 'south' ? off : back === 'north' ? -off : 0;
  const cx = (f.x1 + f.x2) / 2 + dx;
  const cy = (f.y1 + f.y2) / 2 + dy;

  const g = el<SVGGElement>('g', { 'pointer-events': 'none' });
  g.appendChild(el('circle', { cx, cy, r: CELL * 0.7, fill: 'white', stroke: INK, 'stroke-width': 1.5 }));
  const t = el<SVGTextElement>('text', {
    x: cx, y: cy, 'font-family': 'Courier New, monospace', 'font-size': 10, 'font-weight': 'bold',
    fill: INK, 'dominant-baseline': 'central', 'text-anchor': 'middle',
  });
  t.textContent = 'E';
  g.appendChild(t);
  _mapGroup.appendChild(g);
}

function renderRoomLabels(state: DungeonState): void {
  state.rooms.forEach((room: Room, i) => {
    const r = room.rect;
    const cx = (r.x + r.w / 2) * CELL;
    const cy = (r.y + r.h / 2) * CELL;
    const glyph = CONTENT_GLYPH[room.contents] ?? '';
    const t = el<SVGTextElement>('text', {
      x: cx, y: glyph ? cy - 5 : cy,
      'font-family': 'Courier New, monospace', 'font-size': 18, 'font-weight': 'bold', stroke: FLOOR, 'stroke-width': 3, 'paint-order': 'stroke',
      fill: INK, 'dominant-baseline': 'central', 'text-anchor': 'middle', 'pointer-events': 'none',
    });
    t.textContent = String(i + 1);
    _mapGroup.appendChild(t);
    if (glyph) {
      const g = el<SVGTextElement>('text', {
        x: cx, y: cy + 11,
        'font-family': 'Courier New, monospace', 'font-size': 12, 'font-weight': 'bold', fill: '#7a2e1d',
        'dominant-baseline': 'central', 'text-anchor': 'middle', 'pointer-events': 'none',
      });
      g.textContent = glyph;
      _mapGroup.appendChild(g);
    }
  });
}

// ── Fitting ─────────────────────────────────────────────────────────────────

function getBounds(state: DungeonState): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const rects: GridRect[] = [...state.rooms.map(r => r.rect), ...state.corridors.map(c => c.rect)];
  if (rects.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  // Leave space for the entrance marker.
  return { minX: minX - 2, minY: minY - 2, maxX: maxX + 2, maxY: maxY + 2 };
}

function autoFit(state: DungeonState): void {
  const bounds = getBounds(state);
  if (!bounds) return;

  const box = _svg.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return;

  const contentW = (bounds.maxX - bounds.minX + PADDING * 2) * CELL;
  const contentH = (bounds.maxY - bounds.minY + PADDING * 2) * CELL;
  _zoom = Math.min(box.width / contentW, box.height / contentH, 2.5);
  _viewX = (-bounds.minX + PADDING) * CELL * _zoom + (box.width - contentW * _zoom) / 2;
  _viewY = (-bounds.minY + PADDING) * CELL * _zoom + (box.height - contentH * _zoom) / 2;
  applyTransform();
}

// ── Export ──────────────────────────────────────────────────────────────────

/** Exports the whole dungeon (not just the current view) as a PNG. */
export function exportPNG(): void {
  const state = _lastState;
  if (!state || !state.started) return;
  const bounds = getBounds(state);
  if (!bounds) return;

  const scale = 2;
  const pad = PADDING;
  const vbX = (bounds.minX - pad) * CELL;
  const vbY = (bounds.minY - pad) * CELL;
  const vbW = (bounds.maxX - bounds.minX + pad * 2) * CELL;
  const vbH = (bounds.maxY - bounds.minY + pad * 2) * CELL;
  const footer = 28; // px of caption space below the map

  const svg = el<SVGSVGElement>('svg', {
    xmlns: SVG_NS, viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`, width: vbW * scale, height: vbH * scale,
  });
  svg.appendChild(el('rect', { x: vbX, y: vbY, width: vbW, height: vbH, fill: '#faf8f3' }));
  const copy = _mapGroup.cloneNode(true) as SVGGElement;
  copy.removeAttribute('transform');
  svg.appendChild(copy);

  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' }));
  const img = new Image();
  img.onload = () => {
    const mapW = vbW * scale;
    const mapH = vbH * scale;
    const font = `${10 * scale}px Courier New`;
    const margin = 12 * scale;
    const gap = 6 * scale;
    const barW = 10 * CELL * scale; // 50 ft
    const caption = `Seed ${state.seed} · level ${state.settings.level} · ${state.rooms.length} rooms`;

    // A narrow dungeon can be thinner than its own footer, so widen the canvas
    // (leaving the map at the same scale, centred) until both labels fit.
    const probe = document.createElement('canvas').getContext('2d')!;
    probe.font = font;
    const width = exportCanvasWidth(mapW, {
      margin, gap, barWidth: barW,
      scaleLabelWidth: probe.measureText('50 ft').width,
      captionWidth: probe.measureText(caption).width,
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = mapH + footer * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#faf8f3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, (width - mapW) / 2, 0, mapW, mapH);

    const y = mapH + (footer / 2) * scale;
    ctx.fillStyle = INK;
    ctx.fillRect(margin, y - 3 * scale, barW, 6 * scale);
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('50 ft', margin + barW + gap, y);
    ctx.textAlign = 'right';
    ctx.fillText(caption, width - margin, y);

    const link = document.createElement('a');
    link.download = `dungeon-${state.seed}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    URL.revokeObjectURL(url);
  };
  img.src = url;
}
