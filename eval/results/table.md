## Main table (default strictness)

| Provider / model | Correct + verified | Wrong kept (slipped past verify) | Off-topic / junk kept | Not-in-doc refused | Right answers dropped by verify | Time to first token (median) | Tokens/sec (median) | Model load (cold / warm) | Retrieval had the answer |
|---|---|---|---|---|---|---|---|---|---|
| local / hf.co/unsloth/gemma-4-E2B-it-qat-GGUF:UD-Q4_K_XL | 23/26 (88%) | 0 | 1 | 6/6 | 2 | 4.0 s | 19.5 | 6.9 s | 25/26 |

## Strictness sweep (answerable questions: correct · wrong kept · right answers dropped)

| Model | overlap ≥ 0.3 | overlap ≥ 0.4 | overlap ≥ 0.5 | overlap ≥ 0.6 | overlap ≥ 0.7 | overlap ≥ 0.8 |
|---|---|---|---|---|---|---|
| hf.co/unsloth/gemma-4-E2B-it-qat-GGUF:UD-Q4_K_XL | 23 ok · 0 wrong · 2 dropped | 23 ok · 0 wrong · 2 dropped | 23 ok · 0 wrong · 2 dropped | 22 ok · 0 wrong · 3 dropped | 22 ok · 0 wrong · 3 dropped | 21 ok · 0 wrong · 4 dropped |
