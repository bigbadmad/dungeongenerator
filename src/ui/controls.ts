import type { DungeonState, RollRecord, Direction, DungeonSize } from '../types.js';
import { setState, resetState } from '../state.js';
import {
  createInitialState,
  generateStart,
  generateNext,
  generateAll,
  applyOverride,
  clearOverride,
  roomTarget,
} from '../generator.js';
import { hashSeed, randomSeed } from '../rng.js';
import { TABLE_OPTIONS } from '../tableOptions.js';
import { fitView } from './map.js';

function readSettings() {
  const level = Math.min(10, Math.max(1, parseInt((document.getElementById('setting-level') as HTMLInputElement).value, 10) || 1));
  const size = (document.getElementById('setting-size') as HTMLSelectElement).value as DungeonSize;
  const startDirection = (document.getElementById('setting-direction') as HTMLSelectElement).value as Direction;
  const seedText = (document.getElementById('setting-seed') as HTMLInputElement).value.trim();
  // A plain number is used as-is so a displayed seed can be typed back in.
  const seed = seedText === '' ? randomSeed() : /^\d+$/.test(seedText) ? Number(seedText) >>> 0 : hashSeed(seedText);
  return { settings: { level, size, startDirection }, seed };
}

export function initControls(): void {
  const btnGenerateAll = document.getElementById('btn-generate-all') as HTMLButtonElement;
  const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
  const btnNext = document.getElementById('btn-next') as HTMLButtonElement;
  const btnFinish = document.getElementById('btn-finish') as HTMLButtonElement;
  const btnFit = document.getElementById('btn-fit') as HTMLButtonElement;
  const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;

  btnGenerateAll.addEventListener('click', () => {
    const { settings, seed } = readSettings();
    setState(() => generateAll(generateStart(createInitialState(settings, seed))));
  });

  btnStart.addEventListener('click', () => {
    const { settings, seed } = readSettings();
    setState(() => generateStart(createInitialState(settings, seed)));
  });

  btnNext.addEventListener('click', () => setState(s => generateNext(s)));
  btnFinish.addEventListener('click', () => setState(s => generateAll(s)));
  btnFit.addEventListener('click', () => fitView());

  btnReset.addEventListener('click', () => {
    if (confirm('Start a new dungeon? The current one will be lost unless you saved it.')) {
      resetState();
    }
  });
}

export function renderControls(state: DungeonState): void {
  const settingsPanel = document.getElementById('settings-panel') as HTMLDivElement;
  const generationControls = document.getElementById('generation-controls') as HTMLDivElement;
  const btnNext = document.getElementById('btn-next') as HTMLButtonElement;
  const btnFinish = document.getElementById('btn-finish') as HTMLButtonElement;
  const status = document.getElementById('status-line') as HTMLDivElement;

  settingsPanel.style.display = state.started ? 'none' : '';
  generationControls.style.display = state.started ? 'flex' : 'none';

  const done = state.cursors.length === 0;
  btnNext.disabled = done;
  btnFinish.disabled = done;
  btnNext.textContent = done && state.started ? 'Complete' : 'Generate Next';

  if (state.started) {
    const target = roomTarget(state.settings.size, state.seed);
    status.textContent =
      `Seed ${state.seed} · level ${state.settings.level} · ${state.rooms.length} rooms` +
      (done ? ' · complete' : ` (aiming for ~${target}) · ${state.cursors.length} open`);
  } else {
    status.textContent = '';
  }
}

// ── Roll log ────────────────────────────────────────────────────────────────

export function renderRollResults(state: DungeonState): void {
  const container = document.getElementById('roll-results') as HTMLDivElement;
  const scroll = container.scrollTop;
  container.innerHTML = '';

  // Newest first, grouped by step.
  const frag = document.createDocumentFragment();
  let currentStep = -1;
  for (const roll of [...state.rollHistory].reverse()) {
    if (roll.step !== currentStep) {
      currentStep = roll.step;
      const head = document.createElement('div');
      head.className = 'roll-step';
      head.textContent = currentStep === 0 ? 'Entrance' : `Step ${currentStep}`;
      frag.appendChild(head);
    }
    frag.appendChild(buildRollCard(roll, state));
  }
  container.appendChild(frag);
  container.scrollTop = scroll;
}

function buildRollCard(roll: RollRecord, state: DungeonState): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'roll-card' + (roll.overridden ? ' overridden' : '');

  const header = document.createElement('div');
  header.className = 'roll-card-header';

  const tableName = document.createElement('span');
  tableName.className = 'roll-card-table';
  tableName.textContent = roll.note ? `${roll.table} · ${roll.note}` : roll.table;

  const dice = document.createElement('span');
  dice.className = 'roll-card-dice';
  dice.textContent = roll.sides > 0 ? `d${roll.sides}: ${roll.diceResult}` : '';

  header.appendChild(tableName);
  header.appendChild(dice);
  card.appendChild(header);

  const result = document.createElement('div');
  result.className = 'roll-card-result';
  result.textContent = roll.outcome;
  card.appendChild(result);

  if (roll.overridden) {
    const was = document.createElement('div');
    was.className = 'roll-card-was';
    was.textContent = `forced (rolled: ${roll.naturalOutcome ?? '?'})`;
    card.appendChild(was);
  }

  // Only real dice rolls can be overridden; log-only events have no die.
  const options = roll.sides > 0 ? TABLE_OPTIONS[roll.table] : undefined;
  if (options && options.length > 0) {
    const actions = document.createElement('div');
    actions.className = 'roll-card-actions';

    const change = document.createElement('button');
    change.className = 'small secondary';
    change.textContent = 'Change';
    change.addEventListener('click', () => {
      actions.innerHTML = '';

      const select = document.createElement('select');
      select.className = 'roll-card-override';
      for (const opt of options) {
        const o = document.createElement('option');
        o.value = String(opt.value);
        o.textContent = opt.label;
        if (String(opt.value) === roll.outcomeKey) o.selected = true;
        select.appendChild(o);
      }
      actions.appendChild(select);

      const apply = document.createElement('button');
      apply.className = 'small';
      apply.textContent = 'Apply';
      apply.title = 'Force this result and regenerate everything that follows';
      apply.addEventListener('click', () => setState(s => applyOverride(s, roll.key, select.value)));
      actions.appendChild(apply);
    });
    actions.appendChild(change);

    if (roll.overridden) {
      const undo = document.createElement('button');
      undo.className = 'small secondary';
      undo.textContent = 'Undo';
      undo.addEventListener('click', () => setState(s => clearOverride(s, roll.key)));
      actions.appendChild(undo);
    }
    card.appendChild(actions);
  }

  if (roll.step < state.stepCount - 1) card.style.opacity = '0.8';
  return card;
}
