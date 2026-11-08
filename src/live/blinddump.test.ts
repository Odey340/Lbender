import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_BLIND_DUMP,
  blindDumpConfig,
  blindDumpDue,
  blindSilenceMs,
  estimatedBag,
  rackAfterInFlight,
} from "./blinddump.js";
import { stallLimitMs } from "./watchdog.js";

const cfg = { ...DEFAULT_BLIND_DUMP };

test("blind dump: fires on 2 auctions of silence, well before the 6 s watchdog", () => {
  assert.equal(blindSilenceMs(1000, cfg), 2000);
  assert.equal(blindSilenceMs(500, cfg), 1800, "floor of 1.8 s");
  assert.equal(blindSilenceMs(NaN, cfg), 2000);
  assert.ok(blindSilenceMs(1000, cfg) < stallLimitMs(1000), "must beat the reconnect");
  assert.equal(blindSilenceMs(1000, { ...cfg, silenceMs: 3000 }), 3000, "override");
});

test("blind dump: never fires on a healthy feed", () => {
  // An auction opens or closes every second: the silence never reaches 2 s.
  for (let bag = 0; bag <= 20; bag++) assert.ok(!blindDumpDue(10_999, 10_000, 1000, bag, cfg));
  assert.ok(!blindDumpDue(11_900, 10_000, 1000, 0, cfg));
});

test("blind dump: only in the endgame, judged on the estimated bag", () => {
  assert.equal(estimatedBag(12, 2500, 1000), 10);
  assert.equal(estimatedBag(3, 9000, 1000), 0);
  assert.ok(blindDumpDue(12_100, 10_000, 1000, 5, cfg), "bag 5, 2.1 s silent");
  assert.ok(
    !blindDumpDue(12_100, 10_000, 1000, 30, cfg),
    "mid-match stall: leave it to the watchdog",
  );
  // A stall that starts at bag 10 still triggers once the estimate drops to 8.
  assert.ok(!blindDumpDue(12_100, 10_000, 1000, 11, cfg));
  assert.ok(blindDumpDue(12_100, 10_000, 1000, 10, cfg));
  assert.ok(blindDumpDue(14_100, 10_000, 1000, 12, cfg), "4 s silent from bag 12: estimate 8");
  assert.ok(
    !blindDumpDue(12_100, 10_000, 1000, 5, { ...cfg, enabled: false }),
    "DAMO_BLIND_DUMP=0",
  );
});

test("blind dump: env config", () => {
  assert.deepEqual(blindDumpConfig({}), { enabled: true, silenceMs: 0, maxBag: 8 });
  assert.deepEqual(
    blindDumpConfig({ DAMO_BLIND_DUMP: "0", DAMO_BLIND_DUMP_MS: "2500", DAMO_BLIND_DUMP_BAG: "6" }),
    {
      enabled: false,
      silenceMs: 2500,
      maxBag: 6,
    },
  );
  assert.deepEqual(blindDumpConfig({ DAMO_BLIND_DUMP_MS: "x", DAMO_BLIND_DUMP_BAG: "-3" }), {
    enabled: true,
    silenceMs: 0,
    maxBag: 0,
  });
});

test("blind dump: letters of unacknowledged words are not reused", () => {
  const rack = new Array(26).fill(0);
  rack[0] = 2;
  rack[4] = 1;
  const inFlight = new Array(26).fill(0);
  inFlight[0] = 1;
  inFlight[4] = 3;
  const left = rackAfterInFlight(rack, inFlight);
  assert.equal(left[0], 1);
  assert.equal(left[4], 0, "never negative");
});
