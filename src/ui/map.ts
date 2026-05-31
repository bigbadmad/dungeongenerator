import type { DungeonState, Room, Corridor, GridRect, Direction, DoorType, GridPos } from '../types.js';
import { setState } from '../state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CELL = 20; // px per grid unit (1 grid unit = 10ft)
const PADDING = 4; // grid units of padding around content

let _svg: SVGSVGElement;
let _mapGroup: SVGGElement;

// Pan/zoom state
let _viewX = 0;
let _viewY = 0;
let _zoom = 1;
let _dragging = false;
let _dragStart = { x: 0, y: 0 };
let _viewStart = { x: 0, y: 0 };

export function initMap(): void {
  _svg = document.getElementById('dungeon-map') as unknown as SVGSVGElement;
  _mapGroup = document.getElementById('map-elements') as unknown as SVGGElement;

  _svg.addEventListener('mousedown', onMouseDown);
  _svg.addEventListener('mousemove', onMouseMove);
  _svg.addEventListener('mouseup', onMouseUp);
  _svg.addEventListener('mouseleave', onMouseUp);
  _svg.addEventListener('wheel', onWheel, { passive: false });

  // Touch support
  _svg.addEventListener('touchstart', onTouchStart, { passive: true });
  _svg.addEventListener('touchmove', onTouchMove, { passive: false });
  _svg.addEventListener('touchend', onTouchEnd);
}

function onMouseDown(e: MouseEvent): void {
  _dragging = true;
  _dragStart = { x: e.clientX, y: e.clientY };
  _viewStart = { x: _viewX, y: _viewY };
}

function onMouseMove(e: MouseEvent): void {
  if (!_dragging) return;
  _viewX = _viewStart.x + (e.clientX - _dragStart.x);
  _viewY = _viewStart.y + (e.clientY - _dragStart.y);
  applyTransform();
}

function onMouseUp(): void {
  _dragging = false;
}

function onWheel(e: WheelEvent): void {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  const rect = _svg.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  _viewX = cx - (cx - _viewX) * factor;
  _viewY = cy - (cy - _viewY) * factor;
  _zoom *= factor;
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

function gridToSvg(gridX: number, gridY: number): { x: number; y: number } {
  return { x: gridX * CELL, y: gridY * CELL };
}

function svgRect(rect: GridRect): { x: number; y: number; w: number; h: number } {
  return {
    x: rect.x * CELL,
    y: rect.y * CELL,
    w: rect.w * CELL,
    h: rect.h * CELL,
  };
}

function el<T extends SVGElement>(tag: string): T {
  return document.createElementNS(SVG_NS, tag) as T;
}

function setAttrs(elem: Element, attrs: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(attrs)) {
    elem.setAttribute(k, String(v));
  }
}

export function renderMap(state: DungeonState): void {
  while (_mapGroup.firstChild) _mapGroup.removeChild(_mapGroup.firstChild);

  if (!state.started) {
    renderEntrance();
    return;
  }

  // Corridors first (fills only, under rooms)
  for (const corridor of state.corridors) {
    renderCorridorFill(corridor);
  }

  // Room fills + walls. Walls are drawn with gaps/doors at exits.
  state.rooms.forEach((room, i) => {
    renderRoom(room, state.selectedRoomId === room.id, state.corridors, i + 1);
  });

  // Passage door symbols (on corridor stubs — drawn after rooms so they sit on top)
  for (const corridor of state.corridors) {
    if (corridor.doorType) renderPassageDoor(corridor);
  }

  renderEntrance();

  for (const cursor of state.cursors) {
    renderCursor(cursor.position);
  }

  autoFit(state);
}

function renderEntrance(): void {
  const { x, y } = gridToSvg(0, 0);
  const size = CELL * 0.8;

  const g = el<SVGGElement>('g');

  const circ = el<SVGCircleElement>('circle');
  setAttrs(circ, { cx: x, cy: y, r: size / 2, fill: 'white', stroke: '#1a1a1a', 'stroke-width': 1.5 });
  g.appendChild(circ);

  const txt = el<SVGTextElement>('text');
  setAttrs(txt, { x, y, 'font-family': 'Courier New', 'font-size': 10, fill: '#1a1a1a',
    'dominant-baseline': 'middle', 'text-anchor': 'middle', 'font-weight': 'bold' });
  txt.textContent = 'E';
  g.appendChild(txt);

  _mapGroup.appendChild(g);
}

// Draws only the corridor fill rectangle. Door symbols for passage doors are
// drawn separately after rooms so they sit on top of both.
function renderCorridorFill(corridor: Corridor): void {
  const r = svgRect(corridor.rect);
  const rect = el<SVGRectElement>('rect');
  setAttrs(rect, {
    x: r.x, y: r.y,
    width: Math.max(r.w, CELL * 0.5),
    height: Math.max(r.h, CELL * 0.5),
    class: 'map-corridor',
  });
  _mapGroup.appendChild(rect);
}

function renderRoom(room: Room, selected: boolean, corridors: Corridor[], roomNumber: number): void {
  const r = svgRect(room.rect);
  const fill = selected ? '#ede8de' : 'white';

  // 1. Room fill
  if (room.shape === 'circle') {
    const ellipse = el<SVGEllipseElement>('ellipse');
    setAttrs(ellipse, {
      cx: r.x + r.w / 2, cy: r.y + r.h / 2,
      rx: r.w / 2, ry: r.h / 2,
      fill, stroke: 'none',
      'data-room-id': room.id, style: 'cursor:pointer',
    });
    ellipse.addEventListener('click', () => selectRoom(room.id));
    _mapGroup.appendChild(ellipse);
  } else {
    const fillRect = el<SVGRectElement>('rect');
    setAttrs(fillRect, {
      x: r.x, y: r.y, width: r.w, height: r.h,
      fill, stroke: 'none',
      'data-room-id': room.id, style: 'cursor:pointer',
    });
    fillRect.addEventListener('click', () => selectRoom(room.id));
    _mapGroup.appendChild(fillRect);
  }

  // 2. Room border — ellipse for circles, rect for rectangles/squares/irregular
  if (room.shape === 'circle') {
    const borderEll = el<SVGEllipseElement>('ellipse');
    setAttrs(borderEll, {
      cx: r.x + r.w / 2, cy: r.y + r.h / 2,
      rx: r.w / 2, ry: r.h / 2,
      fill: 'none', stroke: '#1a1a1a', 'stroke-width': 2,
      'pointer-events': 'none',
    });
    _mapGroup.appendChild(borderEll);
  } else {
    const border = el<SVGRectElement>('rect');
    setAttrs(border, {
      x: r.x, y: r.y, width: r.w, height: r.h,
      fill: 'none', stroke: '#1a1a1a', 'stroke-width': 2,
      'pointer-events': 'none',
    });
    _mapGroup.appendChild(border);
  }

  // 3. Wall openings and door symbols for each exit
  for (const exit of room.exits) {
    const corridor = exit.corridorId ? corridors.find(c => c.id === exit.corridorId) : null;
    // Corridor perpendicular width in SVG px — used to size the opening
    const perpWidth = corridor
      ? ((exit.direction === 'north' || exit.direction === 'south')
          ? corridor.rect.w * CELL
          : corridor.rect.h * CELL)
      : CELL;

    renderWallOpening(exit.exitPoint, exit.direction, perpWidth);

    if (exit.doorType) {
      renderDoorSymbol(exit.exitPoint, exit.direction, exit.doorType);
    }
  }

  // 4. Room number label
  const txt = el<SVGTextElement>('text');
  setAttrs(txt, {
    x: r.x + r.w / 2, y: r.y + r.h / 2,
    class: 'map-label', 'pointer-events': 'none',
  });
  txt.textContent = String(roomNumber);
  _mapGroup.appendChild(txt);
}

// Draws a white rectangle over the room wall at an exit, erasing the stroke
// to create a visible opening. corridorWidth is the perpendicular SVG extent.
function renderWallOpening(exitPoint: GridPos, dir: Direction, corridorWidth: number): void {
  const ex = exitPoint.x * CELL;
  const ey = exitPoint.y * CELL;
  const T = 4; // thickness — enough to cover the 2px stroke with subpixel margin

  let rx: number, ry: number, rw: number, rh: number;
  switch (dir) {
    // North exit: exitPoint is one cell north of the room. Wall at (exitPoint.y+1)*CELL.
    case 'north':
      rx = ex - corridorWidth / 2;
      ry = (exitPoint.y + 1) * CELL - T / 2;
      rw = corridorWidth; rh = T;
      break;
    // South exit: exitPoint is one cell south of the room. Wall at exitPoint.y*CELL.
    case 'south':
      rx = ex - corridorWidth / 2;
      ry = ey - T / 2;
      rw = corridorWidth; rh = T;
      break;
    // East exit: wall at exitPoint.x*CELL.
    case 'east':
      rx = ex - T / 2;
      ry = ey - corridorWidth / 2;
      rw = T; rh = corridorWidth;
      break;
    // West exit: exitPoint is one cell west of the room. Wall at (exitPoint.x+1)*CELL.
    case 'west':
      rx = (exitPoint.x + 1) * CELL - T / 2;
      ry = ey - corridorWidth / 2;
      rw = T; rh = corridorWidth;
      break;
  }

  const gap = el<SVGRectElement>('rect');
  setAttrs(gap, { x: rx, y: ry, width: rw, height: rh, fill: 'white', stroke: 'none' });
  _mapGroup.appendChild(gap);
}

// Draws a door symbol at the room wall for an exit door.
// The door sits ON the wall edge (one cell back from exitPoint in the exit direction).
// Symbol is a thin perpendicular bar (2px travel × CELL*0.7 perpendicular).
function renderDoorSymbol(exitPoint: GridPos, dir: Direction, doorType: DoorType): void {
  if (doorType === 'archway') return;

  const ex = exitPoint.x * CELL;
  const ey = exitPoint.y * CELL;
  const barLen = CELL * 0.7;  // perpendicular extent
  const barThick = 2;          // extent along travel direction

  let dx: number, dy: number, dw: number, dh: number;
  switch (dir) {
    case 'north':
      dx = ex - barLen / 2;
      dy = (exitPoint.y + 1) * CELL - barThick / 2;
      dw = barLen; dh = barThick;
      break;
    case 'south':
      dx = ex - barLen / 2;
      dy = ey - barThick / 2;
      dw = barLen; dh = barThick;
      break;
    case 'east':
      dx = ex - barThick / 2;
      dy = ey - barLen / 2;
      dw = barThick; dh = barLen;
      break;
    case 'west':
      dx = (exitPoint.x + 1) * CELL - barThick / 2;
      dy = ey - barLen / 2;
      dw = barThick; dh = barLen;
      break;
  }

  drawDoorBar(dx, dy, dw, dh, dir, doorType);
}

// Passage-door stub: door sits at the entry face of the corridor rect
// (the end closest to the element that spawned it).
function renderPassageDoor(corridor: Corridor): void {
  const r = svgRect(corridor.rect);
  const barLen = CELL * 0.7;
  const barThick = 2;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;

  let dx: number, dy: number, dw: number, dh: number;
  switch (corridor.direction) {
    case 'north': // entry = south edge
      dx = cx - barLen / 2; dy = r.y + r.h - barThick / 2;
      dw = barLen; dh = barThick;
      break;
    case 'south': // entry = north edge
      dx = cx - barLen / 2; dy = r.y - barThick / 2;
      dw = barLen; dh = barThick;
      break;
    case 'east': // entry = west edge
      dx = r.x - barThick / 2; dy = cy - barLen / 2;
      dw = barThick; dh = barLen;
      break;
    case 'west': // entry = east edge
      dx = r.x + r.w - barThick / 2; dy = cy - barLen / 2;
      dw = barThick; dh = barLen;
      break;
  }

  drawDoorBar(dx, dy, dw, dh, corridor.direction, corridor.doorType!);
}

// Shared door bar renderer used by both renderDoorSymbol and renderPassageDoor.
function drawDoorBar(
  dx: number, dy: number, dw: number, dh: number,
  dir: Direction, doorType: DoorType,
): void {
  if (doorType === 'stone_secret') {
    const txt = el<SVGTextElement>('text');
    setAttrs(txt, {
      x: dx + dw / 2, y: dy + dh / 2,
      'font-family': 'Courier New', 'font-size': 8, fill: '#1a1a1a',
      'dominant-baseline': 'middle', 'text-anchor': 'middle',
    });
    txt.textContent = 'S';
    _mapGroup.appendChild(txt);
    return;
  }

  const bar = el<SVGRectElement>('rect');
  setAttrs(bar, { x: dx, y: dy, width: dw, height: dh, class: 'map-door' });
  _mapGroup.appendChild(bar);

  if (doorType === 'wooden_locked' || doorType === 'iron') {
    const circ = el<SVGCircleElement>('circle');
    setAttrs(circ, {
      cx: dx + dw / 2, cy: dy + dh / 2, r: 2,
      fill: 'white', stroke: '#1a1a1a', 'stroke-width': 1,
    });
    _mapGroup.appendChild(circ);
  }

  if (doorType === 'portcullis') {
    const isHoriz = dir === 'north' || dir === 'south';
    for (let i = 1; i < 3; i++) {
      const line = el<SVGLineElement>('line');
      if (isHoriz) {
        const lx = dx + (dw / 3) * i;
        setAttrs(line, { x1: lx, y1: dy, x2: lx, y2: dy + dh, stroke: 'white', 'stroke-width': 0.5 });
      } else {
        const ly = dy + (dh / 3) * i;
        setAttrs(line, { x1: dx, y1: ly, x2: dx + dw, y2: ly, stroke: 'white', 'stroke-width': 0.5 });
      }
      _mapGroup.appendChild(line);
    }
  }
}

function renderCursor(pos: { x: number; y: number }): void {
  const { x, y } = gridToSvg(pos.x, pos.y);
  const diamond = el<SVGPolygonElement>('polygon');
  const s = CELL * 0.3;
  diamond.setAttribute('points', `${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`);
  diamond.setAttribute('fill', '#888');
  diamond.setAttribute('opacity', '0.5');
  _mapGroup.appendChild(diamond);
}

function selectRoom(roomId: string): void {
  setState(s => ({ ...s, selectedRoomId: s.selectedRoomId === roomId ? null : roomId }));
}

function getBounds(state: DungeonState): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const rects: { x: number; y: number; w: number; h: number }[] = [
    ...state.rooms.map(r => r.rect),
    ...state.corridors.map(c => c.rect),
  ];
  if (rects.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  // Include origin (entrance)
  minX = Math.min(minX, -1);
  minY = Math.min(minY, -1);
  maxX = Math.max(maxX, 1);
  maxY = Math.max(maxY, 1);

  return { minX, minY, maxX, maxY };
}

function autoFit(state: DungeonState): void {
  const bounds = getBounds(state);
  if (!bounds) return;

  const { minX, minY, maxX, maxY } = bounds;
  const contentW = (maxX - minX + PADDING * 2) * CELL;
  const contentH = (maxY - minY + PADDING * 2) * CELL;

  const svgRect_ = _svg.getBoundingClientRect();
  if (svgRect_.width === 0 || svgRect_.height === 0) return;

  const scaleX = svgRect_.width / contentW;
  const scaleY = svgRect_.height / contentH;
  _zoom = Math.min(scaleX, scaleY, 2);

  _viewX = (-minX + PADDING) * CELL * _zoom + (svgRect_.width - contentW * _zoom) / 2;
  _viewY = (-minY + PADDING) * CELL * _zoom + (svgRect_.height - contentH * _zoom) / 2;

  applyTransform();
}

export function exportPNG(): void {
  const svgEl = document.getElementById('dungeon-map') as unknown as SVGSVGElement;
  const bbox = svgEl.getBoundingClientRect();
  const scale = 2;
  const w = bbox.width * scale;
  const h = bbox.height * scale;

  const serialiser = new XMLSerializer();
  const svgStr = serialiser.serializeToString(svgEl);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#faf8f3';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // Scale bar
    const barW = 100 * scale;
    const barH = 8 * scale;
    const bx = 20 * scale;
    const by = h - 30 * scale;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = '#faf8f3';
    ctx.font = `${10 * scale}px Courier New`;
    ctx.fillText('100 ft', bx + barW + 6 * scale, by + barH);

    const link = document.createElement('a');
    link.download = 'dungeon.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    URL.revokeObjectURL(url);
  };
  img.src = url;
}
