const fs = require("fs");
const path = require("path");
const { toQR } = require("toqr");

const urls = ["exp://192.168.0.109:8081", "exp://192.168.0.104:8081"];

for (const url of urls) {
  const qr = toQR(url);
  const size = Math.sqrt(qr.length);
  const moduleSize = 10;
  const quietZone = 4;
  const imageSize = (size + quietZone * 2) * moduleSize;
  let rects = "";

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (qr[y * size + x]) {
        rects += `<rect x="${(x + quietZone) * moduleSize}" y="${(y + quietZone) * moduleSize}" width="${moduleSize}" height="${moduleSize}"/>`;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageSize}" height="${imageSize + 82}" viewBox="0 0 ${imageSize} ${imageSize + 82}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <g fill="#000000">${rects}</g>
  <text x="${imageSize / 2}" y="${imageSize + 34}" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#111827">Expo Go</text>
  <text x="${imageSize / 2}" y="${imageSize + 62}" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="#4b5563">${url}</text>
</svg>`;

  const filename = `expo-go-${url.replace("exp://", "").replace(/[:.]/g, "-")}.svg`;
  const outputPath = path.resolve("qa", filename);
  fs.writeFileSync(outputPath, svg);
  console.log(outputPath);
}
