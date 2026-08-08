import { describe, expect, test } from "bun:test";

import {
  FrameByteLength,
  PanelHeight,
  PanelWidth,
  packMonochrome,
} from "../../src/render/packMonochrome";

const White = 255;
const Black = 0;

const pack = (greyscale: readonly number[], width: number, height: number) =>
  Array.from(
    packMonochrome({
      greyscale: Uint8Array.from(greyscale),
      width,
      height,
    }),
  );

describe("packMonochrome", () => {
  test("packs eight white pixels into an all-ones byte", () => {
    // GxEPD2 clears to 0xFF for white, so a set bit is white and a clear bit
    // is black — see clearScreen's default in the panel driver.
    expect(pack(Array(8).fill(White), 8, 1)).toEqual([0b11111111]);
  });

  test("packs eight black pixels into a zero byte", () => {
    expect(pack(Array(8).fill(Black), 8, 1)).toEqual([0b00000000]);
  });

  test("puts the leftmost pixel in the most significant bit", () => {
    const leftmostBlack = [Black, White, White, White, White, White, White, White];

    expect(pack(leftmostBlack, 8, 1)).toEqual([0b01111111]);
  });

  test("packs alternating pixels in reading order", () => {
    const alternating = [White, Black, White, Black, White, Black, White, Black];

    expect(pack(alternating, 8, 1)).toEqual([0b10101010]);
  });

  test("treats mid grey and above as white", () => {
    expect(pack([128, 127, 255, 0, 255, 255, 255, 255], 8, 1)).toEqual([
      0b10101111,
    ]);
  });

  test("starts each row on a byte boundary", () => {
    // Two rows of 4 pixels: each row pads to its own byte rather than running on.
    const twoRows = [Black, Black, Black, Black, White, White, White, White];

    expect(pack(twoRows, 4, 2)).toEqual([0b00001111, 0b11111111]);
  });

  test("produces exactly one frame for a full panel", () => {
    const allWhite = new Uint8Array(PanelWidth * PanelHeight).fill(White);

    const packed = packMonochrome({
      greyscale: allWhite,
      width: PanelWidth,
      height: PanelHeight,
    });

    expect(packed.length).toBe(FrameByteLength);
    expect(packed.length).toBe(48_000);
    expect(packed.every((byte) => byte === 0xff)).toBe(true);
  });
});
