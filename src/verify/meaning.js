// Meaning check: a small local model reads the proof and one answer sentence
// and says whether the proof really says that ("entailment"), says the opposite
// ("contradiction"), or doesn't say it ("neutral").
// This catches mistakes that word and number rules cannot, e.g.
//   proof:  "The Company shall settle a claim within 30 days of the last document."
//   answer: "You must file your claim within 30 days."   -> neutral, so it is dropped.

import { AutoTokenizer, AutoModelForSequenceClassification } from '@huggingface/transformers';

/** Load the meaning model once. Returns { tokenizer, model, labels }. */
export async function loadMeaningChecker(modelId, device, dtype = 'q8') {
  const options = { dtype };
  if (device) options.device = device;
  const tokenizer = await AutoTokenizer.from_pretrained(modelId);
  const model = await AutoModelForSequenceClassification.from_pretrained(modelId, options);
  const labels = model.config.id2label; // e.g. { 0: 'contradiction', 1: 'entailment', 2: 'neutral' }
  return { tokenizer, model, labels };
}

/** Turn raw scores into probabilities that add up to 1. */
function softmax(values) {
  const max = Math.max(...values);
  const exps = values.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/**
 * How strongly does `proof` support `sentence`?
 * Returns { entailment, neutral, contradiction }, each between 0 and 1.
 */
export async function supportScores(checker, proof, sentence) {
  const { tokenizer, model, labels } = checker;
  const inputs = tokenizer(proof, { text_pair: sentence, truncation: true, max_length: 512 });
  const output = await model(inputs);
  const probabilities = softmax(Array.from(output.logits.data));
  const scores = {};
  probabilities.forEach((p, i) => {
    const name = String(labels[i]).toLowerCase();
    scores[name] = p;
  });
  return scores;
}
