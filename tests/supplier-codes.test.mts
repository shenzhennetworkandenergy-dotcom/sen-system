import test from "node:test";
import assert from "node:assert/strict";
import {
  categoryCodeSegment,
  supplierCodePrefix,
  supplierCodePreview,
} from "../lib/purchasing/supplier-codes.ts";

test("category code uses up to four uppercase alphanumeric characters", () => {
  assert.equal(categoryCodeSegment("Networking"), "NETW");
  assert.equal(categoryCodeSegment("AI & IoT"), "AIIO");
  assert.equal(categoryCodeSegment("HR"), "HR");
});

test("category code rejects names without letters or digits", () => {
  assert.throws(() => categoryCodeSegment(" --- "), /letter or number/i);
});

test("supplier prefix includes every category level without a depth limit", () => {
  assert.equal(
    supplierCodePrefix(["Networking", "Switches", "Cisco Switches", "Enterprise Core", "Dhaka"]),
    "NETW-SWIT-CISC-ENTE-DHAK",
  );
});

test("supplier preview appends a zero-padded five-digit suffix", () => {
  assert.equal(supplierCodePreview(["Energy"], 28461), "ENER-28461");
  assert.equal(supplierCodePreview(["Networking", "Routers"], 42), "NETW-ROUT-00042");
});

test("supplier preview rejects suffixes outside five numeric digits", () => {
  assert.throws(() => supplierCodePreview(["Energy"], -1), /suffix/i);
  assert.throws(() => supplierCodePreview(["Energy"], 100000), /suffix/i);
});
