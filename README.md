# Damo

A ScrabbleBot bot. **Damo is K-13 with one change.**

K-13 ([aryamehr2k/k13-scrabblebot](https://github.com/aryamehr2k/k13-scrabblebot), commit `28a9da8`) won ScrabbleBot tournament #1. Damo is that bot copied whole: the same models of each rival's bidding, simulator, bid search and tuned parameters. In the simulator it makes exactly the same decisions on the same deals. The one change is an endgame safety net: if the data feed freezes near the end of a match, Damo cashes in its tiles instead of losing them.

K-13's full README, with its architecture and evidence, is in [docs/K13-README.md](docs/K13-README.md). The strategy notes are in [src/brain/README.md](src/brain/README.md).

## The weakness

K-13 holds tiles for 7-letter words (3x multiplier) and cashes most of them in during the final 1-second auction. Words only count while the match is running. If the feed freezes near the end, everything still in hand scores nothing. This has already happened live; K-13's own code records it (`src/live/watchdog.ts`): *"scored 0 with 10 tiles in hand"*. K-13's stall detector only reconnects after **6 s** of silence, so a freeze in the last ~7 auctions can't be recovered.

How much rides on the end, measured by `scripts/measure-endgame.ts` (sampling at live levels):

| Field | Damo's score | Points scored in the final auction | In the last 4 auctions | Wins lost if a freeze covers the last 4 |
|---|---|---|---|---|
| 5 copies of itself (strong field, ladder-like scores) | 81.8 | 21.1 (26%) | 25.3 (31%) | 3 of 3 |
| Clones of LUCENT, Bron, maverick, Lionel, james (Oct 25 data) | 200.3 | 23.1 (12%) | 27.4 (14%) | 4 of 40 |

## The change: endgame blind dump

`src/live/blinddump.ts`, wired into `src/live/session.ts` and `src/live/words.ts`.

During a match an auction opens or closes every second, so 2 seconds with no feed updates is already a stall. If that happens while the bag is down to **8 tiles or fewer**, Damo immediately plays the best set of words it can make from the tiles it knows it holds. While the feed is frozen the cached bag count stops moving too, so the bag is estimated from how many seconds have gone silent.

- **Safe to send:** words are legal at any point in a match, and the cached rack only lags behind (it never shows tiles Damo doesn't have), so every word can still be spelled. Letters in words still waiting for the server's reply are left out, and the cash-in doesn't wait on those replies, which a frozen feed may never deliver. If the match has already ended, the server refuses the words and nothing is lost.
- **No cost on a healthy connection:** the check never fires, and every decision is K-13's. Same seed, same deals: K-13 and Damo produce identical results.
- **Cost of a false alarm**, when the feed hiccups but the match carries on. `scripts/measure-blind-dump.ts` forces one early cash-in, paired by deal:

| Field | Cash-in at bag 10 | Cash-in at bag 4 |
|---|---|---|
| Strong field (30 deals) | −6.1 ±3.2 pts | −2.4 ±1.6 pts |
| Leader clones (60 deals) | −9.4 ±3.0 pts | −3.3 ±1.8 pts |

  The emergency cash-in starts at 8 tiles, between those two. A false alarm costs roughly a quarter of what a real freeze costs (21–27 points, usually the match). The 8-tile threshold covers every freeze the 6 s reconnect can't recover from.
- Settings: `DAMO_BLIND_DUMP=0` turns it off. `DAMO_BLIND_DUMP_MS` (default 2 auction lengths, at least 1.8 s) and `DAMO_BLIND_DUMP_BAG` (default 8) tune it. Every firing is logged as a `blind_dump` record and a warning line.

What can't be tested offline: how often real freezes and false alarms happen. Check `grep blind_dump logs/*.jsonl` after a few hundred live matches.

## Run it (on your machine)

Requires Node 22.5+.

```bash
npm ci
npm test                       # 164 offline tests

# 1. Build the opponent history (required: without it Damo bids against a generic
#    market guess instead of a model of each rival). Re-run before tournaments.
npm run mine -- --no-backend

# 2. Get a token for your bot on the ScrabbleBot site (/team -> Generate token), then:
BOT_NAME=damo BOT_TOKEN=<token> npm run bot     # token is saved to .token-damo
npm run bot                                     # later runs
npm run bot -- --dry-run                        # watch a live match without playing
DAMO_NO_LADDER=1 npm run bot                    # tournaments only (stays off the ladder)
npm run status                                  # rating, recent matches, misses
```

The bot registers itself for any tournament that opens (`DAMO_AUTO_TOURNAMENT=0` turns that off). The optional backend, systemd units (`deploy/damo-*.service`) and the tmux runner (`scripts/damo.sh`) work as described in the K-13 README. Every `K13_*` environment variable is now `DAMO_*`.

## What was renamed

The bot name, log tags and messages, environment variables, deploy units, the tmux script and the package name. In the clone-calibration code, the bot excluded as "itself" is now Damo, so the real K-13 is modeled as a rival. The optional backend keeps its internal `k13` database and table names, because its generated bindings depend on them.

## Credit and license

The strategy, simulator, models and nearly all the code are K-13's, by aryamehr2k. The K-13 repository has **no license** for its own code, which by default means all rights reserved. Ask the author for permission before running Damo publicly or entering it in a tournament. The game, its module and the starter strategy are by Clockwork Labs, under the MIT License; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
