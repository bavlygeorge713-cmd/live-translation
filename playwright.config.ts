import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  retries: 0,
  use: {
    headless: true,
    screenshot: "on",
    video: "retain-on-failure",
    // Auto-grant mic permission and provide a fake audio stream so getUserMedia
    // succeeds without a real microphone. The Web Speech API is mocked separately.
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } } },
    { name: "mobile",  use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } } },
  ],
  reporter: [["list"], ["html", { open: "never", outputFolder: "tests/report" }]],
});
