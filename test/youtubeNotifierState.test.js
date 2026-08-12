const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildYoutubeAnnouncement,
  extractYoutubeVideoIds,
  selectVideosForAnnouncement,
} = require("../utils/youtubeNotifierState");

test("buildYoutubeAnnouncement mentions only active members with @here", () => {
  assert.equal(
    buildYoutubeAnnouncement("https://www.youtube.com/shorts/latest"),
    "@here A new video has been released, go check it out\nhttps://www.youtube.com/shorts/latest",
  );
  assert.equal(buildYoutubeAnnouncement("https://youtu.be/latest").includes("@everyone"), false);
});

const videos = [
  { videoId: "newest", url: "https://www.youtube.com/shorts/newest" },
  { videoId: "middle", url: "https://www.youtube.com/watch?v=middle" },
  { videoId: "oldest", url: "https://youtu.be/oldest" },
];

test("extractYoutubeVideoIds recognizes videos and Shorts", () => {
  const ids = extractYoutubeVideoIds(`
    https://www.youtube.com/watch?v=video123
    https://www.youtube.com/shorts/short123
    https://youtu.be/brief123
  `);

  assert.deepEqual([...ids], ["video123", "short123", "brief123"]);
});

test("first activation announces only the latest unseen publication", () => {
  const selected = selectVideosForAnnouncement(videos, new Set(), {
    firstRun: true,
    firstRunLimit: 1,
  });

  assert.deepEqual(selected.map((video) => video.videoId), ["newest"]);
});

test("first activation does not announce an older item when latest is already in Discord", () => {
  const selected = selectVideosForAnnouncement(videos, new Set(["newest"]), {
    firstRun: true,
    firstRunLimit: 1,
  });

  assert.deepEqual(selected, []);
});

test("normal checks announce every unseen item from oldest to newest", () => {
  const selected = selectVideosForAnnouncement(videos, new Set(["oldest"]));
  assert.deepEqual(selected.map((video) => video.videoId), ["middle", "newest"]);
});
