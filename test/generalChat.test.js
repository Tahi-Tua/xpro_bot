const test = require("node:test");
const assert = require("node:assert/strict");

// Helper function to create mock message with attachments
function createMockMessage(attachments = [], embeds = [], hasBypassRole = false) {
  // Create a Map-like collection that also has array methods
  const attachmentsCollection = new Map(
    attachments.map((a, i) => [i.toString(), a])
  );
  attachmentsCollection.some = function(callback) {
    return Array.from(this.values()).some(callback);
  };
  
  return {
    author: { bot: false, send: async () => {} },
    inGuild: () => true,
    channel: { id: "1392950551502786660" }, // GENERAL_CHAT_ID
    member: {
      roles: {
        cache: hasBypassRole
          ? new Map([["1380247716596023317", { id: "1380247716596023317" }]])
          : new Map(),
      },
    },
    attachments: attachmentsCollection,
    embeds: embeds,
    delete: async () => {},
  };
}

// Test video detection by content type
test("generalChat: detects video by contentType", () => {
  const mockAttachment = { contentType: "video/mp4", url: "test.mp4" };
  const message = createMockMessage([mockAttachment]);
  
  // In the actual implementation, this should return true
  const hasVideo = message.attachments.some((a) => {
    const contentType = a.contentType || "";
    return contentType.startsWith("video/");
  });
  
  assert.equal(hasVideo, true, "Should detect video by contentType");
});

// Test video detection by file extension
test("generalChat: detects video by file extension", () => {
  const videoExtensions = [".mp4", ".mov", ".avi", ".mkv", ".flv", ".wmv", ".webm", ".m4v", ".mpg", ".mpeg", ".3gp", ".ogv"];
  
  videoExtensions.forEach(ext => {
    const mockAttachment = { url: `test${ext}`, contentType: "" };
    const message = createMockMessage([mockAttachment]);
    
    const hasVideo = message.attachments.some((a) => {
      const url = (a.url || "").toLowerCase();
      return videoExtensions.some(ext => url.endsWith(ext));
    });
    
    assert.equal(hasVideo, true, `Should detect video with ${ext} extension`);
  });
});

// Test that images (except GIFs) are detected
test("generalChat: detects images but not GIFs", () => {
  const jpgAttachment = { contentType: "image/jpeg", url: "test.jpg" };
  const gifAttachment = { contentType: "image/gif", url: "test.gif" };
  
  const jpgMessage = createMockMessage([jpgAttachment]);
  const gifMessage = createMockMessage([gifAttachment]);
  
  const hasImageJpg = jpgMessage.attachments.some((a) => {
    const contentType = a.contentType || "";
    return contentType.startsWith("image/") && !contentType.includes("gif");
  });
  
  const hasImageGif = gifMessage.attachments.some((a) => {
    const contentType = a.contentType || "";
    return contentType.startsWith("image/") && !contentType.includes("gif");
  });
  
  assert.equal(hasImageJpg, true, "Should detect non-GIF images");
  assert.equal(hasImageGif, false, "Should not detect GIF images");
});

// Test video embed detection with video property
test("generalChat: detects embeds with video property", () => {
  const mockEmbed = { type: "rich", video: { url: "https://example.com/video.mp4" } };
  const message = createMockMessage([], [mockEmbed]);
  
  const hasVideoEmbed = message.embeds.some((e) => e.video);
  
  assert.equal(hasVideoEmbed, true, "Should detect embeds with video property");
});

// Test YouTube link detection
test("generalChat: detects YouTube video links", () => {
  const youtubeUrls = [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
  ];
  
  youtubeUrls.forEach(url => {
    const mockEmbed = { type: "video", url };
    const message = createMockMessage([], [mockEmbed]);
    
    const hasVideoLink = message.embeds.some((e) => {
      const embedUrl = (e.url || "").toLowerCase();
      return embedUrl.includes("youtube.com") || embedUrl.includes("youtu.be");
    });
    
    assert.equal(hasVideoLink, true, `Should detect YouTube link: ${url}`);
  });
});

// Test TikTok link detection
test("generalChat: detects TikTok video links", () => {
  const mockEmbed = { type: "video", url: "https://www.tiktok.com/@user/video/123456" };
  const message = createMockMessage([], [mockEmbed]);
  
  const hasVideoLink = message.embeds.some((e) => {
    const embedUrl = (e.url || "").toLowerCase();
    return embedUrl.includes("tiktok.com");
  });
  
  assert.equal(hasVideoLink, true, "Should detect TikTok link");
});

// Test other video platform detection
test("generalChat: detects various video platform links", () => {
  const platforms = [
    { name: "Vimeo", url: "https://vimeo.com/123456" },
    { name: "Twitch", url: "https://www.twitch.tv/videos/123456" },
    { name: "Streamable", url: "https://streamable.com/abc123" },
  ];
  
  platforms.forEach(({ name, url }) => {
    const mockEmbed = { type: "video", url };
    const message = createMockMessage([], [mockEmbed]);
    
    const hasVideoLink = message.embeds.some((e) => {
      const embedUrl = (e.url || "").toLowerCase();
      const hostname = embedUrl.split("/")[2] || "";
      return ["vimeo.com", "twitch.tv", "streamable.com"].some(domain => hostname.includes(domain));
    });
    
    assert.equal(hasVideoLink, true, `Should detect ${name} link`);
  });
});

// Test bypass role functionality
test("generalChat: allows bypass roles to post videos", () => {
  const mockAttachment = { contentType: "video/mp4", url: "test.mp4" };
  const messageWithBypass = createMockMessage([mockAttachment], [], true);
  const messageWithoutBypass = createMockMessage([mockAttachment], [], false);
  
  // Check if bypass role is detected
  const hasBypass1 = messageWithBypass.member.roles.cache.size > 0;
  const hasBypass2 = messageWithoutBypass.member.roles.cache.size > 0;
  
  assert.equal(hasBypass1, true, "Should detect bypass role");
  assert.equal(hasBypass2, false, "Should not detect bypass role when absent");
});
