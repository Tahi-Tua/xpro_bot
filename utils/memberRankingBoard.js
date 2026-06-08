const sharp = require("sharp");

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function displayName(entry) {
  return String(entry.displayName || entry.tag || entry.username || entry.userId || "Unknown")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value, maxLength = 30) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function getRowFill(rank) {
  if (rank === 1) return "#3b2f0b";
  if (rank === 2) return "#2f3440";
  if (rank === 3) return "#3a2517";
  return "#111827";
}

function buildScoreboardSvg(rankings) {
  const sorted = [...(Array.isArray(rankings) ? rankings : [])]
    .sort((a, b) => Number(b.season || 0) - Number(a.season || 0));

  const width = 980;
  const rowHeight = 54;
  const headerHeight = 220;
  const height = headerHeight + 56 + sorted.length * rowHeight + 60;

  const rows = sorted.map((entry, index) => {
    const rank = index + 1;
    const y = headerHeight + 56 + index * rowHeight;
    const name = truncateText(displayName(entry), 31);
    const score = formatNumber(entry.season);

    return `
      <rect x="24" y="${y}" width="932" height="${rowHeight - 2}" rx="14" fill="${getRowFill(rank)}" />
      <text x="52" y="${y + 35}" class="rank">#${rank}</text>
      <text x="160" y="${y + 35}" class="name">${escapeXml(name)}</text>
      <text x="902" y="${y + 35}" class="score" text-anchor="end">${escapeXml(score)}</text>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#07111f" />
      <stop offset="55%" stop-color="#0b1020" />
      <stop offset="100%" stop-color="#111827" />
    </linearGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#00f5ff" />
      <stop offset="50%" stop-color="#7c3aed" />
      <stop offset="100%" stop-color="#ffcc00" />
    </linearGradient>
    <style><![CDATA[
      .title { font: 900 56px Arial, sans-serif; letter-spacing: 6px; }
      .subtitle { font: 500 24px Arial, sans-serif; fill: #cbd5e1; }
      .head { font: 800 24px Arial, sans-serif; fill: #94a3b8; letter-spacing: 2px; }
      .rank { font: 900 25px Arial, sans-serif; fill: #e2e8f0; }
      .name { font: 800 25px Arial, sans-serif; fill: #f8fafc; }
      .score { font: 900 25px Arial, sans-serif; fill: #38bdf8; }
      .footer { font: 600 19px Arial, sans-serif; fill: #94a3b8; }
    ]]></style>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bg)" />
  <text x="490" y="88" text-anchor="middle" class="title" fill="url(#title)">TABLEAU DE SCORE</text>
  <text x="490" y="135" text-anchor="middle" class="subtitle">Classement officiel des ${sorted.length} joueurs</text>

  <rect x="24" y="178" width="932" height="52" rx="16" fill="#0f172a" />
  <text x="52" y="212" class="head">RANK</text>
  <text x="160" y="212" class="head">NOM</text>
  <text x="902" y="212" class="head" text-anchor="end">SCORE</text>

  ${rows}

  <text x="490" y="${height - 24}" text-anchor="middle" class="footer">Mise a jour du classement - ${sorted.length} joueurs</text>
</svg>`;
}

function buildScoreboardSvgBuffer(rankings) {
  return Buffer.from(buildScoreboardSvg(rankings), "utf8");
}

async function buildScoreboardPngBuffer(rankings) {
  sharp.cache(false);
  sharp.concurrency(1);
  const svgBuffer = buildScoreboardSvgBuffer(rankings);
  return sharp(svgBuffer, { density: 72 })
    .png({ compressionLevel: 6, adaptiveFiltering: false })
    .toBuffer();
}

module.exports = {
  buildScoreboardSvg,
  buildScoreboardSvgBuffer,
  buildScoreboardPngBuffer,
};
