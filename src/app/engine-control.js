// Keeps track of the AI engine state and turns the chosen model into an "ask" function.

import { findEngines, downloadModel, RECOMMENDED_MODEL } from '../answer/engine-setup.js';
import { askLocalServer } from '../answer/providers/local-server.js';
import { renderEngine } from './engine-view.js';

const CHOICE_KEY = 'underline-model';

let state = { phase: 'checking', engines: [], choice: 'none' };
let container = null;

function draw() {
  renderEngine(container, state, { retry: refreshEngine, download: startDownload, choose });
}

function setState(changes) {
  state = { ...state, ...changes };
  draw();
}

/** Remember the user's model choice on this device. */
function choose(value) {
  try {
    localStorage.setItem(CHOICE_KEY, value);
  } catch {
    // Storage can be blocked; the choice then lasts only for this visit.
  }
  setState({ choice: value });
}

function savedChoice() {
  try {
    return localStorage.getItem(CHOICE_KEY);
  } catch {
    return null;
  }
}

/** Pick a model: the saved choice if it still exists, else the recommended one, else the first. */
function pickChoice(engines) {
  const values = engines.flatMap((e) => e.models.map((m) => `local|${e.url}|${m}`));
  const saved = savedChoice();
  if (saved && (saved === 'none' || values.includes(saved))) return saved;
  const recommended = values.find((v) => v.endsWith(`|${RECOMMENDED_MODEL.name}`));
  return recommended || values[0] || 'none';
}

/** Look for engines and models again. */
export async function refreshEngine() {
  setState({ phase: 'checking' });
  const { engines, hasRecommended } = await findEngines();
  if (engines.length === 0) {
    setState({ phase: 'none', engines, choice: 'none' });
    return;
  }
  const choice = pickChoice(engines);
  const hasAnyModel = engines.some((e) => e.models.length);
  const ollama = engines.find((e) => e.name === 'Ollama');
  const shouldOfferDownload = ollama && !hasRecommended && !hasAnyModel;
  setState({ phase: shouldOfferDownload ? 'no-model' : 'ready', engines, choice, error: null });
}

/** Download the recommended model through Ollama, showing progress. */
async function startDownload() {
  const ollama = state.engines.find((e) => e.name === 'Ollama');
  if (!ollama) return;
  setState({ phase: 'downloading', progress: 0, progressText: 'Starting' });
  try {
    const onProgress = (fraction, text) => setState({ progress: fraction, progressText: text });
    await downloadModel(ollama.url, RECOMMENDED_MODEL.name, onProgress);
    await refreshEngine();
  } catch (error) {
    setState({ phase: 'no-model', error: error.message });
  }
}

/** Show the card in `element` and start looking for engines. */
export function startEngineCard(element) {
  container = element;
  draw();
  return refreshEngine();
}

let warmedChoice = null;

/**
 * Load the chosen model into memory before the first question, so the first answer is fast.
 * Called when the user clicks into the question box. Only Ollama needs this.
 */
export function warmUp() {
  if (state.phase !== 'ready' || state.choice === 'none' || warmedChoice === state.choice) return;
  warmedChoice = state.choice;
  const [, url, model] = state.choice.split('|');
  const isOllama = state.engines.some((e) => e.url === url && e.name === 'Ollama');
  if (!isOllama) return;
  const body = JSON.stringify({ model, keep_alive: '10m' }); // an empty request just loads the model
  fetch(`${url}/api/generate`, { method: 'POST', body }).catch(() => {
    warmedChoice = null;
  });
}

/** The "ask" function for the chosen model, or null for search only. Also returns a short model name. */
export function currentAsk() {
  if (state.choice === 'none' || state.phase !== 'ready') return { ask: null, modelName: null };
  const [, url, model] = state.choice.split('|');
  const ask = (messages, onToken) => askLocalServer(url, model, messages, onToken);
  return { ask, modelName: model };
}
