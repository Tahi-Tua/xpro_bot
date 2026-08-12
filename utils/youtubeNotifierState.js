const YOUTUBE_VIDEO_ID_PATTERNS = [
  /youtube\.com\/watch\?[^\s#]*?\bv=([A-Za-z0-9_-]+)/gi,
  /youtube\.com\/shorts\/([A-Za-z0-9_-]+)/gi,
  /youtu\.be\/([A-Za-z0-9_-]+)/gi,
];

function buildYoutubeAnnouncement(videoUrl) {
  return `@here A new video has been released, go check it out\n${videoUrl}`;
}

function extractYoutubeVideoIds(content = "") {
  const ids = new Set();

  for (const pattern of YOUTUBE_VIDEO_ID_PATTERNS) {
    for (const match of String(content).matchAll(pattern)) {
      if (match[1]) ids.add(match[1]);
    }
  }

  return ids;
}

function selectVideosForAnnouncement(videos, seenVideoIds, options = {}) {
  const { firstRun = false, firstRunLimit = 1 } = options;
  const safeLimit = Math.max(1, Number(firstRunLimit) || 1);
  const candidates = firstRun ? videos.slice(0, safeLimit) : videos;

  return candidates
    .filter((video) => video?.videoId && !seenVideoIds.has(video.videoId))
    .reverse();
}

module.exports = {
  buildYoutubeAnnouncement,
  extractYoutubeVideoIds,
  selectVideosForAnnouncement,
};
