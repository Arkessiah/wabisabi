#!/usr/bin/env node
/**
 * Generate PNG icon (256x256) from SVG for VS Code Marketplace.
 *
 * Usage: node scripts/generate-icon.js
 * Requires: npm install sharp (one-time)
 *
 * If sharp is not available, uses a pure-JS approach to create
 * a simple PNG icon with the WabiSabi robot.
 */

const fs = require("fs");
const path = require("path");

const SVG_PATH = path.join(__dirname, "..", "media", "icon.svg");
const PNG_PATH = path.join(__dirname, "..", "media", "icon.png");

// ── Method 1: Convert SVG → PNG using sharp ──────────────

async function convertWithSharp() {
  try {
    const sharp = require("sharp");
    const svg = fs.readFileSync(SVG_PATH);
    await sharp(svg)
      .resize(256, 256)
      .png()
      .toFile(PNG_PATH);
    console.log(`Generated ${PNG_PATH} (256x256) from SVG`);
    return true;
  } catch (e) {
    return false;
  }
}

// ── Method 2: Generate a simple PNG programmatically ─────

function generateFallbackPng() {
  // Create a minimal 256x256 PNG with WabiSabi branding
  // Using raw PNG generation (zlib + IHDR/IDAT/IEND chunks)
  const zlib = require("zlib");
  const width = 256;
  const height = 256;

  // Create RGBA pixel data
  const pixels = Buffer.alloc(width * height * 4);

  // Background: dark gray (#1a1a2e)
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = 0x1a;     // R
    pixels[i * 4 + 1] = 0x1a; // G
    pixels[i * 4 + 2] = 0x2e; // B
    pixels[i * 4 + 3] = 0xff; // A
  }

  // Draw a simple robot face in orange (#FF6600)
  function setPixel(x, y, r, g, b) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = (y * width + x) * 4;
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = 0xff;
  }

  function fillRect(x, y, w, h, r, g, b) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        setPixel(x + dx, y + dy, r, g, b);
      }
    }
  }

  // Robot head (rounded rect) - orange
  fillRect(60, 50, 136, 100, 0xff, 0x66, 0x00);

  // Eyes - white
  fillRect(90, 80, 24, 24, 0xff, 0xff, 0xff);
  fillRect(142, 80, 24, 24, 0xff, 0xff, 0xff);

  // Pupils - dark
  fillRect(98, 88, 10, 10, 0x1a, 0x1a, 0x2e);
  fillRect(150, 88, 10, 10, 0x1a, 0x1a, 0x2e);

  // Mouth - line
  fillRect(90, 120, 76, 6, 0x1a, 0x1a, 0x2e);

  // Antenna
  fillRect(124, 30, 8, 20, 0xff, 0x66, 0x00);
  fillRect(118, 24, 20, 8, 0xff, 0x66, 0x00);

  // Body
  fillRect(80, 160, 96, 50, 0xff, 0x66, 0x00);

  // Arms
  fillRect(50, 165, 30, 12, 0xff, 0x66, 0x00);
  fillRect(176, 165, 30, 12, 0xff, 0x66, 0x00);

  // Text "WS" in white at bottom
  // (simple block letters, 4px per "pixel")
  const textY = 222;
  const s = 3; // pixel size
  // W
  fillRect(85, textY, s, s*5, 0xff, 0xff, 0xff);
  fillRect(85+s, textY+s*4, s, s, 0xff, 0xff, 0xff);
  fillRect(85+s*2, textY+s*3, s, s, 0xff, 0xff, 0xff);
  fillRect(85+s*3, textY+s*4, s, s, 0xff, 0xff, 0xff);
  fillRect(85+s*4, textY, s, s*5, 0xff, 0xff, 0xff);

  // S
  fillRect(105, textY, s*4, s, 0xff, 0xff, 0xff);
  fillRect(105, textY+s, s, s, 0xff, 0xff, 0xff);
  fillRect(105, textY+s*2, s*4, s, 0xff, 0xff, 0xff);
  fillRect(105+s*3, textY+s*3, s, s, 0xff, 0xff, 0xff);
  fillRect(105, textY+s*4, s*4, s, 0xff, 0xff, 0xff);

  // Build PNG file
  // Add filter byte (0) before each row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: none
    pixels.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  function makeChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeBuffer = Buffer.from(type, "ascii");
    const crcData = Buffer.concat([typeBuffer, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData), 0);
    return Buffer.concat([length, typeBuffer, data, crc]);
  }

  // CRC-32 table
  const crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }
  function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ -1) >>> 0;
  }

  const ihdrChunk = makeChunk("IHDR", ihdr);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  const png = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
  fs.writeFileSync(PNG_PATH, png);
  console.log(`Generated ${PNG_PATH} (256x256) - fallback pixel art`);
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const ok = await convertWithSharp();
  if (!ok) {
    console.log("sharp not available, using fallback PNG generator");
    generateFallbackPng();
  }
}

main();
