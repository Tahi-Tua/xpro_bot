const https = require("https");

const YOUTUBE_FEED_BASE_URL = "https://www.youtube.com/feeds/videos.xml";
const DEFAULT_YOUTUBE_CHANNEL_URL = "https://www.youtube.com/@xavierprobe";
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = Number(process.env.YOUTUBE_REQUEST_TIMEOUT_MS || 10000);
let cachedFeedUrl = null;

function hasYoutubeFeedSource() {
  return Boolean(
    process.env.XPRO_YOUTUBE_FEED_URL ||
      process.env.XPRO_YOUTUBE_CHANNEL_ID ||
      process.env.XPRO_YOUTUBE_CHANNEL_URL ||
      DEFAULT_YOUTUBE_CHANNEL_URL,
  );
}

async function getYoutubeFeedUrl() {
  if (cachedFeedUrl) return cachedFeedUrl;

  if (process.env.XPRO_YOUTUBE_FEED_URL) {
    cachedFeedUrl = process.env.XPRO_YOUTUBE_FEED_URL;
    return cachedFeedUrl;
  }

  if (process.env.XPRO_YOUTUBE_CHANNEL_ID) {
    cachedFeedUrl = `${YOUTUBE_FEED_BASE_URL}?channel_id=${encodeURIComponent(process.env.XPRO_YOUTUBE_CHANNEL_ID)}`;
    return cachedFeedUrl;
  }

  const channelUrl = process.env.XPRO_YOUTUBE_CHANNEL_URL || DEFAULT_YOUTUBE_CHANNEL_URL;
  const channelId = await resolveYoutubeChannelId(channelUrl);
  if (!channelId) {
    throw new Error(`Could not resolve YouTube channel ID from ${channelUrl}`);
  }

  cachedFeedUrl = `${YOUTUBE_FEED_BASE_URL}?channel_id=${encodeURIComponent(channelId)}`;
  return cachedFeedUrl;
}

function fetchText(url, options = {}) {
  const {
    redirectsRemaining = MAX_REDIRECTS,
    request = https.get,
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = options;

  return new Promise((resolve, reject) => {
    const requestHandle = request(
      url,
      { headers: { "User-Agent": "xpro-bot/1.0" } },
      (response) => {
        const statusCode = Number(response.statusCode || 0);
        const location = response.headers?.location;

        if (statusCode >= 300 && statusCode < 400 && location) {
          response.resume();
          if (redirectsRemaining <= 0) {
            reject(new Error("YouTube request exceeded the redirect limit"));
            return;
          }

          let redirectUrl;
          try {
            redirectUrl = new URL(location, url);
          } catch {
            reject(new Error(`YouTube returned an invalid redirect URL: ${location}`));
            return;
          }

          if (redirectUrl.protocol !== "https:") {
            reject(new Error(`Refusing non-HTTPS YouTube redirect: ${redirectUrl}`));
            return;
          }

          resolve(
            fetchText(redirectUrl.toString(), {
              redirectsRemaining: redirectsRemaining - 1,
              request,
              timeoutMs,
            }),
          );
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`YouTube request returned HTTP ${statusCode}`));
          return;
        }

        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve(body));
      },
    );

    requestHandle.setTimeout?.(timeoutMs, () => {
      requestHandle.destroy(new Error(`YouTube request timed out after ${timeoutMs}ms`));
    });
    requestHandle.on("error", reject);
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

async function fetchLatestYoutubeVideos(feedUrl = null) {
  const resolvedFeedUrl = feedUrl || await getYoutubeFeedUrl();
  if (!resolvedFeedUrl) return [];

  const xml = await fetchText(resolvedFeedUrl);
  return parseYoutubeFeed(xml);
}

module.exports = {
  DEFAULT_YOUTUBE_CHANNEL_URL,
  extractYoutubeChannelIdFromHtml,
  fetchLatestYoutubeVideos,
  fetchText,
  getYoutubeFeedUrl,
  hasYoutubeFeedSource,
  parseYoutubeFeed,
  resolveYoutubeChannelId,
};
