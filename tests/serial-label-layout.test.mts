import assert from "node:assert/strict";
import test from "node:test";

import {
  createSerialLabelLayout,
  selectSingleSerialForLabelPrinter,
} from "../lib/inventory/serial-label-layout.ts";

const approximately = (actual: number, expected: number) => {
  assert.ok(Math.abs(actual - expected) < 0.000_001, `expected ${actual} to be approximately ${expected}`);
};

test("a 50 x 30 mm label uniformly scales every component inside its safe boundary", () => {
  const layout = createSerialLabelLayout(50, 30);

  assert.equal(layout.canvasWidthMm, 70);
  assert.equal(layout.canvasHeightMm, 42);
  approximately(layout.scale, 19 / 28);
  approximately(layout.scaledWidthMm, 47.5);
  approximately(layout.scaledHeightMm, 28.5);
  approximately(layout.offsetXmm, 1.25);
  approximately(layout.offsetYmm, 0.75);
  assert.ok(layout.offsetXmm >= 0.75);
  assert.ok(layout.offsetYmm >= 0.75);
  assert.ok(layout.offsetXmm + layout.scaledWidthMm <= 49.25);
  assert.ok(layout.offsetYmm + layout.scaledHeightMm <= 29.25);
});

test("the smallest supported label keeps the complete canvas inside its safe boundary", () => {
  const layout = createSerialLabelLayout(10, 10);

  approximately(layout.scale, 17 / 140);
  approximately(layout.scaledWidthMm, 8.5);
  approximately(layout.scaledHeightMm, 5.1);
  approximately(layout.offsetXmm, 0.75);
  approximately(layout.offsetYmm, 2.45);
  assert.ok(layout.scale > 0);
  assert.ok(layout.offsetXmm + layout.scaledWidthMm <= 9.25);
  assert.ok(layout.offsetYmm + layout.scaledHeightMm <= 9.25);
});

test("invalid physical dimensions cannot produce a printable layout", () => {
  assert.throws(() => createSerialLabelLayout(0, 30), /positive/i);
  assert.throws(() => createSerialLabelLayout(50, Number.NaN), /finite/i);
});

test("a label-printer job contains only the first matching SEN serial", () => {
  const serials = [
    { id: "first", senSerial: "SEN-FIRST" },
    { id: "second", senSerial: "SEN-SECOND" },
    { id: "third", senSerial: "SEN-THIRD" },
  ];

  assert.deepEqual(selectSingleSerialForLabelPrinter(serials), [serials[0]]);
  assert.deepEqual(selectSingleSerialForLabelPrinter([]), []);
});
