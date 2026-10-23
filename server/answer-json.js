// Turn a pipeline result into the JSON the API returns.
//
// {
//   status: 'answered' | 'related' | 'not-found' | 'search-only',
//   answer: [{ text, citations: [{ id, page, text, boxes }] }],   // sentences that passed the checker
//   removed: [{ text, reason }],                                   // sentences the checker threw out
//   passages: [{ text, pages }],                                   // best matching passages (search-only / not found)
//   model, timings: { retrieveMs, firstTokenMs, totalMs }
// }
// `boxes` are PDF-space rectangles [{ x, y, w, h }] so any client can highlight the proof.

function citation(index, id) {
  const sentence = index.sentenceById.get(id);
  return { id, page: sentence.page, text: sentence.text, boxes: sentence.boxes };
}

function passage(index, chunk) {
  const pages = [...new Set(chunk.sentenceIds.map((id) => index.sentenceById.get(id).page))];
  return { text: chunk.text, pages };
}

export function toAnswerJson(result, index, model) {
  const timings = { retrieveMs: Math.round(result.retrieveMs) };
  if (result.mode === 'search-only') {
    const passages = result.chunks.slice(0, 4).map((chunk) => passage(index, chunk));
    return { status: 'search-only', answer: [], removed: [], passages, model: null, timings };
  }

  const v = result.verification;
  const answer = v.kept.map((item) => ({ text: item.text, citations: item.ids.map((id) => citation(index, id)) }));
  const removed = v.dropped.map((item) => ({ text: item.text, reason: item.reason }));
  const passages = v.status === 'not-found' ? result.chunks.slice(0, 3).map((chunk) => passage(index, chunk)) : [];
  if (result.stats) {
    timings.firstTokenMs = Math.round(result.stats.firstTokenMs);
    timings.totalMs = Math.round(result.stats.totalMs);
  }
  return { status: v.status, answer, removed, passages, model, timings };
}
