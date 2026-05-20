import type { DungeonState, RollRecord } from '../types.js';
import { setState, resetState } from '../state.js';
import { generateStart, generateNext, applyOverride } from '../generator.js';

export function initControls(): void {
  const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
  const btnNext = document.getElementById('btn-next') as HTMLButtonElement;
  const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;

  btnStart.addEventListener('click', () => {
    const level = parseInt((document.getElementById('setting-level') as HTMLInputElement).value, 10);
    const size = (document.getElementById('setting-size') as HTMLSelectElement).value as 'small' | 'medium' | 'large';
    const dir = (document.getElementById('setting-direction') as HTMLSelectElement).value as 'north' | 'east' | 'south' | 'west';

    setState(s => generateStart({
      ...s,
      settings: { level, size, startDirection: dir },
    }));
  });

  btnNext.addEventListener('click', () => {
    setState(s => generateNext(s));
  });

  btnReset.addEventListener('click', () => {
    if (confirm('Reset dungeon? All progress will be lost.')) {
      resetState();
    }
  });
}

export function renderControls(state: DungeonState): void {
  const settingsPanel = document.getElementById('settings-panel') as HTMLDivElement;
  const generationControls = document.getElementById('generation-controls') as HTMLDivElement;
  const btnNext = document.getElementById('btn-next') as HTMLButtonElement;

  if (state.started) {
    settingsPanel.style.display = 'none';
    generationControls.style.display = 'flex';
  } else {
    settingsPanel.style.display = '';
    generationControls.style.display = 'none';
  }

  btnNext.disabled = state.cursors.length === 0;
  if (state.cursors.length === 0 && state.started) {
    btnNext.textContent = 'Generation complete';
  } else {
    btnNext.textContent = 'Generate Next';
  }
}

export function renderRollResults(state: DungeonState): void {
  const container = document.getElementById('roll-results') as HTMLDivElement;
  container.innerHTML = '';

  // Newest at top
  const reversed = [...state.rollHistory].reverse();
  for (const roll of reversed) {
    container.appendChild(buildRollCard(roll, state));
  }
}

function buildRollCard(roll: RollRecord, state: DungeonState): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'roll-card';

  const header = document.createElement('div');
  header.className = 'roll-card-header';

  const tableName = document.createElement('span');
  tableName.className = 'roll-card-table';
  tableName.textContent = roll.table;

  const dice = document.createElement('span');
  dice.className = 'roll-card-dice';
  dice.textContent = roll.overridden ? '(overridden)' : `roll: ${roll.diceResult}`;

  header.appendChild(tableName);
  header.appendChild(dice);
  card.appendChild(header);

  const result = document.createElement('div');
  result.className = 'roll-card-result';
  result.textContent = roll.overridden ? (roll.overrideValue ?? roll.outcome) : roll.outcome;
  card.appendChild(result);

  const actions = document.createElement('div');
  actions.className = 'roll-card-actions';

  const rerollBtn = document.createElement('button');
  rerollBtn.className = 'small secondary';
  rerollBtn.textContent = 'Reroll';
  rerollBtn.addEventListener('click', () => {
    // Re-apply the same table by re-running generation from that step is complex;
    // instead we just mark it for manual override by focusing the input
    overrideInput.focus();
    overrideInput.select();
  });

  const overrideInput = document.createElement('input');
  overrideInput.type = 'text';
  overrideInput.className = 'roll-card-override';
  overrideInput.placeholder = 'Override…';
  overrideInput.value = roll.overrideValue ?? '';

  const applyBtn = document.createElement('button');
  applyBtn.className = 'small';
  applyBtn.textContent = 'Apply';
  applyBtn.addEventListener('click', () => {
    const val = overrideInput.value.trim();
    if (val) {
      setState(s => applyOverride(s, roll.id, val));
    }
  });

  overrideInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') applyBtn.click();
  });

  actions.appendChild(rerollBtn);
  actions.appendChild(overrideInput);
  actions.appendChild(applyBtn);
  card.appendChild(actions);

  // Dim older cards slightly
  if (roll.step < state.stepCount - 1) {
    card.style.opacity = '0.7';
  }

  return card;
}
