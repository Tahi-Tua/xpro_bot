const path = require("path");
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      args: [
        ...chromium.args,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--single-process",
      ],
      defaultViewport: {
        width: 1080,
        height: 1920,
        deviceScaleFactor: 1,
      },
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || await chromium.executablePath(),
      headless: chromium.headless,
    }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }

  return browserPromise;
}

async function buildLeaderboardScreenshotBuffer(options = {}) {
  const rosterUrl = options.rosterUrl || process.env.MEMBER_RANKING_ROSTER_URL || "https://raw.githubusercontent.com/Tahi-Tua/xpro_bot/main/data/memberRankingRoster.json";
  const htmlPath = path.join(__dirname, "..", "public", "leaderboard-xpro.html");
  const pageUrl = `file://${htmlPath}?roster=${encodeURIComponent(rosterUrl)}`;

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({
      width: 1080,
      height: 1920,
      deviceScaleFactor: 1,
    });

    await page.goto(pageUrl, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    await page.evaluate(() => document.fonts && document.fonts.ready);

    const element = await page.$("#leaderboardCanvas");
    if (!element) {
      throw new Error("leaderboard canvas not found");
    }

    return await element.screenshot({
      type: "png",
      omitBackground: false,
    });
  } finally {
    await page.close().catch(() => null);
  }
}

async function closeLeaderboardBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  if (browser) await browser.close().catch(() => null);
}

module.exports = {
  buildLeaderboardScreenshotBuffer,
  closeLeaderboardBrowser,
};
