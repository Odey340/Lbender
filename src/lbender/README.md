# LBender experimental strategy

This directory contains a separately implemented strategy prototype. It is
registered as `--agent lbender` and does not import the legacy
`src/brain`, `src/memory`, or `src/sim` strategy modules.

## Current design

- **Indexed rack valuation:** queries the shared anagram-trie word engine for
  marginal best-word reward and a small flexibility bonus for each possible
  incoming letter. This avoids scanning the entire dictionary on every bid.
- **Budget pacing:** prices coins against expected future opportunities and
  lets coin value fall near the end, when unspent balance has little value.
- **Market-aware auctions:** uses public clearing-price history as a market
  signal. Vickrey prices are treated as runner-up thresholds, not mistaken for
  winners' private bids. First-price bidding shades toward observed market
  prices while staying below estimated private value.
- **Refinement:** searches a bounded set of integer bids against observed
  market samples. The quick bid is sent first; refinement is capped to a small
  slice of the optional think budget.
- **Active word play:** considers high-reward words of five or more letters
  throughout the match, with shorter words available when cash, rack space,
  score position, or endgame timing make playing now more valuable.
- **Endgame:** uses the existing exact rack partition engine with a short time
  budget to cash out playable words.

## Offline evaluation

The simulator accepts `lbender` as a seat:

```sh
npm run typecheck
npm test
npm run sim -- --games 500 --swap --table "lbender,starter,sim:Cheapskate,sim:ValueBidder,sim:Aggressive,sim:ValueBidder"
npm run sim -- --games 500 --swap --first-price --table "lbender,starter,sim:Cheapskate,sim:ValueBidder,sim:Aggressive,sim:ValueBidder"
```

Compare LBender against the same opponents and seeds before/after any tuning.
Track win rate, mean score/place, coins remaining, tiles remaining, words
played, rejections, exceptions, and decision latency. Use paired `--swap`
runs and more than one seed; one match is not evidence of an improvement.

## Limitations

This is a heuristic baseline, not a proven top-performing strategy. The
market estimator uses public outcomes and has limited samples early in a
match; Vickrey clearing prices do not reveal the winning bid. Its empirical
bid search is intentionally simple and does not reconstruct hidden private
opponent bids. The hand-selected coefficients require benchmark-driven tuning.
Live latency and the live server's exact tie behavior should be checked before
competitive deployment.

The repository's legacy Palace/Damo strategy and its K-13 provenance remain
separate and are documented in the root README and `THIRD_PARTY_NOTICES.md`.
