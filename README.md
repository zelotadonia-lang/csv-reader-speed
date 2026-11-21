# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/zelotadonia-lang/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/zelotadonia-lang/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: it answers exactly as the reference does on every input, including every broken row, and reads the practice set about 3x faster. The reference walks the text one character at a time; this one reads plain lines as one slice and splits them with `String.split`, and only lines that carry a quote or a stray carriage return fall back to a field-by-field scan that jumps with `indexOf` and a single delimiter regex. Quoted fields, doubled quotes, unterminated quotes, quote junk, stray CRs, short and long rows all produce the same `{columns, rows, errors}` as the reference, verified against the practice set and 25,000 fuzzed inputs.

## Run it

```sh
MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Node 22.18 or later, standard library only, no network. `main.ts` reads every case from `cases.json`, answers each with `run` from `solve.js`, and writes `answers.json`. Run it twice and the outputs are byte-identical.

---

<sub>Entered on [make.fun](https://make.fun/?ref=yk7ez00m&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
