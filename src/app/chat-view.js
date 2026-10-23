// The questions and answers in the middle column.
// A message looks like:
//   { question, pending: true, streamed }                       while the model writes
//   { question, mode: 'answer', verification, rawAnswer, stats } after checking
//   { question, mode: 'search-only', chunks }                   when no AI is used

import { el, button } from './dom.js';
import { icon } from './icons.js';
import { RECOMMENDED_MODEL } from '../../rag/generation/engine-setup.js';

const REASONS = {
  'no-citation': 'no proof given',
  'unknown-id': 'pointed to a line it was not shown',
  'number-mismatch': 'a number is not in the proof',
  'low-overlap': 'the proof says something else',
  'negation-mismatch': 'says "not", the proof does not',
  'too-vague': 'too vague to check',
  'says-not-found': 'the AI said this is not in the document',
  'off-topic-link': '"this/it" points to a different topic',
  'exclusion-conflict': 'says "covered" but the proof is an exclusion',
  'number-wrong-subject': 'the number in the proof is about something else',
};

const EXAMPLES = [
  'Is cataract surgery covered?',
  'What is the notice period?',
  'How much is the deposit?',
];

/** "Page 14" buttons for a sentence: one per page its proof is on. */
function proofChips(ids, view) {
  const byPage = new Map();
  for (const id of ids) {
    const page = view.pageOf(id);
    if (!page) continue;
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page).push(id);
  }
  const chips = [];
  for (const [page, pageIds] of byPage) {
    const chip = button(`p. ${page}`, 'chip', () => view.onCite(pageIds));
    chip.title = 'Show the proof in the document';
    chips.push(chip);
  }
  return chips;
}

/** One answer sentence with its proof buttons. */
function sentenceLine(item, view) {
  const p = el('p', null, item.text);
  for (const chip of proofChips(item.ids, view)) p.appendChild(chip);
  return p;
}

function droppedDetails(dropped) {
  const details = el('details');
  details.appendChild(el('summary', null, `Removed by the checker (${dropped.length})`));
  const list = el('ul');
  for (const item of dropped) {
    const reason = REASONS[item.reason] || item.reason;
    list.appendChild(el('li', null, `“${item.text}” (${reason})`));
  }
  details.appendChild(list);
  return details;
}

function statsLine(message) {
  const s = message.stats || {};
  const parts = [];
  if (s.firstTokenMs) parts.push(`first word ${(s.firstTokenMs / 1000).toFixed(1)} s`);
  if (s.tokensPerSec) parts.push(`${s.tokensPerSec.toFixed(0)} words/s`);
  if (message.modelName) parts.push(message.modelName === RECOMMENDED_MODEL.name ? RECOMMENDED_MODEL.label : message.modelName);
  return el('div', 'stats', parts.join(' · '));
}

/** A small coloured label at the top of an answer, with an optional icon. */
function badge(kind, text, iconName) {
  const label = el('div', `badge ${kind}`);
  if (iconName) label.appendChild(icon(iconName));
  label.appendChild(el('span', null, text));
  return label;
}

/** The answer bubble after checking. */
function answerBubble(message, view) {
  const box = el('div', 'a');
  const v = message.verification;
  if (v.status === 'answered') {
    box.appendChild(badge('ok', 'Verified in your document', 'check'));
  } else if (v.status === 'related') {
    box.appendChild(badge('warn', 'Not found exactly. Related lines from your document:', 'info'));
  } else {
    box.appendChild(badge('muted', "I couldn't find this in your document.", 'search'));
    if (message.closest && message.closest.length) {
      box.appendChild(el('p', 'writing', 'Closest lines (not checked, read them yourself):'));
      for (const line of passageLines(message.closest, view)) box.appendChild(line);
    } else {
      box.appendChild(el('p', null, 'Try asking with other words, or check a different document.'));
    }
  }
  for (const item of v.kept) box.appendChild(sentenceLine(item, view));
  if (v.dropped.length) box.appendChild(droppedDetails(v.dropped));
  box.appendChild(statsLine(message));
  return box;
}

/** Short passage lines with "Page N" buttons. */
function passageLines(chunks, view) {
  return chunks.map((chunk) => {
    const text = chunk.text.length > 260 ? `${chunk.text.slice(0, 260)}…` : chunk.text;
    return sentenceLine({ text, ids: chunk.sentenceIds }, view);
  });
}

/** The bubble for search-only mode: the best matching passages. */
function searchBubble(message, view) {
  const box = el('div', 'a');
  box.appendChild(badge('muted', 'Search only (no AI). Best matching lines:', 'search'));
  for (const line of passageLines(message.chunks.slice(0, 4), view)) box.appendChild(line);
  return box;
}

/** The bubble while the model is still writing. */
function pendingBubble(message) {
  const box = el('div', 'a');
  box.appendChild(badge('muted', message.streamed ? 'Writing… (will be checked)' : 'Reading your document…'));
  if (message.streamed) box.appendChild(el('p', 'writing', message.streamed));
  return box;
}

/** One of the three promises on the welcome screen. */
function promise(iconName, title, text) {
  const card = el('div');
  const head = el('strong');
  head.appendChild(icon(iconName));
  head.appendChild(el('span', null, title));
  card.appendChild(head);
  card.appendChild(el('span', null, text));
  return card;
}

/** The first screen: what Underline does, and a place to drop a PDF. */
function introScreen(onPick) {
  const box = el('div', 'welcome');
  const title = el('h1', null, 'Ask your documents. ');
  title.appendChild(el('span', 'marked', 'See the proof.'));
  box.appendChild(title);
  box.appendChild(el('p', 'lead', 'Underline answers questions about your PDFs and highlights the exact lines it used. Everything runs on this computer: no cloud, no account, no upload.'));
  const trust = el('div', 'trust');
  trust.appendChild(promise('lock', 'Offline & private', 'Your files never leave this device.'));
  trust.appendChild(promise('check', 'Checked answers', 'Every sentence is verified against the text.'));
  trust.appendChild(promise('marker', 'Proof you can see', 'The source lines are highlighted in the PDF.'));
  box.appendChild(trust);
  const drop = button('', 'dropzone', onPick);
  drop.appendChild(icon('upload'));
  drop.appendChild(el('strong', null, 'Drop a PDF here, or click to choose'));
  drop.appendChild(el('span', null, 'Insurance policy, rent agreement, offer letter, HR rules…'));
  box.appendChild(drop);
  return box;
}

/** The empty state: what to do first. `docName` is the open document, if any. */
export function renderWelcome(container, docName, onExample, onPick) {
  if (!docName) {
    container.replaceChildren(introScreen(onPick));
    return;
  }
  const box = el('div', 'welcome');
  box.appendChild(el('h2', null, 'Ask anything about this document'));
  box.appendChild(el('p', 'lead', `${docName} is ready. Ask in plain words, or try one of these:`));
  const examples = el('div', 'examples');
  for (const text of EXAMPLES) examples.appendChild(button(text, 'btn', () => onExample(text)));
  box.appendChild(examples);
  container.replaceChildren(box);
}

/**
 * Show all messages. `view` has pageOf(id) and onCite(ids).
 */
export function renderMessages(container, messages, view) {
  container.replaceChildren();
  for (const message of messages) {
    container.appendChild(el('div', 'q', message.question));
    if (message.pending) container.appendChild(pendingBubble(message));
    else if (message.mode === 'search-only') container.appendChild(searchBubble(message, view));
    else if (message.error) container.appendChild(el('div', 'a', `Something went wrong: ${message.error}`));
    else container.appendChild(answerBubble(message, view));
  }
  container.scrollTop = container.scrollHeight;
}
