# LBender experimental strategy

This directory contains a new, separately implemented strategy prototype. It is
registered as `--agent lbender` and does not import the legacy `src/brain`,
`src/memory`, or `src/sim` modules.

## Design

- **Dictionary completion value:** scans the official game dictionary for words
  one to three tiles away from the current rack. A missing letter is valued by
  the best immediate completion plus discounted two- and three-tile options.
- **Budget pacing:** converts the current balance into a rough per-win budget
  based on auctions remaining and table size.
- **Auction behavior:** caps bids by balance and a per-auction budget; shades
  bids in first-price auctions.
- **Word timing:** preserves short playable words in ordinary rounds, releases
  longer words when the rack can form a 7+ letter word, and cashes out near the
  end or when low on coins.

## Deliberate limitations

This is a first heuristic baseline, not a tournament-proven replacement for
the legacy strategy. It does not yet learn individual opponents, estimate
uncertainty, simulate full matches, or optimize parameters from paired trials.
The dictionary scan is synchronous and must be profiled against the live
auction deadline before deployment. The current valuation coefficients are
hand-selected and require empirical tuning.

## Run

```sh
npm run typecheck
npm run test:lbender
npm run bot:lbender -- --dry-run
```

The repository's default bot remains unchanged. The root README and
`THIRD_PARTY_NOTICES.md` continue to describe the legacy implementation and
its provenance. This prototype is not a rewrite of that legacy codebase.
