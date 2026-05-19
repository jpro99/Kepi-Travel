import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "canvas";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const brandBackground = "#1a1a2e";
const brandCyan = "#67e8f9";
const brandText = "#f8fafc";
const brandMuted = "#cbd5e1";

async function ensureParent(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function createIcon(size) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  const padding = Math.round(size * 0.08);
  const radius = Math.round(size * 0.22);

  context.fillStyle = brandBackground;
  drawRoundedRect(context, padding, padding, size - padding * 2, size - padding * 2, radius);
  context.fill();

  const gradient = context.createRadialGradient(size * 0.35, size * 0.25, size * 0.05, size * 0.5, size * 0.5, size * 0.75);
  gradient.addColorStop(0, "rgba(103, 232, 249, 0.34)");
  gradient.addColorStop(1, "rgba(103, 232, 249, 0)");
  context.fillStyle = gradient;
  drawRoundedRect(context, padding, padding, size - padding * 2, size - padding * 2, radius);
  context.fill();

  context.fillStyle = brandCyan;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `900 ${Math.round(size * 0.62)}px Arial, Helvetica, sans-serif`;
  context.fillText("K", size / 2, size * 0.53);

  return canvas.toBuffer("image/png");
}

function createOgImage() {
  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");

  context.fillStyle = brandBackground;
  context.fillRect(0, 0, width, height);

  const gradient = context.createRadialGradient(width * 0.5, height * 0.35, 40, width * 0.5, height * 0.5, 620);
  gradient.addColorStop(0, "rgba(103, 232, 249, 0.22)");
  gradient.addColorStop(0.58, "rgba(56, 189, 248, 0.08)");
  gradient.addColorStop(1, "rgba(26, 26, 46, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const markSize = 132;
  const markX = width / 2 - markSize / 2;
  const markY = 122;
  drawRoundedRect(context, markX, markY, markSize, markSize, 34);
  context.fillStyle = "rgba(15, 23, 42, 0.72)";
  context.fill();
  context.strokeStyle = "rgba(103, 232, 249, 0.38)";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = brandCyan;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "900 86px Arial, Helvetica, sans-serif";
  context.fillText("K", width / 2, markY + markSize * 0.54);

  context.fillStyle = brandText;
  context.font = "700 104px Arial, Helvetica, sans-serif";
  context.fillText("kepi", width / 2, 360);

  context.fillStyle = brandMuted;
  context.font = "500 34px Arial, Helvetica, sans-serif";
  context.fillText("Travel that feels obvious.", width / 2, 425);
  context.fillText("From bookings to boarding, at a glance.", width / 2, 472);

  context.strokeStyle = "rgba(203, 213, 225, 0.16)";
  context.lineWidth = 2;
  drawRoundedRect(context, 48, 48, width - 96, height - 96, 42);
  context.stroke();

  return canvas.toBuffer("image/png");
}

function createIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, pngBuffer]);
}

async function writeAsset(relativePath, buffer) {
  const outputPath = resolve(rootDir, relativePath);
  await ensureParent(outputPath);
  await writeFile(outputPath, buffer);
  console.log(`generated ${relativePath}`);
}

async function main() {
  const icon192 = createIcon(192);
  const icon512 = createIcon(512);
  const favicon32 = createIcon(32);

  await writeAsset("public/icons/icon-192.png", icon192);
  await writeAsset("public/icons/icon-512.png", icon512);
  await writeAsset("public/favicon.ico", createIco(favicon32, 32));
  await writeAsset("public/apple-touch-icon.png", icon192);
  await writeAsset("public/og-image.png", createOgImage());
}

await main();
