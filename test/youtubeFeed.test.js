const test = require("node:test");
const assert = require("node:assert/strict");

const { extractYoutubeChannelIdFromHtml, parseYoutubeFeed } = require("../utils/youtubeFeed");

test("parseYoutubeFeed: extracts video entries", () => {
  const xml = `
    <feed>
      <entry>
        <yt:videoId>abc123</yt:videoId>
        <title>New &amp; Cool Video</title>
        <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/>
        <published>2026-05-12T10:00:00+00:00</published>
      </entry>
    </feed>
  `;

  const videos = parseYoutubeFeed(xml);
  assert.equal(videos.length, 1);
  assert.equal(videos[0].videoId, "abc123");
  assert.equal(videos[0].title, "New & Cool Video");
  assert.equal(videos[0].url, "https://www.youtube.com/watch?v=abc123");
});

test("extractYoutubeChannelIdFromHtml: resolves channel id from handle page html", () => {
  const html = `
    <html>
      <head>
        <meta itemprop="channelId" content="UC1234567890abcdef">
        <link rel="canonical" href="https://www.youtube.com/channel/UC1234567890abcdef">
      </head>
    </html>
  `;

  assert.equal(extractYoutubeChannelIdFromHtml(html), "UC1234567890abcdef");
});
