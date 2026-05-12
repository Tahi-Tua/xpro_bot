const https = require("https");

const YOUTUBE_FEED_BASE_URL = "https://www.youtube.com/feeds/videos.xml";
const DEFAULT_YOUTUBE_CHANNEL_URL = "https://www.youtube.com/@SirGenix";
let cachedFeedUrl = null;

function hasYoutubeFeedSource() {
  return Boolean(
    process.env.YOUTUBE_FEED_URL ||
      process.env.YOUTUBE_CHANNEL_ID ||
      process.env.YOUTUBE_CHANNEL_URL ||
      DEFAULT_YOUTUBE_CHANNEL_URL,
  );
}

async function getYoutubeFeedUrl() {
  if (cachedFeedUrl) return cachedFeedUrl;
  if (process.env.YOUTUBE_FEED_URL) return process.env.YOUTUBE_FEED_URL;
  if (process.env.YOUTUBE_CHANNEL_ID) {
    cachedFeedUrl = `${YOUTUBE_FEED_BASE_URL}?channel_id=${encodeURIComponent(process.env.YOUTUBE_CHANNEL_ID)}`;
    return cachedFeedUrl;
  }

  const channelUrl = process.env.YOUTUBE_CHANNEL_URL || DEFAULT_YOUTUBE_CHANNEL_URL;
  const channelId = await resolveYoutubeChannelId(channelUrl);
  if (!channelId) return null;

  cachedFeedUrl = `${YOUTUBE_FEED_BASE_URL}?channel_id=${encodeURIComponent(channelId)}`;
  return cachedFeedUrl;
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "xpro-bot/1.0" } }, (response) => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          reject(new Error(`YouTube feed returned HTTP ${response.statusCode}`));
          return;
        }

        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve(body));
      })
      .on("error", reject);
  });
}

function decodeXml(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
}

function extractYoutubeChannelIdFromHtml(html) {
  const patterns = [
    /<meta[^>]+itemprop=["']channelId["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']channelId["']/i,
    /"channelId"\s*:\s*"([^"]+)"/i,
    /youtube\.com\/channel\/([^"'?&/<>\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeXml(match[1]);
  }

  return null;
}

async function resolveYoutubeChannelId(channelUrl) {
  const html = await fetchText(channelUrl);
  return extractYoutubeChannelIdFromHtml(html);
}

function parseYoutubeFeed(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entryXml = match[1];
    const videoId = extractTag(entryXml, "yt:videoId");
    if (!videoId) continue;

    const linkMatch = entryXml.match(/<link[^>]+href="([^"]+)"/i);
    entries.push({
      videoId,
      title: extractTag(entryXml, "title"),
      url: linkMatch ? decodeXml(linkMatch[1]) : `https://www.youtube.com/watch?v=${videoId}`,
      publishedAt: extractTag(entryXml, "published"),
      updatedAt: extractTag(entryXml, "updated"),
    });
  }

  return entries;
}

async function fetchLatestYoutubeVideos() {
  const feedUrl = await getYoutubeFeedUrl();
  if (!feedUrl) return [];

  const xml = await fetchText(feedUrl);
  return parseYoutubeFeed(xml);
}

module.exports = {
  DEFAULT_YOUTUBE_CHANNEL_URL,
  extractYoutubeChannelIdFromHtml,
  fetchLatestYoutubeVideos,
  getYoutubeFeedUrl,
  hasYoutubeFeedSource,
  parseYoutubeFeed,
  resolveYoutubeChannelId,
};
