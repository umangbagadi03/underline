# Underline: Plan

> Underline was called **ProofDoc** while it was being built. This file keeps the development history as it happened.

> **Ask your documents. See the proof.**
> Offline document Q&A where every answer is checked by code and the exact lines are highlighted in the original PDF.

---

## 1. The idea in one picture

```
Drop PDF (insurance policy, rent agreement, offer letter…)
   ↓
Ask: "Is cataract surgery covered?"
   ↓
Answer: "Yes, after a 2-year waiting period [S41]."
   ↓  click [S41]
PDF opens on page 14 with those exact lines highlighted 🟨
   ↓
Not in the document? → "I couldn't find this in your document."
```

**Three promises:**
1. **Proof:** every answer sentence links to the exact lines in the original PDF.
2. **No made-up answers:** code checks each sentence against the document. Unchecked sentences are removed.
3. **Private:** runs locally. The file never leaves the device.

**Why it's different from AnythingLLM / GPT4All:** they need setup (models, settings, workspaces) and show weak citations. Underline needs zero setup, highlights proof in the original PDF, and **code** (not the model) decides what's verified. That's the same idea as IncidentPilot: *the LLM proposes, the code verifies.*

---

## 2. How it works

```
1. READ      pdf.js → text of every line + its position on the page
2. SPLIT     into numbered sentences [S1] [S2] … (each knows its page + box)
3. SEARCH    keyword search (minisearch) + meaning search (embeddings)
             → best 6–8 small passages
4. ANSWER    model gets ONLY those passages, must tag each sentence: "… [S41]"
5. VERIFY    code checks each answer sentence against its cited sentences:
               - cited IDs exist and were in the passages given
               - every number / date / amount / % in the sentence appears in the cited text
               - most key words appear in the cited text
             ✅ pass → keep   ⚠️ fail → drop or mark   ❌ none pass → "not found"
6. SHOW      answer + [S41] links → click → page + yellow highlight
```

**Why sentence IDs instead of exact quotes:** small models are bad at copying text exactly but good at pointing to `[S41]`. Code does the checking.

**Search-only mode:** if no model is available, show the best matching passages, highlighted. Nobody is ever blocked.

---

## 3. Model "providers" (plug-in style)

The engine is the same. Only the "writer" changes:

| Provider | Where it runs | Notes |
|---|---|---|
| **WebLLM** | Inside the browser (WebGPU) | Zero install. Candidates: Qwen3.5-2B, Qwen3.5-4B, Qwen3-4B, Phi-4-mini |
| **Ollama** | Local app on the computer (`localhost:11434`) | Faster, bigger models possible (Qwen3 4B/8B etc.). Later can be bundled into a desktop app. |
| **None** | – | Search-only mode |
| *(Later, optional)* Cloud | API | Only if local quality fails. Not in Phase 0 scoring except as a reference baseline. |

Licence-safe model families to prefer: **Qwen (Apache 2.0)**, **Phi-4-mini (MIT)**. Avoid Llama/Gemma for the product (extra licence conditions).

---

## 4. Phase 0: Prove it works (3–4 days) → GO / NO-GO

**Goal:** real numbers, not opinions.

### Test set
- **3 public documents** (no personal data):
  1. A real **health insurance policy wording** PDF (insurers publish these on their websites)
  2. A **rent agreement** (public model tenancy agreement template)
  3. An **offer letter / HR policy** (synthetic, written for the test)
- **20+ questions** with the expected answer and page:
  - 15 answerable (mix of numbers, conditions, yes/no, "what is the waiting period…")
  - **5 "not in the document" questions**: the correct behaviour is to say "not found"

### What to measure (per provider + model)
| Metric | Pass mark |
|---|---|
| Correct **and** verified answers | **≥ 80%** |
| Wrong sentences that slip past verification | **0** |
| "Not in document" questions correctly refused | **≥ 4 of 5** |
| Time to first word (browser) | **< 3 sec** |
| Speed | **≥ 8 tokens/sec** |
| Model load on repeat visit (browser) | **< 20 sec** |
| Indexing a 100-page PDF | **< 30 sec** |

### Deliverable
- `eval/` folder: questions file, runner, results table per model
- `RESULTS.md`: numbers + plain-English conclusion
- **Stop and let the user decide GO / NO-GO**

---

## 5. Phase 1: First real version (2–3 weeks, only after GO)

- Drop PDF → ask → verified answer → click to see highlighted proof
- Automatic model choice by device (WebGPU check + memory) and search-only fallback
- Ollama auto-detect: if Ollama is running, offer to use it
- Documents and indexes saved on the device (IndexedDB)
- Works offline (PWA)
- Clean, simple UI for non-technical people (dark + light)
- Privacy: zero third-party scripts, CSP header, no analytics on the app page

## 6. Phase 2: Launch (1–2 weeks)

- Landing page + 30-second demo video ("ask my insurance policy")
- "Check our privacy yourself" section (airplane-mode test)
- Launch: r/LocalLLaMA, r/developersIndia, r/SideProject, Product Hunt, LinkedIn

## 7. Phase 3: Later

- **Desktop app** (Tauri) with a bundled local model runtime, for true one-click install + offline
- Scanned PDFs (OCR), Hindi questions, DOCX
- Multiple documents, compare two documents
- Hide Aadhaar/PAN numbers in answers
- Pro (₹299–499 one-time / $9): multi-document, compare, export answers with proof

---

## 8. Tech stack

| Part | Tool |
|---|---|
| Build | Vite |
| Language | Plain JavaScript, simple functions (no classes), JSDoc where helpful |
| PDF text + positions + rendering | `pdfjs-dist` |
| Keyword search | `minisearch` |
| Embeddings | `@huggingface/transformers` (small embedding model, e.g. bge-small / multilingual-e5-small) |
| Browser LLM | `@mlc-ai/web-llm` |
| Local LLM server | Ollama HTTP API |
| Storage | IndexedDB |
| Tests | Vitest (logic), Playwright (later) |
| Hosting (later) | Cloudflare Pages: ₹0 |

Check current versions with `npm view` before installing. The default Node 18 on this Mac is too old; use Node 24 (`export PATH=/usr/local/bin:$PATH`).

---

## 9. Folder structure (Phase 0)

```
proofdoc/
├── PLAN.md
├── RESULTS.md              ← Phase 0 numbers + conclusion
├── src/
│   ├── pdf/read-pdf.js     ← text + positions per line
│   ├── pdf/sentences.js    ← split into [S1]… with page + box
│   ├── search/keyword.js
│   ├── search/embed.js
│   ├── search/retrieve.js  ← combine both, pick top passages
│   ├── answer/prompt.js    ← the instructions sent to the model
│   ├── answer/providers/   ← webllm.js, ollama.js
│   ├── verify/verify.js    ← the code checker (the heart)
│   └── ui/                 ← simple test page + highlight viewer
├── eval/
│   ├── docs/               ← the 3 public test PDFs
│   ├── questions.json      ← questions + expected answers + pages
│   └── run-eval.js         ← runs all questions, writes a results table
└── tests/                  ← unit tests (verify.js first!)
```

---

## 10. Risks

| Risk | Plan |
|---|---|
| Small models answer badly | Verification drops bad sentences; try bigger models via Ollama; search-only fallback |
| Context is small (~4k tokens in WebLLM) | Send only the best 6–8 passages |
| Slow on weak laptops | Smaller model, or search-only |
| Big first download (1–3 GB) | Clear progress; once only; AI is opt-in |
| Verification too strict (good answers dropped) | Tune on the test set; measure both "wrong kept" and "right dropped" |
| Competitors | The edge is proof + verification + zero setup, done really well |

---

## 11. Code style (for the user)

- Small files, one job each
- Plain named functions, no classes
- No long dot-chains: break them into named steps
- Short comments in simple English
