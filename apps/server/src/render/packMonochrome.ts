export const PanelWidth = 800;
export const PanelHeight = 480;

const BitsPerByte = 8;

export const bytesPerRow = (width: number): number =>
  Math.ceil(width / BitsPerByte);

export const FrameByteLength = bytesPerRow(PanelWidth) * PanelHeight;

/** Anything at or above mid grey is white. The page is drawn in pure black and
 * white, so this only ever has to resolve antialiased text edges. */
const WhiteThreshold = 128;

/** Backed by a plain ArrayBuffer so a Frame can be a Response body directly. */
export type FrameBytes = Uint8Array<ArrayBuffer>;

export type PackRequest = {
  /** One byte per pixel, row major, as sharp's raw greyscale output. */
  readonly greyscale: Uint8Array;
  readonly width: number;
  readonly height: number;
};

/**
 * Packs greyscale bytes into the panel's native format: one bit per pixel,
 * most significant bit leftmost, a set bit meaning white. That is what the
 * controller's RAM expects, so the Device can hand the buffer straight to
 * GxEPD2's writeImage without touching it — see ADR-0001, the Device draws
 * nothing.
 */
export const packMonochrome = ({
  greyscale,
  width,
  height,
}: PackRequest): FrameBytes => {
  const stride = bytesPerRow(width);
  // Starts white, matching the panel's rest state, so that a row whose width is
  // not a multiple of eight pads with white rather than a black sliver.
  const packed = new Uint8Array(stride * height).fill(0xff);

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const isWhite = (greyscale[row * width + column] ?? 0) >= WhiteThreshold;
      if (isWhite) continue;

      const index = row * stride + (column >> 3);
      packed[index] = (packed[index] ?? 0xff) & ~(0x80 >> column % BitsPerByte);
    }
  }

  return packed;
};
