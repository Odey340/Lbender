#!/usr/bin/env node
// One-command setup for Damo, cross-platform (macOS, Linux, Windows).
//
//   npm run setup                 check Node, install, typecheck, run the offline tests
//   npm run setup -- --quick      skip the tests (~90 s)
//   npm run setup -- --mine       also download the match history and fit the rival models
//
// It never asks for or stores a bot token: that step needs the human (see CLAUDE.md).

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const ok = (m) => console.log(`\x1b[32m✔\x1b[0m ${m}`);
const fail = (m) => {
  console.error(`\x1b[31m✘ ${m}\x1b[0m`);
  process.exit(1);
};
const run = (label, cmd) => {
  console.log(`\n→ ${label}: ${cmd}`);
  const r = spawnSync(cmd, { stdio: "inherit", shell: true });
  if (r.status !== 0) fail(`${label} failed (exit ${r.status}). See the output above.`);
  ok(label);
};

// 1. Node 22.5+ (the bot uses the built-in node:sqlite).
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 5))
  fail(
    `Node ${process.versions.node} is too old: install Node 22.5 or newer (https://nodejs.org), then re-run.`,
  );
ok(`Node ${process.versions.node}`);

// 2. Dependencies, typecheck, tests.
run("install dependencies", "npm ci");
run("typecheck", "npx tsc --noEmit -p .");
if (!args.has("--quick")) run("offline tests", "npm test");

// 3. Optional: opponent history (needs internet access to maincloud.spacetimedb.com).
if (args.has("--mine"))
  run("download match history and fit rival models", "npm run mine -- --no-backend");

const haveModel = existsSync("data/history.sqlite");
const haveToken = [".token-damo"].some((f) => existsSync(f));
console.log(`
Setup done.
  Rival models (data/history.sqlite): ${haveModel ? "present" : "MISSING: run  npm run mine -- --no-backend"}
  Bot token (.token-damo):            ${haveToken ? "present" : "missing: get one from the ScrabbleBot site's /team page (see CLAUDE.md)"}

Next:
  npm run bot -- --dry-run                         watch a live match without playing
  BOT_NAME=damo BOT_TOKEN=<token> npm run bot      play (PowerShell: $env:BOT_NAME="damo"; $env:BOT_TOKEN="<token>"; npm run bot)
`);
