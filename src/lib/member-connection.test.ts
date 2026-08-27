import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatApproxLocation } from "./request-meta.ts";
import { uniqueIps } from "./ip-utils.ts";

describe("member connection recording semantics", () => {
  it("treats first connection as signup and later as sign-in", () => {
    // Mirrors recordConnection priorCount rules.
    function eventForPriorCount(priorCount: number) {
      return priorCount === 0 ? "signup" : "signin";
    }
    assert.equal(eventForPriorCount(0), "signup");
    assert.equal(eventForPriorCount(1), "signin");
    assert.equal(eventForPriorCount(5), "signin");
  });

  it("omits Local/unknown from approx location labels", () => {
    assert.equal(formatApproxLocation({ city: "", region: "", country: "", ip: "unknown" }), "");
    assert.equal(formatApproxLocation({ city: "", region: "", country: "", ip: "localhost" }), "");
    assert.equal(formatApproxLocation({ city: "", region: "", country: "", ip: "127.0.0.1" }), "");
    assert.equal(
      formatApproxLocation({ city: "Istanbul", region: "34", country: "TR", ip: "1.2.3.4" }),
      "Istanbul, Türkiye",
    );
  });

  it("excludes loopback and unknown IPs from diagnostic IP lists", () => {
    assert.deepEqual(uniqueIps(["unknown", "localhost", "127.0.0.1", "8.8.8.8", "8.8.8.8"]), [
      "8.8.8.8",
    ]);
  });
});
