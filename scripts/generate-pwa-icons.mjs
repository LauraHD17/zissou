// Generates the PWA icon set from an inline SVG (own-ship motif: orange
// triangle + yellow-green ring on navy — matches the chart marker).
// Run: node scripts/generate-pwa-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#142038"/>
  <circle cx="256" cy="272" r="150" fill="none" stroke="#CCFF00" stroke-width="14" opacity="0.55"/>
  <path d="M256 96 L364 388 L256 328 L148 388 Z" fill="#FF6B35" stroke="#CCFF00" stroke-width="14" stroke-linejoin="miter"/>
</svg>`;

mkdirSync('public/icons', { recursive: true });
const src = Buffer.from(SVG);
await sharp(src).resize(192, 192).png().toFile('public/icons/icon-192.png');
await sharp(src).resize(512, 512).png().toFile('public/icons/icon-512.png');
await sharp(src).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png');
console.log('wrote public/icons/{icon-192,icon-512,apple-touch-icon}.png');
