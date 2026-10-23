## Main table (default strictness)

| Provider / model | Correct + verified | Wrong kept (slipped past verify) | Off-topic / junk kept | Not-in-doc refused | Right answers dropped by verify | Time to first token (median) | Tokens/sec (median) | Model load (cold / warm) | Retrieval had the answer |
|---|---|---|---|---|---|---|---|---|---|
| local / hf.co/unsloth/gemma-4-E2B-it-qat-GGUF:UD-Q4_K_XL | 76/90 (84%) | 2 | 19 | 19/22 | 6 | 4.0 s | 19.2 | 7.2 s | 88/90 |

## Strictness sweep (answerable questions: correct · wrong kept · right answers dropped)

| Model | overlap ≥ 0.3 | overlap ≥ 0.4 | overlap ≥ 0.5 | overlap ≥ 0.6 | overlap ≥ 0.7 | overlap ≥ 0.8 |
|---|---|---|---|---|---|---|
| hf.co/unsloth/gemma-4-E2B-it-qat-GGUF:UD-Q4_K_XL | 76 ok · 3 wrong · 6 dropped | 76 ok · 2 wrong · 6 dropped | 76 ok · 2 wrong · 6 dropped | 76 ok · 2 wrong · 6 dropped | 76 ok · 2 wrong · 6 dropped | 75 ok · 2 wrong · 7 dropped |
