# Damo: setup guide for Claude (and humans)

Damo is a bot for ScrabbleBot (https://scrabblebot.spacetimedb.com), a sealed-bid letter-auction word game on SpacetimeDB. It is K-13 (aryamehr2k/k13-scrabblebot, tournament #1 champion) with one change, the endgame blind dump in `src/live/blinddump.ts`. Read `README.md` for what it does and why.

If someone shared this folder and asked you to set it up, follow the steps below in order. Do the steps marked **you** yourself; the steps marked **human** need the person's own accounts, so walk them through those and wait.

## Setup

1. **you: check Node.** `node --version` must be 22.5 or newer, because the bot uses the built-in `node:sqlite`. If it's older or missing, tell the person to install the current LTS from https://nodejs.org, then continue.
2. **you: install and verify.** Run `npm run setup` from this folder. It runs `npm ci`, a typecheck and the 164 offline tests, which take about 90 s. Use `npm run setup -- --quick` to skip the tests. Every test should pass. If one fails, report it; don't change the strategy code to make it pass.
3. **you: build the rival models.** Run `npm run mine -- --no-backend`. It downloads the game's public match history from maincloud and fits a bidding model per rival into `data/history.sqlite`. This is required: without it Damo bids against a generic market guess and is much weaker. It needs internet access and can take several minutes. Re-run it before a tournament.
4. **human: link their account and join the team.** On the ScrabbleBot site:
   - Install the SpacetimeDB CLI: `curl -sSf https://install.spacetimedb.com | sh` (macOS/Linux) or `iwr https://windows.spacetimedb.com -useb | iex` (Windows PowerShell). Then run `spacetime login`, which opens a browser to sign in with GitHub.
   - Open `/account` on the site and run the `spacetime call scrabblebot connect_id '["0x…"]'` line it shows, then refresh. In PowerShell, if the quotes break, escape the inner quotes: `'[\"0x…\"]'`.
   - Join the existing team with the **invite code** from a team owner. Don't create a new team: the bot belongs to the team.
5. **human: get a bot token.** On `/team`, click **Generate token**. It's shown once. Each teammate can mint their own token for the same bot. Never paste a token into chat logs you share, and never commit it.
6. **you: start the bot.** Have the person run it, or run it with the token they give you:
   - macOS/Linux: `BOT_NAME=damo BOT_TOKEN=<token> npm run bot`
   - PowerShell: `$env:BOT_NAME="damo"; $env:BOT_TOKEN="<token>"; npm run bot`
   - The first run saves the token to `.token-damo`, which is git-ignored. Later runs only need `npm run bot`.
7. **you: confirm it works.** `npm run bot -- --dry-run` follows a live match anonymously without playing, which is a safe connectivity check before step 6. Once the bot is running, `npm run status` shows its rating, recent matches and any missed deadlines.

## Rules for working in this repo

- **Run only one Damo process at a time** across the whole team. Two processes on the same bot fight over bids and lobby joins. Agree who runs it.
- **Never commit** `.token-*`, `data/*.sqlite*` or `logs/`; `.gitignore` already covers them.
- **The strategy is K-13's tuned engine.** Don't edit `src/brain/` or `data/params.json` casually. A strategy change should be backed by a paired simulator comparison (`src/brain/eval.ts`; see `src/brain/README.md`), not by intuition.
- Environment variables are `DAMO_*` (`DAMO_NO_LADDER=1` plays tournaments only, `DAMO_BLIND_DUMP=0` disables the endgame dump, `DAMO_PARAMS='{...}'` overrides parameters). The full list is in `README.md` and `docs/K13-README.md`.
- **Tournaments:** the bot registers itself for any tournament that opens, as long as it's running and connected. It must stay online, because an offline registered bot still gets seated and loses every auction.

## Useful commands

| Command                            | What it does                                |
| ---------------------------------- | ------------------------------------------- |
| `npm run setup`                    | Install, typecheck, test                    |
| `npm run mine -- --no-backend`     | Refresh match history and rival models      |
| `npm run bot`                      | Play (ladder + tournaments)                 |
| `npm run bot -- --dry-run`         | Watch a live match, no reducer calls        |
| `npm run status`                   | Rating, recent matches, misses, think times |
| `npm test`                         | Offline unit tests                          |
| `npx tsx src/brain/eval.ts --help` | Paired simulator evaluation                 |

## License

Most of this code is K-13's, by aryamehr2k, and that repository has no license. Keep this project private and don't redistribute it publicly without the author's permission. The game module and starter are by Clockwork Labs, under the MIT License; see `THIRD_PARTY_NOTICES.md`.
