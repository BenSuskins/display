const { defineConfig } = require("playwright/test");
const os = require("node:os");
const path = require("node:path");

module.exports = defineConfig({
  testDir: __dirname,
  outputDir: path.join(os.tmpdir(), "display-case-mockup-tests"),
  use: { channel: "chrome", viewport: { width: 1440, height: 1000 } },
});
