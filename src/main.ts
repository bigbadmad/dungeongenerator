import './style.css';
import { getState, subscribe, saveToFile, loadFromJSON } from './state.js';
import { initMap, renderMap, exportPNG } from './ui/map.js';
import { initControls, renderControls, renderRollResults } from './ui/controls.js';
import { renderRoomKey } from './ui/roomkey.js';

function render(): void {
  const state = getState();
  renderMap(state);
  renderControls(state);
  renderRollResults(state);
  renderRoomKey(state);
}

function init(): void {
  initMap();
  initControls();

  // Save / Load / Export
  document.getElementById('btn-save')!.addEventListener('click', saveToFile);

  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  document.getElementById('btn-load')!.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!loadFromJSON(text)) {
        alert('Failed to load dungeon file. The file may be invalid or corrupted.');
      }
      fileInput.value = '';
    };
    reader.readAsText(file);
  });

  document.getElementById('btn-export-png')!.addEventListener('click', exportPNG);

  subscribe(render);
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
