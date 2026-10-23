import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { makeServer } from '../server/index.js';

// The API end to end on the synthetic offer letter, in search-only mode (no LLM needed).
let server;
let base;

beforeAll(async () => {
  server = makeServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => server.close());

const post = (path, body, headers = {}) => fetch(`${base}${path}`, { method: 'POST', body, headers });

describe('REST API', () => {
  it('indexes a PDF and answers in search-only mode with page numbers', async () => {
    const pdf = await readFile(new URL('../eval/docs/offer-letter.pdf', import.meta.url));
    const added = await (await post('/documents', pdf, { 'X-Filename': 'offer-letter.pdf' })).json();
    expect(added.pages).toBe(5);
    expect(added.sentences).toBeGreaterThan(50);

    const reply = await post(`/documents/${added.id}/ask`, JSON.stringify({ question: 'What is the annual CTC?', searchOnly: true }));
    const result = await reply.json();
    expect(result.status).toBe('search-only');
    expect(result.passages.some((p) => p.text.includes('18,50,000'))).toBe(true);
    expect(result.passages[0].pages.length).toBeGreaterThan(0);
  }, 60000);

  it('refuses a body that is not a PDF', async () => {
    const reply = await post('/documents', 'hello');
    expect(reply.status).toBe(400);
  });

  it('answers 404 for an unknown document', async () => {
    const reply = await post('/documents/abcdef/ask', JSON.stringify({ question: 'Anything?' }));
    expect(reply.status).toBe(404);
  });
});
