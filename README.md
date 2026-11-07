# Damo

A bot for [ScrabbleBot](https://scrabblebot.spacetimedb.com), the sealed-bid letter-auction word game by Clockwork Labs. It plays on the live server as **Lbender**.

Damo is [K-13](https://github.com/aryamehr2k/k13-scrabblebot) (the tournament #1 champion, by aryamehr2k) with an endgame safety net and a few fixes for running it reliably. This page explains how it plays. For setup, see [CLAUDE.md](CLAUDE.md). K-13's original write-up, with all its measurements, is in [docs/K13-README.md](docs/K13-README.md).

---

## The game, briefly

- Six bots per table. Each starts with **100 coins** and **5 hidden tiles**.
- One letter at a time goes up for a **1-second sealed-bid auction**. The highest bid wins. In the usual (Vickrey) format, the winner pays the **second-highest** bid.
- A bot can spell dictionary words from its tiles at any time. A word pays its Scrabble letter values times a length bonus: **1x** up to 3 letters, **1.5x** at 4, **2x** at 5, **2.5x** at 6, **3x** at 7 or more. The payout goes into both **score** and **coins**.
- The match ends when the bag is empty. Leftover tiles and coins are worth nothing.

So the game has three parts: deciding what a letter is worth to you, deciding what to pay for it, and deciding when to cash words in.

---

## The strategy in one paragraph

Damo works out what each letter would add to its **final** words, by imagining many ways the rest of the match could go. It converts coins into points with an exchange rate tuned so its money runs out right as the match ends. It predicts what each opponent will bid from a model fitted to that opponent's past matches. Then it picks the bid that maximizes its expected gain, nudging up against rivals close to it in score. It holds tiles to build 7+ letter words (the 3x bonus) and cashes in only when playing now beats waiting, then plays everything left at the last auction.

---

## How a single auction is decided

### 1. Work out which tiles are still out there
From the public history (every auctioned letter and every word played), Damo rebuilds the pool of tiles it **can't see**: what's still in the bag plus every opponent's hidden starting tiles. An opponent's starting tile becomes known when it plays more of a letter than it ever bought. Damo also knows exactly how many tiles each opponent holds. Unsold letters are thrown away, not returned to the bag, and the pool accounts for that.

### 2. Value the letter by imagining futures
A letter is worth what it adds to the **best final set of words** Damo can make, not its face value. An E is worth little on its own but a lot if it completes a 7-letter word.

- Damo samples possible futures: which tiles it might still win, drawn from the unseen pool. How many depends on what its coins can buy at going prices (at most 13).
- For each future, it finds the best way to split its tiles into words. A fast word engine finds the best word for a 7-tile rack in about 0.002 ms.
- **Value of letter L** = (average best total *with* L) minus (average best total *without* L), using the **same** imagined futures on both sides so the luck of the draw cancels out.
- Samples are reused across auctions (up to 96) and dropped after 6 rounds, since the pool keeps changing.

### 3. Put a price on coins
Coins aren't points, but they buy points, so Damo keeps an **exchange rate** (λ): how many points one coin is worth right now.
- Each round it solves for the rate at which bidding "value ÷ rate" on every useful future auction would spend **exactly** its budget: current coins plus the share of future word income that arrives in time to spend (47%).
- As the bag empties there's less left to buy, so the rate falls and bids rise toward its whole balance. Coins left at the end are wasted.
- At big tables (7+ bots, common in tournaments) the rate is scaled down (0.8x), because crowded tables bid high from the start. At 6-bot tables it's scaled up slightly (1.08x).

### 4. Predict what each opponent will bid
Damo keeps a **bidding model for every bot it has seen**, fitted to the game's public match history (hundreds of thousands of auctions):
- For each letter, stage of the match, coin balance and rack size, the model gives the chance an opponent sits the letter out and how much it bids if it doesn't.
- Losing bids are never published, but the price the winner paid is an upper limit on them, and the fitting uses those limits too.
- Bots with little history are pulled toward the average bidder, and recent matches count more (weight halves every 4 hours).
- **During a match**, it compares the prices it actually sees with what it predicted and corrects the model on the fly.
- The server's own filler bots ("sims") use a published formula, which Damo copies exactly.

### 5. Choose the bid
Damo tries every possible bid and keeps the one with the best expected result:

> expected gain = (chance of winning × (letter value − price × exchange rate)) + (a bonus for hurting close rivals)

- With no rivals to consider, this is the textbook Vickrey move: **bid what the letter is worth to you**.
- The rival bonus covers **denial** (Damo wins a letter a rival wanted) and **price-driving** (the rival still wins but pays Damo's higher bid). It's weighted toward opponents whose score is near Damo's, because the rating rewards finishing place, not raw points. It can raise a bid by at most about 5 coins.
- In **first-price** auctions (winner pays their own bid), the same search automatically bids below the letter's value, and the rival bonus is turned off.

### 6. Send the bid on time
- A **quick bid** goes out the instant the auction opens (in under a millisecond).
- A **refined bid**, with more samples, replaces it if it's ready before the close. Damo stops thinking 250 ms before the deadline to allow for network delay.
- Damo tracks its clock offset and network delay from the server's own timestamps.

---

## When to play words

### Play now or hold?
For each of its top 8 candidate words, Damo compares two futures, using the same imagined futures for both:
- **Play now:** the word's points, plus a little extra because those coins buy future tiles, plus the best words it can still make afterwards.
- **Hold:** the best words it can make if it keeps everything, which keeps the option to extend the word later.

It plays only if playing now wins by a margin (2.7 points), and can play up to 3 words at once. In practice it holds for **7+ letter words** (the 3x bonus) and cashes in mid-match mainly when it needs coins.

### The last auctions
- **Last tile:** the match ends the instant the final auction closes, so a live bot can never play the last tile. Damo bids **0** on it. The exception: if a server sim is at the table, Damo bids everything to deny it, since the sim could still play the tile and Damo's coins are worthless by then anyway.
- **Second-to-last tile:** valued only for what it completes right away.
- **Final dump:** when the last auction opens, Damo plays the best possible split of every tile it holds.

---

## What Damo adds to K-13

### Endgame safety net (blind dump)
About **26%** of Damo's points are scored in the final auction, and more than 30% in the last four (measured in the simulator against a strong field). If the game's data feed freezes near the end, those tiles score nothing. That has happened to K-13 live, and its stall detector only reconnects after 6 seconds.

Damo's fix: auctions open and close every second, so if the feed goes **silent for 2 seconds while 8 or fewer tiles remain** (estimated from how long it's been silent), Damo immediately plays the best words it can make from the tiles it knows it holds.
- It never fires on a normal connection, so play is otherwise exactly K-13's (verified: same seeds, identical results).
- A false alarm costs about 2–9 points (measured); a real freeze costs 21–27 points and usually the match.
- Settings: `DAMO_BLIND_DUMP=0` turns it off; `DAMO_BLIND_DUMP_BAG` and `DAMO_BLIND_DUMP_MS` tune it. The code is in `src/live/blinddump.ts`.

### Reliability fixes
- **Windows dictionary fix:** Git for Windows saved the word list with Windows line endings, which left Damo with an empty dictionary (bidding about 0 and never playing). The word readers now handle either format, and `.gitattributes` keeps the file in the right format.
- **Startup check:** Damo refuses to start if its dictionary looks broken, instead of quietly losing matches.
- **Duplicate-copy warning:** if two copies run as the same bot, they overwrite each other's bids. Damo notices when it wins a letter at a price above anything it bid and prints `ANOTHER COPY OF THIS BOT IS RUNNING`.
- **Quieter logs:** the optional telemetry backend (a private server of K-13's authors) switches itself off when it isn't set up.

---

## How the strategy was tuned (by K-13's authors)

- **Simulator:** an offline copy of the game's server logic that plays about 25,000 matches per second. Replaying 59 real matches, it matched the real scores to within about 1 point.
- **Practice opponents:** each real rival gets a simulated copy, adjusted until its scores, prices paid and word lengths match the real bot's.
- **Tuning:** an automatic search over the strategy's settings, playing the same deals against those copies.
- **Shipping rule:** a change shipped only if paired simulations showed it was better (95% confidence) in at least one tournament stage and worse in none.

### Key settings (`data/params.json`)

| Setting | Value | What it controls |
|---|---|---|
| `lambdaScale` | 1.08 | How thrifty it is with coins at 6-bot tables (above 1 = thriftier) |
| `lambdaScaleBig` | 0.8 | Spends more freely at tables of 7+ bots |
| `incomeShare` | 0.47 | Share of expected future word income counted as spendable |
| `rivalWeight` | 0.9 | How much hurting close rivals counts |
| `maxOverbid` | 4.85 | Most coins the rival bonus can add to a bid |
| `playMargin` | 2.7 | Points by which playing must beat holding |
| `coinBonus` | 0.32 | Extra value of coins earned now (they buy tiles) |
| `kMax` | 13 | Most future tiles imagined per sample |
| `calibRate` | 0.056 | How fast in-match price corrections are learned |

Override any setting for one run with `DAMO_PARAMS='{"playMargin":3}'`.

---

## Known weaknesses

1. **Tuned with less thinking than it does live.** Settings were tuned with about 8 samples per auction; live play uses about 96. The authors measured a 45-point-per-match difference between the two, so the settings may not be the best ones for live play.
2. **Practice opponents were too easy.** The simulated rivals overspend early, which rewarded holding coins back. Live play at 6-bot tables may favor spending a bit more.
3. **Opponent data ages.** The rival copies were built on Oct 25, before LUCENTv3 rose to #1, and there's no copy of Waupus. Keep the data collector running (below) so the live bidding models stay current.
4. **The code is public.** Anyone can read exactly how Damo bids, so strong rivals can model it. `DAMO_NO_LADDER=1` keeps it off the ladder so it doesn't publish its bids before tournaments.
5. **Heads-up finals:** K-13's authors found a variant that beat it in 99.7% of simulated Vickrey finals but rejected it because it lost in first-price. That gap is still open.
6. **No tournament-stage tactics.** A stage-aware mode exists but is off; it didn't help in testing.

---

## Running it

Requires Node 22.5+. Full steps, including getting a bot token, are in [CLAUDE.md](CLAUDE.md).

```powershell
npm run setup                               # install, typecheck, tests
npm run mine -- --no-backend --follow       # window 1: keep opponent data fresh (leave running)
$env:BOT_NAME="lbender"; npm run bot        # window 2: play  (macOS/Linux: BOT_NAME=lbender npm run bot)
npm run status                              # window 3, any time: rating and recent matches
```

**Run only one copy of the bot at a time**, across the whole team.

---

## Code map

| Path | What's there |
|---|---|
| `src/brain/` | The strategy: tile tracking, letter values, coin exchange rate, bid choice, place weighting, play vs hold |
| `src/memory/` | Collecting match history, fitting each rival's bidding model, simulated rival copies |
| `src/sim/` | The offline game simulator |
| `src/live/` | The live client: connection, two-stage bidding, clock, word sending, stall detector, **blind dump** |
| `src/core/` | Game rules and the word engine |
| `data/params.json` | Tuned strategy settings |
| `scripts/` | Setup, endgame measurements, tmux runner |

---

## Credit and license

The strategy, simulator, opponent models and most of the code are **K-13's, by aryamehr2k** ([aryamehr2k/k13-scrabblebot](https://github.com/aryamehr2k/k13-scrabblebot)). That repository has no license, so keep this project private unless the author agrees otherwise. The game, its server module and the starter strategy are by Clockwork Labs, under the MIT License; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
