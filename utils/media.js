const path = require("path");

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".webm",
  ".mkv",
  ".avi",
  ".wmv",
  ".flv",
  ".m4v",
  ".3gp",
  ".3g2",
  ".mpg",
  ".mpeg",
  ".ogv",
  ".asf",
  ".divx",
  ".f4v",
  ".m1v",
  ".m2v",
  ".m2ts",
  ".mpe",
  ".mxf",
  ".ogm",
  ".rm",
  ".rmvb",
  ".ts",
  ".vob",
  ".mts",
]);

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
  ".gif",
]);

function getAttachmentExtension(att) {
  const source = att?.name || att?.url || "";
  const clean = source.split("?")[0].split("#")[0];
  return path.extname(clean).toLowerCase();
}

function isVideoAttachment(att) {
  const contentType = (att?.contentType || "").toLowerCase();
  if (contentType.startsWith("video/")) return true;

  const ext = getAttachmentExtension(att);
  return VIDEO_EXTENSIONS.has(ext);
}

function isImageAttachment(att, options = {}) {
  const { allowGif = true } = options;
  const contentType = (att?.contentType || "").toLowerCase();

  if (contentType.startsWith("image/")) {
    if (!allowGif && contentType.includes("gif")) return false;
    return true;
  }

  const ext = getAttachmentExtension(att);
  if (!IMAGE_EXTENSIONS.has(ext)) return false;
  if (!allowGif && ext === ".gif") return false;
  return true;
}

module.exports = {
  isVideoAttachment,
  isImageAttachment,
};
