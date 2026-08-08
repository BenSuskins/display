import sharp from "sharp";

import {
  bytesPerRow,
  PanelHeight,
  PanelWidth,
} from "../src/render/packMonochrome";

/**
 * Turns a Frame back into something a human can look at. The Panel is the only
 * real judge of contrast and ghosting, but this catches layout mistakes without
 * waiting 15 s for a refresh.
 *
 *   bun run scripts/frameToPng.ts <frame.bin> <out.png>
 */
const [, , framePath, outputPath = "frame.png"] = Bun.argv;

if (framePath === undefined) {
  console.error("usage: bun run scripts/frameToPng.ts <frame.bin> [out.png]");
  process.exit(1);
}

const packed = new Uint8Array(await Bun.file(framePath).arrayBuffer());
const stride = bytesPerRow(PanelWidth);
const greyscale = new Uint8Array(PanelWidth * PanelHeight);

for (let row = 0; row < PanelHeight; row += 1) {
  for (let column = 0; column < PanelWidth; column += 1) {
    const byte = packed[row * stride + (column >> 3)] ?? 0xff;
    const isWhite = (byte & (0x80 >> column % 8)) !== 0;
    greyscale[row * PanelWidth + column] = isWhite ? 255 : 0;
  }
}

await sharp(greyscale, {
  raw: { width: PanelWidth, height: PanelHeight, channels: 1 },
})
  .png()
  .toFile(outputPath);

const blackPixels = greyscale.filter((value) => value === 0).length;
console.log(
  `${outputPath}: ${PanelWidth}x${PanelHeight}, ` +
    `${((blackPixels / greyscale.length) * 100).toFixed(1)}% black`,
);
