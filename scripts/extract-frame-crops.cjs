const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  const root = process.cwd();
  const outDir = path.join(root, "public", "final-frame-assets");
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const videoPath =
    "file:///" +
    path.join(root, "public", "login-background.mp4").replace(/\\/g, "/");

  await page.setContent(`
    <html>
      <body style="margin:0;background:#000">
        <video id="v" src="${videoPath}" muted playsinline style="width:1920px;height:1080px;object-fit:cover"></video>
        <canvas id="c" width="1920" height="1080"></canvas>
      </body>
    </html>
  `);

  await page.evaluate(async () => {
    const video = document.getElementById("v");
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("video metadata failed"));
    });
    video.currentTime = Math.max(0, video.duration - 0.08);
    await new Promise((resolve) => {
      video.onseeked = resolve;
    });
    document.getElementById("c").getContext("2d").drawImage(video, 0, 0, 1920, 1080);
  });

  const fullDataUrl = await page.evaluate(() =>
    document.getElementById("c").toDataURL("image/png"),
  );
  await fs.writeFile(
    path.join(outDir, "final-frame.png"),
    Buffer.from(fullDataUrl.split(",")[1], "base64"),
  );

  const crops = [
    { name: "shard-left-top.png", x: 88, y: 62, w: 370, h: 430 },
    { name: "shard-top-mid.png", x: 500, y: 0, w: 390, h: 340 },
    { name: "shard-top-right.png", x: 1170, y: 26, w: 440, h: 250 },
    { name: "shard-right-mid.png", x: 1460, y: 292, w: 455, h: 350 },
    { name: "shard-left-bottom.png", x: 105, y: 640, w: 395, h: 440 },
    { name: "shard-bottom-right.png", x: 1310, y: 812, w: 365, h: 260 },
  ];

  const results = await page.evaluate((cropSpecs) => {
    const source = document.getElementById("c");
    return cropSpecs.map((crop) => {
      const canvas = document.createElement("canvas");
      canvas.width = crop.w;
      canvas.height = crop.h;
      const context = canvas.getContext("2d");
      context.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
      return { name: crop.name, dataUrl: canvas.toDataURL("image/png") };
    });
  }, crops);

  for (const result of results) {
    await fs.writeFile(
      path.join(outDir, result.name),
      Buffer.from(result.dataUrl.split(",")[1], "base64"),
    );
  }

  await browser.close();
  console.log(`Generated ${results.length} final-frame crops in ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
