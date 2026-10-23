// The "AI engine" card in the sidebar: is a local AI ready, and if not, how to get it.

import { el, button } from './dom.js';
import { RECOMMENDED_MODEL } from '../answer/engine-setup.js';

function head(text, dotClass) {
  const row = el('div', 'engine-head');
  row.appendChild(el('span', `dot ${dotClass}`));
  row.appendChild(el('span', null, text));
  return row;
}

function progressBar(fraction) {
  const bar = el('div', 'progress');
  const fill = el('div');
  fill.style.width = `${Math.round((fraction || 0) * 100)}%`;
  bar.appendChild(fill);
  return bar;
}

/** A dropdown of models + "Search only". */
function modelSelect(state, actions) {
  const select = el('select');
  select.setAttribute('aria-label', 'AI model');
  for (const engine of state.engines) {
    for (const model of engine.models) {
      const label = model === RECOMMENDED_MODEL.name ? RECOMMENDED_MODEL.label : model;
      const option = el('option', null, `${label} · ${engine.name}`);
      option.value = `local|${engine.url}|${model}`;
      select.appendChild(option);
    }
  }
  const none = el('option', null, 'Search only (no AI)');
  none.value = 'none';
  select.appendChild(none);
  select.value = state.choice;
  select.addEventListener('change', () => actions.choose(select.value));
  return select;
}

/**
 * Draw the card for the current state.
 * state.phase: 'checking' | 'none' | 'no-model' | 'downloading' | 'ready'
 */
export function renderEngine(container, state, actions) {
  container.replaceChildren();

  if (state.phase === 'checking') {
    container.appendChild(head('Looking for AI on this computer…', ''));
    return;
  }

  if (state.phase === 'none') {
    container.appendChild(head('AI not set up', 'warn'));
    container.appendChild(el('p', null, 'You can already search your documents. For answers in plain words:'));
    container.appendChild(el('p', null, '1. Install the free Ollama app (ollama.com) and open it.'));
    container.appendChild(el('p', null, '2. Click "Check again".'));
    container.appendChild(button('Check again', 'btn', actions.retry));
    return;
  }

  if (state.phase === 'no-model') {
    container.appendChild(head('Ollama found', 'warn'));
    container.appendChild(el('p', null, `Download the AI model once: ${RECOMMENDED_MODEL.label}, ${RECOMMENDED_MODEL.size}. It stays on this computer.`));
    container.appendChild(button('Download AI model', 'btn primary', actions.download));
    if (state.error) container.appendChild(el('p', null, `Error: ${state.error}`));
    if (state.engines.some((e) => e.models.length)) container.appendChild(modelSelect(state, actions));
    return;
  }

  if (state.phase === 'downloading') {
    container.appendChild(head('Downloading AI model…', 'warn'));
    container.appendChild(progressBar(state.progress));
    const percent = state.progress ? ` ${Math.round(state.progress * 100)}%` : '';
    container.appendChild(el('p', null, `${state.progressText || ''}${percent}`));
    return;
  }

  container.appendChild(head(state.choice === 'none' ? 'Search only' : 'Local AI ready', state.choice === 'none' ? '' : 'ok'));
  container.appendChild(modelSelect(state, actions));
}
