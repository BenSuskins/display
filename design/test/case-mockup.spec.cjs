const { test, expect } = require("playwright/test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const mockupUrl = pathToFileURL(
  path.resolve(__dirname, "../case-mockup.html"),
).href;

test("the offline mockup supports assembly and cover removal", async ({
  page,
}) => {
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(mockupUrl);
  await expect(
    page.getByRole("heading", { name: "Household display" }),
  ).toBeVisible();
  await expect(
    page.getByRole("slider", { name: "Assembly progress" }),
  ).toHaveValue("5");
  await page.getByRole("button", { name: "Open cover", exact: true }).click();
  await expect(page.locator("#step-title")).toHaveText("Cover removed");
  await expect(page.locator("#step-description")).toContainText(
    "ribbon stays connected",
  );
  await page.getByRole("button", { name: "Close cover", exact: true }).click();
  await expect(page.locator("#step-title")).toHaveText("Case assembled");
  await page
    .getByRole("button", { name: "Reset assembly", exact: true })
    .click();
  await expect(
    page.getByRole("slider", { name: "Assembly progress" }),
  ).toHaveValue("0");
  for (let index = 0; index < 5; index += 1) {
    await page.getByRole("button", { name: "Next step", exact: true }).click();
  }
  await expect(page.locator("#step-title")).toHaveText("Case assembled");
  await page
    .getByRole("button", { name: "Previous step", exact: true })
    .click();
  await expect(page.locator("#step-title")).toHaveText("Close the cover");
  expect(errors).toEqual([]);
  expect(requests.every((url) => url.startsWith("file:"))).toBe(true);
});

test("view controls, section controls, and keyboard controls work", async ({
  page,
}) => {
  await page.goto(mockupUrl);
  for (const name of ["Front", "Rear", "Side", "Exploded"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByRole("checkbox", { name: "Transparent shell" }).check();
  await page.getByRole("checkbox", { name: "Part labels" }).uncheck();
  await page.getByRole("button", { name: "Clip section", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "How the cover clip works" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Release clip", exact: true }).click();
  await expect(page.locator("#clip-caption")).toContainText("release");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const canvas = page.getByRole("img", { name: /3D case/ });
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Exploded", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("reduced motion and a narrow window retain usable controls", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(mockupUrl);
  await page
    .getByRole("button", { name: "Reset assembly", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Play assembly", exact: true })
    .click();
  await expect(
    page.getByRole("slider", { name: "Assembly progress" }),
  ).toHaveValue("5");
  await expect(page.locator("#step-title")).toHaveText("Case assembled");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("the cover is not locked before the closure step ends", async ({
  page,
}) => {
  await page.goto(mockupUrl);
  await page.getByRole("slider", { name: "Assembly progress" }).fill("4.6");
  await expect(page.locator("#step-title")).toHaveText("Close the cover");
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.locator("#step-title")).toHaveText("Case assembled");
});

test("the exploded preset exits cover access", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(mockupUrl);
  await page.getByRole("button", { name: "Open cover", exact: true }).click();
  await page.getByRole("button", { name: "Exploded", exact: true }).click();
  await expect(page.locator("#step-title")).toHaveText("Exploded parts");
  await expect(
    page.getByRole("button", { name: "Open cover", exact: true }),
  ).toBeVisible();
});

test("playback pauses and the panel occludes the hardware", async ({
  page,
}) => {
  await page.goto(mockupUrl);
  const panelPixel = await page.evaluate(() => {
    render();
    const point = project([23, 1.16, 7.57]);
    const ratio = canvas.width / canvas.clientWidth;
    const pixel = new Uint8Array(4);
    graphics.readPixels(
      Math.round(point[0] * ratio),
      canvas.height - Math.round(point[1] * ratio),
      1,
      1,
      graphics.RGBA,
      graphics.UNSIGNED_BYTE,
      pixel,
    );
    return [...pixel];
  });
  expect(panelPixel.slice(0, 3).every((channel) => channel > 220)).toBe(true);
  await page
    .getByRole("button", { name: "Play assembly", exact: true })
    .click();
  const progress = page.getByRole("slider", { name: "Assembly progress" });
  await expect
    .poll(async () => Number(await progress.inputValue()))
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Pause assembly", exact: true })
    .click();
  const pausedProgress = await progress.inputValue();
  await page.waitForTimeout(250);
  await expect(progress).toHaveValue(pausedProgress);
});

test("the copy action sends a complete brief to the clipboard", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const clipboard = {
      contents: "",
      async writeText(text) {
        this.contents = text;
      },
    };
    Object.defineProperty(navigator, "clipboard", { value: clipboard });
  });
  await page.goto(mockupUrl);
  await page
    .getByRole("button", { name: "Copy design brief", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Copied!");
  expect(await page.evaluate(() => navigator.clipboard.contents)).toContain(
    "120 × 74 × 30 mm",
  );
  expect(await page.evaluate(() => navigator.clipboard.contents)).toContain(
    "snap-fit rear cover",
  );
});

test("four release openings reach the clips through the case wall", async ({
  page,
}) => {
  await page.goto(mockupUrl);
  const releasePaths = await page.evaluate(() => {
    buildModel();
    const containsPoint = (face, horizontal, depth) => {
      const signs = face.points.map((point, index) => {
        const next = face.points[(index + 1) % face.points.length];
        return (
          (next[0] - point[0]) * (depth - point[2]) -
          (next[2] - point[2]) * (horizontal - point[0])
        );
      });
      return (
        signs.every((value) => value >= -0.00001) ||
        signs.every((value) => value <= 0.00001)
      );
    };
    const firstSurface = (horizontal, side) => {
      const surfaces = faces.filter(
        (face) =>
          Math.abs(face.normal[1]) > 0.999 &&
          Math.max(...face.points.map((point) => point[1])) -
            Math.min(...face.points.map((point) => point[1])) <
            0.001 &&
          Math.min(...face.points.map((point) => point[0])) <= horizontal &&
          Math.max(...face.points.map((point) => point[0])) >= horizontal &&
          Math.min(...face.points.map((point) => point[2])) <= -12.3 &&
          Math.max(...face.points.map((point) => point[2])) >= -12.3 &&
          containsPoint(face, horizontal, -12.3),
      );
      return Math.max(...surfaces.map((face) => face.points[0][1] * side));
    };
    return {
      shellDepth: (() => {
        const depths = faces
          .filter((face) => ["#cfdbd7", "#cad7dd"].includes(face.color))
          .flatMap((face) => face.points.map((point) => point[2]));
        return Math.max(...depths) - Math.min(...depths);
      })(),
      clips: [-37, 37].flatMap((horizontal) =>
        [-1, 1].map((side) => firstSurface(horizontal, side)),
      ),
      intactWall: firstSurface(0, 1),
    };
  });
  expect(releasePaths.clips.every((distance) => distance < 35)).toBe(true);
  expect(releasePaths.intactWall).toBe(37);
  expect(releasePaths.shellDepth).toBe(30);
  await page
    .getByRole("button", { name: "Release slots", exact: true })
    .click();
  await expect(page.locator("#step-description")).toContainText("plastic tool");
  await expect(page.locator("#step-description")).toContainText("top");
});
