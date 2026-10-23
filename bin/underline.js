#!/usr/bin/env node
// Underline from the command line: ask a PDF a question and get a verified answer with page numbers.
//
//   node bin/underline.js ask policy.pdf "What is the waiting period for cataract?"
//   node bin/underline.js ask policy.pdf "..." --model <ollama model> --search-only --json
//   node bin/underline.js serve           (same as npm run serve)

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { addDocument, ask } from '../server/engine.js';

function readOptions(args) {
  const options = { json: args.includes('--json'), searchOnly: args.includes('--search-only') };
  const modelAt = args.indexOf('--model');
  if (modelAt >= 0) options.model = args[modelAt + 1];
  return options;
}

/** Print an answer for people: each sentence with its pages, then what the checker removed. */
function printAnswer(result) {
  const pagesOf = (citations) => [...new Set(citations.map((c) => c.page))].map((p) => `p. ${p}`).join(', ');
  if (result.status === 'answered') console.log('✓ Verified in the document\n');
  if (result.status === 'related') console.log('~ Not found exactly. Related lines:\n');
  if (result.status === 'not-found') console.log("✗ I couldn't find this in the document.\n");
  for (const sentence of result.answer) console.log(`  ${sentence.text}  [${pagesOf(sentence.citations)}]`);
  for (const passage of result.passages) console.log(`  … ${passage.text.slice(0, 220)}  [p. ${passage.pages.join(', ')}]`);
  if (result.removed.length) {
    console.log('\nRemoved by the checker:');
    for (const item of result.removed) console.log(`  - "${item.text}" (${item.reason})`);
  }
}

async function main() {
  const [command, file, question, ...rest] = process.argv.slice(2);
  if (command === 'serve') {
    await import('../server/index.js').then(({ makeServer }) => makeServer().listen(Number(process.env.PORT) || 8787, '127.0.0.1'));
    console.log(`Underline API on http://127.0.0.1:${Number(process.env.PORT) || 8787}`);
    return;
  }
  if (command !== 'ask' || !file || !question) {
    console.log('Usage: node bin/underline.js ask <file.pdf> "<question>" [--model M] [--search-only] [--json]');
    process.exit(1);
  }
  const options = readOptions(rest);
  const doc = await addDocument(await readFile(file), basename(file));
  if (!options.json) console.log(`${doc.name}: ${doc.pages} pages, ${doc.sentences} sentences indexed\n`);
  const result = await ask(doc.id, question, options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printAnswer(result);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
