const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode-terminal/vendor/QRCode");
const QRErrorCorrectLevel = require("qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel");

const urls = ["exp://192.168.0.109:8081", "exp://192.168.0.104:8081"];

for (const url of urls) {
  const qrcode = new QRCode(-1, QRErrorCorrectLevel.L);
  qrcode.addData(url);
  qrcode.make();

  const moduleSize = 10;
  const quietZone = 4;
  const size = qrcode.getModuleCount();
  const imageSize = (size + quietZone * 2) * moduleSize;
  let rects = "";

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (qrcode.isDark(y, x)) {
        rects += `<rect x="${(x + quietZone) * moduleSize}" y="${(y + quietZone) * moduleSize}" width="${moduleSize}" height="${moduleSize}"/>`;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageSize}" height="${imageSize + 96}" viewBox="0 0 ${imageSize} ${imageSize + 96}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <g fill="#000000">${rects}</g>
  <text x="${imageSize / 2}" y="${imageSize + 34}" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#111827">Expo Go</text>
  <text x="${imageSize / 2}" y="${imageSize + 62}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#4b5563">Queue Jumper owner app</text>
  <text x="${imageSize / 2}" y="${imageSize + 84}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#6b7280">${url}</text>
</svg>`;

  const filename = `expo-go-${url.replace("exp://", "").replace(/[:.]/g, "-")}.svg`;
  const outputPath = path.resolve("qa", filename);
  fs.writeFileSync(outputPath, svg);
  console.log(outputPath);
}
