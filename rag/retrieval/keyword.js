// Keyword search over chunks, using MiniSearch.

import MiniSearch from 'minisearch';
import { keywords } from '../verification/words.js';

/** Turn a word into a search term (same rules as verify.js), or null to skip it. */
function toTerm(word) {
  const found = keywords(word);
  return found.length ? found[0] : null;
}

/** Build the keyword index for the chunks. */
export function buildKeywordIndex(chunks) {
  const index = new MiniSearch({
    fields: ['text'],
    storeFields: ['id'],
    processTerm: toTerm,
    searchOptions: { prefix: true, fuzzy: 0.15 },
  });
  index.addAll(chunks);
  return index;
}

/** Search the index. Returns chunk IDs, best first. */
export function keywordSearch(index, query, limit = 20) {
  const results = index.search(query);
  return results.slice(0, limit).map((r) => r.id);
}
