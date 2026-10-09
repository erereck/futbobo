import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PLAYER_APPEARANCE, BOOT_COLORS, HAIR_STYLE_NAMES,
  drawPlayerBust, drawPlayerFullBody, normalizePlayerAppearance, randomPlayerAppearance,
} from "../app/player-appearance.ts";

test("existing saves still normalize to v2 with safe new fields", () => {
  const appearance = normalizePlayerAppearance({ ...DEFAULT_PLAYER_APPEARANCE, hairStyle: 21 });
  assert.equal(appearance.version, 2);
  assert.equal(appearance.hairStyle, 21);
  assert.equal(appearance.build, 1);
  assert.equal(appearance.stature, 1);
  assert.equal(appearance.glasses, 0);
  assert.equal(appearance.boots, 1);
});
test("invalid inputs and colors cannot corrupt the save format", () => {
  const appearance = normalizePlayerAppearance({
    version: 2, skin: 500, hairColor: -22, eyeColor: 20, hairStyle: 999,
    face: -100, beard: -5, brow: 99, kitPattern: -3, build: 99,
    stature: -99, glasses: 100, boots: 999, customShortsColor: "red",
    customHairColor: "#Aa20Ff",
  });
  assert.equal(appearance.hairStyle, HAIR_STYLE_NAMES.length - 1);
  assert.equal(appearance.boots, BOOT_COLORS.length - 1);
  assert.equal(appearance.customShortsColor, undefined);
  assert.equal(appearance.customHairColor, "#Aa20Ff");
  assert.equal(appearance.brow, 2);
});
test("random players remain deterministic and compatible", () => {
  assert.deepEqual(randomPlayerAppearance(42), randomPlayerAppearance(42));
  const appearance = normalizePlayerAppearance(randomPlayerAppearance(42));
  assert.ok(appearance.hairStyle >= 0 && appearance.hairStyle < HAIR_STYLE_NAMES.length);
});

function mockContext() {
  const calls = [];
  const context = new Proxy({ canvas: { width: 360, height: 530 } }, {
    get(target, prop) {
      if (prop === "canvas") return target.canvas;
      return (...args) => { calls.push([prop, ...args]); };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  return { context, calls };
}
test("full-body renderer draws feet, jersey and current shirt number", () => {
  const { context, calls } = mockContext();
  drawPlayerFullBody(context, normalizePlayerAppearance({
    ...DEFAULT_PLAYER_APPEARANCE, build: 3, stature: 2, hairStyle: 20,
    glasses: 2, facialDetail: 1, headwear: 2, sleeves: 1,
    socks: 2, boots: 6, customShortsColor: "#20308e",
  }), "#efefef", "#194477", 27);
  assert.ok(calls.length > 50);
  assert.ok(calls.some(([method, text]) => method === "fillText" && text === "27"));
  assert.ok(calls.some(([method]) => method === "ellipse"));
});
test("match button renderer supports accessories without breaking", () => {
  const { context, calls } = mockContext();
  drawPlayerBust(context, normalizePlayerAppearance({
    ...DEFAULT_PLAYER_APPEARANCE, glasses: 3, facialDetail: 3, headwear: 1,
  }), "#eeeeee", "#222222", 81);
  assert.ok(calls.length > 30);
  assert.ok(calls.some(([method]) => method === "arc"));
});
