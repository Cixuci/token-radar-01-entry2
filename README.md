# token-radar-01-entry2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Cixuci/token-radar-01-entry2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Cixuci/token-radar-01-entry2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: 226 pre-token, non-wrapped protocols ranked by calibrated implied value, with a detail view and a concrete farm plan for every protocol. The multiple behind each value is calibrated from the launched protocols in the same category, so a lending protocol is not priced like a bridge.

## Run it

```sh
node main.ts --input /input/snapshot.json --output /output
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=hz26y7g0&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

## How it works

`main.ts` reads the sealed snapshot (`/input/snapshot.json`), scores every
rankable pre-token protocol with the calibrated model in `lib/model.ts`, and
writes `/output/board.json`, `/output/data.js`, the static `dashboard/` and
`/output/dossier.json`. The dashboard is a static page with no network calls:
it reads `data.js` and renders the ranked board, a live-token view, the
calibration table, and a detail view for every protocol.

Implied value = TVL × category multiple × growth multiplier × maturity
multiplier. The category multiple is the median market-cap / TVL of the
launched protocols in that category, each ratio capped at 2.50 before the
median so one extreme token cannot set a category, then shrunk toward the
global median with weight 9 and clamped to 0.02…2.50. The growth multiplier
clamps the seven-day TVL change to −60%…+120% and weights it by 0.5. The
maturity multiplier runs from 0.6 to 1.0 over 1,095 days, with an unknown age
counted as 365 days. No protocol name is special-cased.

Wrapped, staked and bridged products of a token that trades are excluded from
the ranked board: they are not separate launches. The 40 watchlist protocols
are all covered, plus 186 rankable protocols below the $50,000,000 floor.

Running locally: `--input` takes a snapshot file or a directory holding
`snapshot.json`, and `--output` (or `MAKEFUN_OUTPUT_DIR`) takes the output
directory. The run is deterministic: the same snapshot always yields the same
board, byte for byte.
