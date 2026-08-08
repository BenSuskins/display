import { chromium, type Browser } from "playwright";
import sharp from "sharp";

import { fail, succeed, type Result } from "../domain/result";
import {
  PanelHeight,
  PanelWidth,
  packMonochrome,
  type FrameBytes,
} from "./packMonochrome";

export type RasterFailure = {
  readonly kind: "rasterFailed";
  readonly detail: string;
};

export type Rasteriser = {
  /** HTML in, one Frame out: 48,000 bytes ready for GxEPD2's writeImage. */
  readonly rasterise: (
    html: string,
  ) => Promise<Result<FrameBytes, RasterFailure>>;
  readonly close: () => Promise<void>;
};

const launchArguments = [
  // The container runs as an unprivileged user with no user namespaces.
  "--no-sandbox",
  "--disable-dev-shm-usage",
];

export const chromiumRasteriser = (): Rasteriser => {
  // Launching Chromium costs far more than a render does, so the browser is
  // started once on first use and kept for the life of the process.
  let browser: Promise<Browser> | undefined;

  const running = (): Promise<Browser> =>
    (browser ??= chromium.launch({ args: launchArguments }));

  return {
    rasterise: async (html) => {
      const page = await (await running()).newPage({
        viewport: { width: PanelWidth, height: PanelHeight },
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
      });

      try {
        await page.setContent(html, { waitUntil: "load" });
        const png = await page.screenshot({ type: "png" });

        const greyscale = await sharp(png)
          .greyscale()
          .raw()
          .toBuffer({ resolveWithObject: true });

        return succeed(
          packMonochrome({
            greyscale: new Uint8Array(greyscale.data),
            width: greyscale.info.width,
            height: greyscale.info.height,
          }),
        );
      } catch (cause) {
        return fail({
          kind: "rasterFailed",
          detail: cause instanceof Error ? cause.message : String(cause),
        });
      } finally {
        await page.close();
      }
    },

    close: async () => {
      const started = browser;
      browser = undefined;
      if (started !== undefined) await (await started).close();
    },
  };
};
