import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((part) => Number.parseInt(part, 16) / 255)
    .map((channel) =>
      channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("active order progress uses scoped, readable semantic states", async () => {
  const [progress, orderPage, css] = await Promise.all([
    read("components/orders/OrderProgress.tsx"),
    read("app/admin/orders/[id]/page.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(progress, /sen-order-progress-step/);
  assert.match(progress, /is-current/);
  assert.match(orderPage, /sen-order-progress-action/);
  assert.match(orderPage, /is-current/);

  const activeRule = css.match(
    /\.sen-order-progress-(?:step|action)\.is-current\s*\{([^}]+)\}/,
  );
  assert.ok(activeRule, "Missing scoped active order-progress CSS");

  const foreground = activeRule[1].match(
    /(?:^|[;\r\n])\s*color:\s*(#[0-9a-f]{6})/i,
  )?.[1];
  const background = activeRule[1].match(
    /background-color:\s*(#[0-9a-f]{6})/i,
  )?.[1];
  assert.ok(foreground && background, "Active state must set explicit colors");
  assert.ok(
    contrast(foreground, background) >= 4.5,
    "Active order-progress colors must meet WCAG AA contrast",
  );
});
