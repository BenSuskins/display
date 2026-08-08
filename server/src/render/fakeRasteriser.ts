import { fail, succeed } from "../domain/result";
import { FrameByteLength, type FrameBytes } from "./packMonochrome";
import type { RasterFailure, Rasteriser } from "./rasteriser";

export type FakeRasteriserState = {
  readonly failure?: RasterFailure;
};

/**
 * A Rasteriser that skips Chromium. It still returns a full-length Frame whose
 * bytes depend on the HTML, so tests of caching and change detection behave the
 * way the real one does without paying for a browser.
 */
export const fakeRasteriser = (
  state: FakeRasteriserState = {},
): Rasteriser => ({
  rasterise: async (html) => {
    if (state.failure !== undefined) return fail(state.failure);

    const bytes = new Uint8Array(FrameByteLength).fill(0xff);
    const fingerprint = Bun.hash(html);

    for (let index = 0; index < 8; index += 1) {
      bytes[index] = Number((BigInt(fingerprint) >> BigInt(index * 8)) & 0xffn);
    }

    return succeed(bytes);
  },

  close: async () => {},
});
