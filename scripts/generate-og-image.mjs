import { writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const WIDTH = 1200;
const HEIGHT = 630;
const outputPath = new URL("../public/og-image.png", import.meta.url);

async function generateOgImage() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    await page.setContent("<canvas id='og' width='1200' height='630'></canvas>");
    const imageDataUrl = await page.evaluate(() => {
      const canvas = document.getElementById("og");
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Canvas element not found.");
      }
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("2D canvas context unavailable.");
      }

      context.fillStyle = "#0f172a";
      context.fillRect(0, 0, canvas.width, canvas.height);

      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, "rgba(34, 211, 238, 0.2)");
      gradient.addColorStop(1, "rgba(56, 189, 248, 0.05)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.fillStyle = "#22d3ee";
      context.font = "700 34px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      context.fillText("Kepi Travel Assistant", 86, 245);

      context.fillStyle = "#e2e8f0";
      context.font = "600 66px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      context.fillText("Never miss a flight.", 86, 340);
      context.fillText("Never lose a reservation.", 86, 420);

      context.fillStyle = "#94a3b8";
      context.font = "500 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      context.fillText("Adaptive trip execution from packing to landing", 86, 500);

      context.strokeStyle = "rgba(148, 163, 184, 0.35)";
      context.lineWidth = 2;
      context.strokeRect(56, 56, canvas.width - 112, canvas.height - 112);

      return canvas.toDataURL("image/png");
    });
    const base64Data = imageDataUrl.split(",")[1] ?? "";
    await writeFile(outputPath, Buffer.from(base64Data, "base64"));
  } finally {
    await browser.close();
  }
}

generateOgImage();
