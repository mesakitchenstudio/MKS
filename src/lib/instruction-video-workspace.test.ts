import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findCanonicalSectionAtPlayhead,
  roundPlayheadToSeconds,
  validateEndTimestampFromPlayhead,
} from "@/lib/instruction-video-workspace";

test("roundPlayheadToSeconds uses nearest whole second", () => {
  assert.equal(roundPlayheadToSeconds(0), 0);
  assert.equal(roundPlayheadToSeconds(87.4), 87);
  assert.equal(roundPlayheadToSeconds(87.6), 88);
  assert.equal(roundPlayheadToSeconds(266.7), 267);
});

test("roundPlayheadToSeconds rejects invalid values", () => {
  assert.equal(roundPlayheadToSeconds(-3), 0);
  assert.equal(roundPlayheadToSeconds(Number.NaN), 0);
});

test("findCanonicalSectionAtPlayhead matches playhead within section range", () => {
  const groups = [
    { name: "One", steps: ["a"], startTimestamp: 12 },
    { name: "Two", steps: ["b"], startTimestamp: 64 },
    { name: "Three", steps: ["c"], startTimestamp: 197 },
  ];
  assert.equal(
    findCanonicalSectionAtPlayhead({ groups, playheadSeconds: 30 }),
    0,
  );
  assert.equal(
    findCanonicalSectionAtPlayhead({ groups, playheadSeconds: 120 }),
    1,
  );
  assert.equal(
    findCanonicalSectionAtPlayhead({ groups, playheadSeconds: 5 }),
    null,
  );
});

test("findCanonicalSectionAtPlayhead spans until the next canonical section", () => {
  const groups = [
    { name: "One", steps: ["a"], startTimestamp: 12 },
    { name: "Two", steps: ["b"] },
    { name: "Three", steps: ["c"], startTimestamp: 197 },
  ];
  assert.equal(
    findCanonicalSectionAtPlayhead({ groups, playheadSeconds: 100 }),
    0,
  );
  assert.equal(
    findCanonicalSectionAtPlayhead({ groups, playheadSeconds: 5 }),
    null,
  );
});

test("validateEndTimestampFromPlayhead rejects end at or before start", () => {
  const invalid = validateEndTimestampFromPlayhead({
    startTimestamp: 197,
    endSeconds: 197,
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.match(invalid.message, /later than/i);
  }

  const before = validateEndTimestampFromPlayhead({
    startTimestamp: 197,
    endSeconds: 120,
  });
  assert.equal(before.ok, false);

  const valid = validateEndTimestampFromPlayhead({
    startTimestamp: 197,
    endSeconds: 240.6,
  });
  assert.equal(valid.ok, true);
});

test("validateEndTimestampFromPlayhead allows end when start is missing", () => {
  assert.deepEqual(
    validateEndTimestampFromPlayhead({ startTimestamp: undefined, endSeconds: 90 }),
    { ok: true },
  );
});

test("findCanonicalSectionAtPlayhead uses explicit end when provided", () => {
  const groups = [{ name: "One", steps: ["a"], startTimestamp: 12, endTimestamp: 50 }];
  assert.equal(
    findCanonicalSectionAtPlayhead({ groups, playheadSeconds: 40 }),
    0,
  );
  assert.equal(
    findCanonicalSectionAtPlayhead({ groups, playheadSeconds: 55 }),
    null,
  );
});
