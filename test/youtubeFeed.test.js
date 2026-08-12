const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const {
  DEFAULT_YOUTUBE_CHANNEL_URL,
  extractYoutubeChannelIdFromHtml,
  fetchText,
  parseYoutubeFeed,
} = require("../utils/youtubeFeed");

function createFakeRequest(routes, calls) {
  return (url, _options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = () => request;
    request.destroy = (error) => request.emit("error", error);
    calls.push(String(url));

    process.nextTick(() => {
      const route = routes[String(url)];
      if (!route) {
        request.emit("error", new Error(`No fake route for ${url}`));
        return;
      }

      const response = new EventEmitter();
      response.statusCode = route.statusCode;
      response.headers = route.headers || {};
      response.setEncoding = () => {};
      response.resume = () => {};
      callback(response);

      if (route.statusCode >= 200 && route.statusCode < 300) {
        if (route.body) response.emit("data", route.body);
        response.emit("end");
      }
    });

    return request;
  };
}

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

test("default source uses the canonical Xavier Pro URL", () => {
  assert.equal(DEFAULT_YOUTUBE_CHANNEL_URL, "https://www.youtube.com/@xavierprobe");
});

test("fetchText follows HTTPS redirects", async () => {
  const calls = [];
  const request = createFakeRequest(
    {
      "https://youtube.com/@xavierprobe": {
        statusCode: 301,
        headers: { location: "https://www.youtube.com/@xavierprobe" },
      },
      "https://www.youtube.com/@xavierprobe": {
        statusCode: 200,
        body: '<meta itemprop="channelId" content="UC_XPRO">',
      },
    },
    calls,
  );

  const body = await fetchText("https://youtube.com/@xavierprobe", { request });
  assert.match(body, /UC_XPRO/);
  assert.deepEqual(calls, [
    "https://youtube.com/@xavierprobe",
    "https://www.youtube.com/@xavierprobe",
  ]);
});

test("fetchText rejects redirects after the configured limit", async () => {
  const request = createFakeRequest(
    {
      "https://youtube.com/@xavierprobe": {
        statusCode: 301,
        headers: { location: "https://www.youtube.com/@xavierprobe" },
      },
    },
    [],
  );

  await assert.rejects(
    fetchText("https://youtube.com/@xavierprobe", {
      redirectsRemaining: 0,
      request,
    }),
    /redirect limit/,
  );
});

test("parseYoutubeFeed: preserves Shorts entries", () => {
  const xml = `
    <feed>
      <entry>
        <yt:videoId>short123</yt:videoId>
        <title>New Short</title>
        <link rel="alternate" href="https://www.youtube.com/shorts/short123"/>
        <published>2026-08-12T10:00:00+00:00</published>
      </entry>
    </feed>
  `;

  const videos = parseYoutubeFeed(xml);
  assert.equal(videos.length, 1);
  assert.equal(videos[0].videoId, "short123");
  assert.equal(videos[0].url, "https://www.youtube.com/shorts/short123");
});
