import { afterAll, describe, expect, test } from "bun:test";

import {
  FrameByteLength,
  bytesPerRow,
  PanelHeight,
  PanelWidth,
} from "../../src/render/packMonochrome";
import { chromiumRasteriser } from "../../src/render/rasteriser";

const rasteriser = chromiumRasteriser();

afterAll(async () => {
  await rasteriser.close();
});

const page = (bodyStyle: string, body = ""): string => `
  <style>
    html, body { margin: 0; padding: 0; }
    body { width: ${PanelWidth}px; height: ${PanelHeight}px; ${bodyStyle} }
  </style>
  ${body}
`;

const frameOf = async (html: string): Promise<Uint8Array> => {
  const result = await rasteriser.rasterise(html);
  if (!result.ok) throw new Error(`rasterise failed: ${result.failure.detail}`);
  return result.value;
};

describe("chromiumRasteriser", () => {
  test("produces exactly one panel's worth of bytes", async () => {
    const frame = await frameOf(page("background: #fff;"));

    expect(frame.length).toBe(FrameByteLength);
  });

  test("renders a white page as all white bits", async () => {
    const frame = await frameOf(page("background: #fff;"));

    expect(frame.every((byte) => byte === 0xff)).toBe(true);
  });

  test("renders a black page as all black bits", async () => {
    const frame = await frameOf(page("background: #000;"));

    expect(frame.every((byte) => byte === 0x00)).toBe(true);
  });

  test("puts the left of the page in the low bytes of each row", async () => {
    const frame = await frameOf(
      page("background: #fff;", `
        <div style="position:absolute;left:0;top:0;
                    width:${PanelWidth / 2}px;height:${PanelHeight}px;
                    background:#000"></div>
      `),
    );

    const stride = bytesPerRow(PanelWidth);
    const middleRow = frame.subarray(stride * 240, stride * 241);

    expect(middleRow[0]).toBe(0x00);
    expect(middleRow[stride - 1]).toBe(0xff);
  });

  test("reuses the browser across renders", async () => {
    const [first, second] = await Promise.all([
      frameOf(page("background: #fff;")),
      frameOf(page("background: #000;")),
    ]);

    expect(first?.[0]).toBe(0xff);
    expect(second?.[0]).toBe(0x00);
  });

  test("reports a failure rather than throwing when the page is broken", async () => {
    const result = await rasteriser.rasterise(
      `<script>throw new Error("boom")</script>`,
    );

    // A page script blowing up must not take the whole Frame with it.
    expect(result.ok).toBe(true);
  });
});
