# Underline: Phase 0 results

> Underline was called **ProofDoc** while it was being built. This file keeps the development history as it happened.

Date: 22 Oct 2026. Machine: Apple M2 MacBook, **8 GB RAM**.
Test set: 3 documents, 32 questions (26 answerable + 6 "not in the document"). See `eval/questions.json`.

- **Health policy:** IFFCO-Tokio Arogya Sanjeevani policy wording (real public PDF, 37 pages)
- **Rent agreement:** Government of Jersey model tenancy agreement (real public PDF, 15 pages)
- **Offer letter:** synthetic, written for this test (5 pages, fictional company and person)

---

## 1. The short version

- **The idea works.** A small 2B model plus the code checker answered **24 of 26** questions correctly, with proof. It said "not found" for **6 of 6** trick questions.
- **The checker works.** It removed almost all bad sentences. **1** wrong sentence slipped through across all runs. I know exactly why (section 5) and it's fixable.
- **Search works.** The right passage was found for **25 of 26** questions.
- **The big problem is the laptop, not the model.** On an 8 GB Mac:
  - The 4B model uses ~8.5 GB, so the Mac swaps and gets slow (16 s before the first word).
  - Running a model *inside the browser* while other apps were open **hung the laptop**. So the WebLLM (browser model) numbers were **not measured**.

---

## 2. Main table (Ollama, default checker settings)

| Model (Ollama) | Correct + verified | Wrong kept (slipped past checker) | Off-topic / junk kept | Not-in-doc refused | Right answers dropped by checker | Time to first word (median) | Tokens/sec (median) | Model load | Search found the answer |
|---|---|---|---|---|---|---|---|---|---|
| **qwen3.5:2b** | **24/26 (92%)** | 1 | 4 | **6/6** | 0 | 4.0 s | 14.0 | 4–13 s (first ever: 23 s) | 25/26 |
| qwen3.5:4b | 25/26 (96%) | 0 | 3 | 5/6 | 0 | 15.8 s ⚠️ swapping | 7.7 | 5–8 s | 25/26 |
| phi4-mini (3.8B) | 21/26 (81%) | 0 | 1 | 6/6 | 2 | 4.8 s | 11.9 | 5 s | 25/26 |
| qwen3:4b | 21/26 (81%) | 0 | 25 ⚠️ | 2/6 | 4 | 6.0 s | 10.1 | 3.6 s | 25/26 |

What the columns mean:
- **Correct + verified:** the answer that *survived the checker* contains the right facts.
- **Wrong kept:** a sentence passed the checker but is false, or its proof doesn't support it. I reviewed every kept sentence by hand (`eval/review.json`).
- **Off-topic / junk kept:** true sentences that don't answer the question, or the model's "thinking out loud" text.
- **Right answers dropped:** the model's raw answer was right, but the checker removed it. Usually the model cited the sentence *next to* the real proof.

Notes per model:
- **qwen3.5:2b:** best balance. Small (3.1 GB), fast enough, precise.
- **qwen3.5:4b:** most accurate, but on 8 GB it uses 8.3–8.7 GB of memory, so the Mac swaps. Fine on a 16 GB machine; too heavy here.
- **phi4-mini:** honest but lazy. Gives half answers ("Rs.5000 per day" without "2% of sum insured") and short ones ("5% [S169]") the checker can't verify.
- **qwen3:4b:** ignores the "don't think" switch in Ollama. It writes its reasoning as the answer ("First, I need to…"), so the output is messy and slow. **Don't use it** (a separate "instruct" version exists, but I didn't download it).

---

## 3. Pass marks from PLAN.md (best model: qwen3.5:2b on Ollama)

| Metric | Pass mark | Result | |
|---|---|---|---|
| Correct and verified | ≥ 80% | 92% | ✅ |
| Wrong sentences that slip past | 0 | 1 (out of 33 kept sentences) | ❌ (fixable, section 5) |
| Not-in-doc questions refused | ≥ 4 of 5 | 6 of 6 | ✅ |
| Time to first word | < 3 s | 4.0 s (Ollama) | ❌ close |
| Speed | ≥ 8 tokens/s | 14 tokens/s | ✅ |
| Model load on repeat visit | < 20 s | 4–13 s | ✅ |
| Indexing a 100-page PDF (browser) | < 30 s | **~24 s** per 100 pages (128-page test PDF: 30.8 s); **ready to ask after 2.6 s** | ✅ |

### Browser numbers (WebGPU, built-in browser on the same Mac)

| What | Result |
|---|---|
| 128-page policy (Universal Sompo wording): ready to ask (keyword search) | **2.6 s** |
| 128-page policy: meaning search done (embeddings) | 30.8 s |
| 37-page health policy: ready / done | 0.3 s / 6–7 s |
| Embedding model load (34 MB, cached) | 1–3 s (first time ~13 s) |
| **WebLLM model (Qwen3.5-2B / 4B): load, first word, tokens/s, accuracy** | **Not measured: the laptop hung** |

Two speed fixes found along the way (both in the code now):
1. On WebGPU the 8-bit embedding model was **20× slower** than half precision (fp16). Now we use fp16.
2. Every batch had a different length, so WebGPU kept recompiling. Padding to fixed lengths made it about **2× faster**.

---

## 4. Checker strictness (can we tune it?)

Required word overlap between the answer and its proof, from loose to strict:

| Model | ≥ 0.3 | ≥ 0.5 (default) | ≥ 0.6 | ≥ 0.7 | ≥ 0.8 |
|---|---|---|---|---|---|
| qwen3.5:2b | 24 ok · 1 wrong · 0 dropped | 24 · 1 · 0 | 24 · 1 · 0 | 23 · 0 · 1 | 22 · 0 · 2 |
| qwen3.5:4b | 25 · 0 · 0 | 25 · 0 · 0 | 25 · 0 · 0 | 24 · 0 · 1 | 23 · 0 · 2 |
| phi4-mini | 21 · 0 · 2 | 21 · 0 · 2 | 21 · 0 · 2 | 20 · 0 · 3 | 19 · 0 · 4 |

Plain English: the threshold barely matters between 0.3 and 0.6. The real safety comes from the **number check** and the **"cited sentence must be one we gave it"** check, not from word overlap.

---

## 5. Things that went wrong (honest list)

1. **The 1 wrong sentence** (qwen3.5:2b, H4). The answer was "You pay 5% co-payment [S326]. *This applies to all claims* [S340]." That's true, but S340 is about claims being paid in Indian currency. The checker can't tell what "This" refers to.
   **Fix for Phase 1:** a sentence that starts with "This / It / They" must share a key word with the sentence before it, or be dropped.
2. **Hernia question (H7) failed for every model.** Search didn't find "12. Hernia of all types" under the heading "24 Months waiting period", because words like "first day" and "covered" pull up other sections. The models correctly said "not stated" instead of guessing.
3. **qwen3.5:4b, overtime question (O9).** It kept "on-call weeks are paid Rs. 4,000" (true), but the checker dropped its other sentence, "overtime is not mentioned". The answer shown could make you think on-call = overtime.
   **Fix for Phase 1:** if the model says "not mentioned" *and* gives a related fact, show it as "Not found. Related: …".
4. **I tuned on the test set.** While building, I fixed a few things the test exposed:
   - British/American spelling ("hospitalisation" vs "hospitalization")
   - using headings like "7 EXCLUSIONS" as context for "not covered" answers
   - the word "may" being read as the month May

   They're general fixes, but the numbers are probably a bit optimistic. Next time, test on **new** documents.
5. **Small test set:** 32 questions on 3 documents. Good for a go/no-go signal, not proof.

---

## 6. GO / NO-GO recommendation

**GO, with one condition.**

- The heart of Underline is proven: *the model proposes, the code verifies, and the proof is highlighted*. A 2B model got 92% right, refused all trick questions, and the checker caught nearly every bad sentence.
- The risky part is **"zero install, runs in the browser on any laptop"**. On an 8 GB Mac, a browser model plus normal apps hung the machine. So for Phase 1:
  1. **Main path: Ollama with qwen3.5:2b** (works today, measured).
  2. **Browser model only on machines with enough memory** (check before offering it). Otherwise use **search-only mode**, which is instant and needs no AI at all.
  3. Measure WebLLM properly on a 16 GB machine, or with every other app closed, before promising "zero install".

If "it must run in the browser on an 8 GB laptop" is a hard rule, then it's **NO-GO** until that's measured and shown to be safe.

---

## 7. Held-out results: new documents the app has never seen (23 Oct 2026)

The numbers above came from 3 documents I also used while building, so they were too kind. This test uses **8 new public documents** and **112 questions written before any model saw them**. Nothing was tuned during this run.

- **Health insurance:** New India Mediclaim (36 p), Star Health FHO (16 p, **two-column**), Digit Supreme Care (99 p), Digit summary sheet (10 p, tables)
- **Rental agreements:** NSW standard form (22 p, two-column from page 7), Victoria RT 1 form (6 p)
- **Indian leave rules:** NIT Trichy (25 p), IIPE (15 p)
- **Questions:** 90 answerable + 22 not in the document. Sources are in `eval/questions-holdout.json`
- **Model:** qwen3.5:2b on Ollama (OpenAI-style API), default checker settings
- **Review:** I checked every kept sentence by hand (`eval/review-holdout.json`)

| | Earlier set (tuned on) | **New documents (held-out)** | Pass mark |
|---|---|---|---|
| Correct + verified | 24/26 (92%) | **67/90 (74%)** | ≥ 80% ❌ |
| Wrong sentences that slipped past the checker | 0 | **6** (of 94 kept) | 0 ❌ |
| Off-topic sentences kept (true, but not the question) | 4 | 6 | – |
| Partial sentences (true, but leave something out) | – | 7 | – |
| "Not in document" questions refused | 6/6 | **22/22** ✅ | ≥ 80% |
| Search found the right passage | 25/26 | 87/90 | – |
| Time to first word (median) | 4.0 s | 4.6 s | < 3 s ❌ |
| Speed | 14 tokens/s | 12.7 tokens/s | ≥ 8 ✅ |
| Indexing (Node, CPU) | – | 99-page PDF: 33 s | – |

### What the 6 wrong sentences look like

1. **Right number, wrong thing (3 cases).** This is the main weakness.
   - "File a reimbursement claim within **15 days**…": the 15 days in the proof is the notice to *cancel the policy*.
   - "Pre-existing disease waiting period is **30 days**": 30 days is a *different* waiting period; this policy sets it in the schedule.
   - "Shortest child care leave is **180 days**": 180 days is *adoption* leave; the answer is 5 days.

   The number check passes because the number really is in the cited text, just attached to something else.
2. **Opposite meaning (1 case).** "Spectacles and hearing aids **are covered**." They're in the *exclusions* list (a two-column table), and the checker only guards against a wrong "not", not a wrong "covered".
3. **Made-up inference (1 case).** "…which implies restrictions on unauthorized use." That's not in the document, but the words overlapped enough.
4. **False "not stated" (1 case).** "No limit is stated for Leave Not Due." The document says 360 days.

### Why the other answerable questions failed (23)

| Cause | Count | Example |
|---|---|---|
| Answer kept but incomplete or wrong | 8 | Cataract: said "max Rs. 50,000", left out "20% of sum insured" |
| Right answer dropped by the checker | 8 | Mostly the model cited the sentence *next to* the proof. One was actually wrong ("48 months or 30 days, whichever is longer") and was rightly dropped |
| Model said "not found" though the answer was there | 5 | New India room rent 1%: the table row was scrambled in the extracted text |
| Search missed the passage | 2 | "Hernia of all types" inside a long list again; an IIPE leave rule |

### Other findings

- **Memory grows over a long session.** On this 8 GB Mac, Ollama's MLX engine started the 2B model at ~3 GB and grew to **7.9 GB** over the 112 questions (11 GB of swap used). The laptop got slow but didn't hang.
- **Two-column PDFs** (Star, NSW) mix the columns line by line. That causes some wrong proofs, the scrambled table rows, and a garbled "at least 60 days" → "not more than 60 days".

### Honest conclusion

On new documents, Underline is **not yet safe enough to ship**. It still never invents an answer to a "not in the document" question (22/22), and most answers are right with real proof. But **6 wrong sentences got through**, and the main hole is clear: the checker checks that a number *exists* in the proof, not that it *belongs to the thing being asked about*.

### Proposed fixes (not done yet; measure again after)

1. **Number anchoring:** a number in the answer must sit near (≈8 words) the answer's main words, and the question's main word, in the proof. Targets the 3 "right number, wrong thing" cases.
2. **Exclusion context:** if the proof is under an "Exclusions" heading or list, an answer saying "covered" is dropped. Targets the "opposite meaning" case.
3. **"Not stated" claims:** treat "no limit is stated…" as a refusal (never shown as a fact). Targets the false "not stated" case.
4. **Two-column reading:** detect the gutter and read the left column, then the right. Should fix scrambled rows and wrong proofs.
5. **Memory:** use the GGUF (llama.cpp) build of the same model (1.3 GB), unload when idle; check RAM stays ~2–3 GB.
6. **Not-found UX:** show the 3 closest lines with Page buttons, so a too-cautious "not found" still helps.

After the fixes: re-run this set *and* add 2–3 more fresh documents, since this set is no longer fully "unseen" once fixes are designed from it.


## 8. After the fixes (23 Oct 2026, same 112 held-out questions + old 32)

Fixes applied:
- number must belong to the question's subject
- no "covered" claims from exclusions
- "not stated" counts as a refusal
- "do so" back-references checked
- repeated sentences shown once
- two-column reading
- GGUF model on Ollama's llama.cpp engine (2B: 7.9 GB → 1.6 GB memory)
- closest lines shown when nothing is found

Every kept sentence was reviewed by hand (`eval/review*.json`).

| Setup | New docs correct | New docs wrong kept | Refused (22) | Old set correct | First word | Speed |
|---|---|---|---|---|---|---|
| 2B, before fixes (sec. 7) | 67/90 (74%) | 6 | 22 | 24/26 | 4.6 s | 13/s |
| 2B GGUF, after fixes | 68/90 (76%) | 6 | 21 | 21/26 | 3.7 s | 15/s |
| 2B GGUF + meaning check (0.5) | 59/90 (66%) | 2 | 22 | 20/26 | +20 ms | |
| **4B GGUF, after fixes** | **71/90 (79%)** | **4** | **22** | **24/26** | **9.3 s** | **7.6/s** |
| 4B GGUF + meaning check (0.5) | 63/90 (70%) | 2 | 22 | 22/26 | +20 ms | |
| 4B GGUF + meaning check (0.6) | 61/90 (68%) | 1 | 22 | 22/26 | +20 ms | |
| **Gemma 4 E2B (QAT, GGUF)** | **73/90 (81%)** | **3** | 20 | 23/26 | **3.4 s** | **23.5/s** |
| Gemma 4 E2B + meaning check (0.5) | 67/90 (74%) | 2 | 20 | 20/26 | +20 ms | |
| Granite 4.2 3B (GGUF) | 68/90 (76%) | 7 | 21 | 23/26 | 5.5 s | 11.8/s |
| **Gemma 4 E4B (QAT, GGUF)** | **72/90 (80%)** | **1** | 19 | 24/26 | 9.8 s | 10.7/s |

**Gemma 4 E2B** (Apache 2.0, 3.6 GB download, ~2.2 GB memory):
- Most right answers, fewest wrong sentences, fastest of all (3× the Qwen 4B's speed), less memory than the Qwen 4B.
- It tends to quote the document almost word for word.
- 2 of its 3 wrong sentences come from the Victoria form's tangled two-column layout; the third used the half-pay-leave clause for an earned-leave question.
- On 2 of the 22 trick questions it showed related true lines instead of saying "not found".
- It is now the app's recommended model.

**Gemma 4 E4B** (Apache 2.0, 5.2 GB download, ~3.5 GB memory):
- The first setup to meet the pass mark: 1 wrong sentence, 80% right.
- Its one wrong sentence is a PDF line-break problem ("Rs. 3,500 for every claim / free year" read as "per claim"). E2B gets the same line wrong too.
- It is slow: a full answer takes 14 s (median) vs 5.3 s for E2B. Loading it takes 13–28 s.
- On the 8 GB Mac, 13–19% of memory stayed free while it ran. It works, but leaves little room for other apps.
- It refused 19 of 22 trick questions (E2B: 20). It showed related true lines on "car damage", "cashback" and "loyalty discount" instead of "not found".

**Granite 4.2 3B:** worse than Gemma E2B on every measure (7 wrong, 32 off-topic lines, half the speed). Deleted.

**Meaning check:**
- What it is: a small local entailment model (NLI DeBERTa-v3-xsmall, 87 MB, ~20 ms per sentence) asks "does the proof really say this?".
- The cut-off was chosen on the old set before judging on the new one.
- The bigger 244 MB variant separated right from wrong *worse*, so it was dropped.

**Pass mark set in advance:** ≤ 1 wrong and ≥ 75% correct on the new documents, on an 8 GB Mac.
**Result:** met only by Gemma 4 E4B (1 wrong, 80%), at about 2.6× the answer time of E2B. Among the other setups, the safest settings keep wrong answers at 1–2, but lose too many right ones. The Qwen 4B (79%) still lets 4 wrong sentences through and is 2.5× slower.

**Memory:**
- 4B GGUF uses 3.2 GB.
- Indexing 8 documents while the 4B loaded briefly left 4% free on the 8 GB Mac.
- The real app never indexes and answers at the same moment, but this is the limit.

What the remaining wrong sentences look like (all of them):
- **right number, wrong thing:** "one month" waiting vs 90 days; "36 months" specific vs pre-existing; "48 hours" buyer viewings vs inspections; "30/45 days" settlement vs filing
- **mixed clauses:** "health concern" + "7 days"
- **invented subject:** "damage to your car"

The real fix is not more rules. Word, number and entailment checks cannot reliably tell *which clause a number belongs to* when two clauses look alike.

## 9. Better PDF reading (23 Oct 2026, same questions)

Three of the four wrong sentences left in section 8 came from reading the PDF badly, not from the model. Fixed in `src/pdf/`:
- **Wide pages with 3–4 columns** (the Victoria form) are split column by column, and pages that don't start at x = 0 are handled.
- **Clause numbers in a table's side column** ("2(L)") no longer cut a sentence in two.
- **Tables with drawn borders** are read cell by cell (`table-cells.js`), so a wrapped cell is not mixed line by line with the cell next to it. Lines that run through words (logo or watermark strokes) are ignored, and a table needs at least two rows that line up.
- **Tables are not mistaken for text columns** (short cells, or rows that line up, keep a row together).

Every change was checked on all 11 test documents by comparing every sentence before and after.

| Gemma 4 E2B | New docs correct | New docs wrong kept | Refused (22) | Old set correct | Old set wrong | First word | Speed |
|---|---|---|---|---|---|---|---|
| Before the reading fixes (sec. 8) | 73/90 (81%) | 3 | 20 | 23/26 | 0 | 3.4 s | 23.5/s |
| **After the reading fixes** | **76/90 (84%)** | **2** | 19 | **23/26** | **0** | 4.0 s | 19.2/s |

The 2 wrong sentences left are model mistakes: the hernia waiting period was read from the wrong heading of a list, and a half-pay-leave rate was given for an earned-leave question. Gemma 4 E4B was not re-run: it was about as accurate as E2B but 3× slower and used 1.3 GB more memory, so E2B is the model the app recommends.

## How to re-run

```
export PATH=/usr/local/bin:$PATH
npm test                                               # unit tests
node eval/run-eval.js --provider local --model hf.co/unsloth/gemma-4-E2B-it-qat-GGUF:UD-Q4_K_XL
node eval/summarize.js                                  # tables above
node eval/run-eval.js --provider local --model hf.co/unsloth/gemma-4-E2B-it-qat-GGUF:UD-Q4_K_XL --questions eval/questions-holdout.json   # held-out set
node eval/summarize.js --questions eval/questions-holdout.json
npm run dev                                             # test page at http://localhost:5173
```

⚠️ On this 8 GB Mac: run one model at a time, and don't run Ollama and a browser model together.
