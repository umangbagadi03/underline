# `rag/`: the Underline engine

A retrieval-augmented generation pipeline built for one job: **answer questions about a PDF without making things up.** The LLM is small and local; the guarantees come from the stages around it.

```
ingest/  ──►  retrieval/  ──►  generation/  ──►  verification/
PDF → sentences   hybrid search    grounded answer     claim-by-claim check
with positions    BM25 + vectors   citing [S#] ids     drop what the proof doesn't support
```

`pipeline.js` wires the four stages together in two calls: `indexPdf(pdf)` and `answerQuestion(index, question, embedder, llm)`.

---

## 1. Ingest: `ingest/`

RAG quality is capped by parsing quality. Most "hallucinations" we measured on real policy documents were really **bad text extraction**: two columns glued together, table cells mixed line by line, a clause number cutting a sentence in half.

| File | What it does |
|---|---|
| `read-pdf.js` | Text pieces with their positions (pdf.js) → lines. Finds columns recursively (up to 4 per page) and handles pages whose crop box doesn't start at x = 0 |
| `columns.js` | Finds the empty strip between columns, places the cut where it slices the fewest words, and refuses to split tables (short cells, or rows that line up) |
| `table-cells.js` | Reads **ruled tables cell by cell** from the drawn border lines (pdf.js operator list → line segments → closed cells). Ignores strokes that cross text, such as logos and watermarks |
| `clean-lines.js` | Removes repeating headers and footers |
| `sentences.js` | Numbered sentences `S1…Sn`, each with its page, highlight boxes, list lead-in and section headings as context |

## 2. Retrieval: `retrieval/`

| File | What it does |
|---|---|
| `chunks.js` | Non-overlapping chunks of ~70 words (max 6 sentences). A list item carries its lead-in sentence |
| `keyword.js` | BM25-style keyword index (MiniSearch) over stemmed words |
| `embed.js` | Dense vectors with **bge-small-en-v1.5** (ONNX via transformers.js). fp16 on WebGPU, int8 on CPU, fixed padding shapes for speed, CLS pooling + L2 norm |
| `retrieve.js` | **Hybrid search**: keyword and vector rankings fused with **Reciprocal Rank Fusion** (k = 60) → top 6 chunks → their sentences in document order |

The keyword index is ready in about 1–2 s (2 s for a 99-page policy on CPU); vectors are added in the background, so you can ask right away.

## 3. Generation: `generation/`

| File | What it does |
|---|---|
| `prompt.js` | The model sees only the retrieved sentences, each tagged `[S#]`. Every claim must cite its `[S#]`; if the answer isn't there it must reply `NOT FOUND` |
| `providers/local-server.js` | Streaming client for any **OpenAI-compatible** local server (Ollama, llama.cpp `llama-server`). Temperature 0, 300 tokens max, "thinking" turned off |
| `engine-setup.js` | Finds a local engine and pulls the recommended model (Gemma 4 E2B, 4-bit QAT GGUF, ~2.2 GB RAM) |

## 4. Verification: `verification/`, the hallucination guard

The answer is split into claims. Each claim is checked **against the sentences it cites**, and only claims that pass are shown.

| Check | Catches |
|---|---|
| citation exists and was supplied | invented or out-of-context sources |
| numbers match (incl. "thirty" = 30, lakh, years ↔ months) | wrong amounts, limits, periods |
| months match | wrong dates |
| key-word overlap ≥ 0.5 | claims about something the proof doesn't mention |
| negation | "is covered" vs proof "is not covered" |
| exclusion conflict (`coverage.js`) | "covered" claims backed by an exclusions list |
| number ↔ subject anchoring (`anchor.js`) | the right number from the wrong clause ("15 days" from the cancellation clause used for a claim deadline) |
| "this / it / do so" links | a pronoun pointing at a different topic |
| "not stated" phrasing | turns hedged non-answers into an honest *not found* |

`meaning.js` is an experimental NLI cross-encoder check (DeBERTa-v3-xsmall). It cut wrong claims further but dropped too many right ones, so it isn't switched on. The numbers are in [docs/RESULTS.md](../docs/RESULTS.md).

## Results

On 8 unseen documents (112 questions, 22 of them unanswerable), with Gemma 4 E2B on an 8 GB laptop:

- **84%** answered correctly with proof
- **2** unsupported sentences got past the checker (out of ~110)
- **19 / 22** unanswerable questions correctly refused

Every kept sentence is hand-labelled in `eval/review*.json`, so any change to this folder can be re-scored without re-running the model (`eval/reverify.js`).
