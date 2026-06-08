const { AttachmentBuilder } = require("discord.js");
const sharp = require("sharp");
const { formatNumber } = require("./memberRankingEmbed");

const WIDTH = 1000;
const HEIGHT = 1000;
const ROW_HEIGHT = 108;
const ROW_GAP = 18;
const START_Y = 315;

function escapeXml(value) {
  return String(value || "")
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

function truncateName(name, max = 18) {
  const clean = displayName({ displayName: name });
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function medalColor(index) {
  return ["#FFD54A", "#D7E1F2", "#F29B4B"][index] || "#FFFFFF";
}

function rankBadge(index) {
  const rank = index + 1;
  const fill = index === 0 ? "#FFD54A" : index === 1 ? "#D7E1F2" : index === 2 ? "#F29B4B" : "#FFB129";
  return `
    <circle cx="${rank < 10 ? 0 : 0}" cy="0" r="0" fill="transparent"/>
    <text x="112" y="${START_Y + index * (ROW_HEIGHT + ROW_GAP) + 68}" text-anchor="middle" font-family="Arial Black, Arial" font-size="46" fill="${fill}">${rank}.</text>
  `;
}

function avatarPlaceholder(index, cx, cy) {
  const fill = medalColor(index);
  return `
    <circle cx="${cx}" cy="${cy}" r="36" fill="${fill}" opacity="0.95"/>
    <circle cx="${cx}" cy="${cy - 10}" r="12" fill="#FFFFFF" opacity="0.95"/>
    <path d="M ${cx - 22} ${cy + 23} C ${cx - 14} ${cy - 2}, ${cx + 14} ${cy - 2}, ${cx + 22} ${cy + 23} Z" fill="#FFFFFF" opacity="0.95"/>
  `;
}

function buildSvg(rankings) {
  const rows = rankings.slice(0, 5).map((entry, index) => {
    const y = START_Y + index * (ROW_HEIGHT + ROW_GAP);
    const name = escapeXml(truncateName(displayName(entry), 20).toUpperCase());
    const season = escapeXml(formatNumber(entry.season));
    const scoreColor = index === 0 ? "#FFF3A6" : "#FFFFFF";

    return `
      <g filter="url(#softShadow)">
        <rect x="92" y="${y}" width="816" height="${ROW_HEIGHT}" rx="36" fill="#1D2382" opacity="0.96"/>
        <rect x="92" y="${y}" width="816" height="${ROW_HEIGHT}" rx="36" fill="url(#rowGlow)" opacity="0.35"/>
      </g>
      ${rankBadge(index)}
      ${avatarPlaceholder(index, 196, y + 54)}
      <text x="260" y="${y + 68}" font-family="Arial Black, Arial" font-size="36" fill="#FFFFFF" letter-spacing="2">${name}</text>
      <text x="850" y="${y + 68}" text-anchor="end" font-family="Arial Black, Arial" font-size="42" fill="${scoreColor}" letter-spacing="1">${season}</text>
    `;
  }).join("\n");

  return `
  <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#5D1FB6"/>
        <stop offset="0.5" stop-color="#7B2DD7"/>
        <stop offset="1" stop-color="#401183"/>
      </linearGradient>
      <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#FFB020"/>
        <stop offset="1" stop-color="#FF8A00"/>
      </linearGradient>
      <linearGradient id="rowGlow" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#2834C8"/>
        <stop offset="1" stop-color="#11165F"/>
      </linearGradient>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#170049" flood-opacity="0.45"/>
      </filter>
      <pattern id="bricks" width="80" height="40" patternUnits="userSpaceOnUse">
        <rect x="0" y="0" width="42" height="8" rx="4" fill="#FFFFFF" opacity="0.08"/>
        <rect x="48" y="20" width="42" height="8" rx="4" fill="#FFFFFF" opacity="0.08"/>
      </pattern>
    </defs>

    <rect width="1000" height="1000" fill="transparent"/>
    <g filter="url(#softShadow)">
      <rect x="110" y="120" width="780" height="780" rx="32" fill="url(#bg)" stroke="#2A0767" stroke-width="8"/>
      <rect x="110" y="120" width="780" height="780" rx="32" fill="url(#bricks)"/>
    </g>

    <rect x="280" y="66" width="440" height="92" rx="34" fill="url(#title)" filter="url(#softShadow)"/>
    <text x="500" y="124" text-anchor="middle" font-family="Arial Black, Arial" font-size="44" fill="#FFFFFF" letter-spacing="2">LEADERBOARD</text>

    <circle cx="352" cy="210" r="43" fill="#145DDB" stroke="#69B9FF" stroke-width="4"/>
    <circle cx="500" cy="200" r="68" fill="#145DDB" stroke="#69B9FF" stroke-width="5"/>
    <circle cx="648" cy="210" r="43" fill="#145DDB" stroke="#69B9FF" stroke-width="4"/>
    <circle cx="500" cy="184" r="18" fill="#FFFFFF"/>
    <path d="M462 244 C472 210, 528 210, 538 244 Z" fill="#FFFFFF"/>
    <circle cx="352" cy="198" r="13" fill="#FFFFFF"/>
    <path d="M326 234 C334 210, 370 210, 378 234 Z" fill="#FFFFFF"/>
    <circle cx="648" cy="198" r="13" fill="#FFFFFF"/>
    <path d="M622 234 C630 210, 666 210, 674 234 Z" fill="#FFFFFF"/>

    ${rows}

    <rect x="430" y="890" width="140" height="48" rx="24" fill="#FFB020"/>
    <text x="500" y="923" text-anchor="middle" font-family="Arial Black, Arial" font-size="26" fill="#281044">XPRO</text>
  </svg>`;
}

async function buildMemberRankingImage(rankings) {
  const svg = buildSvg(rankings || []);
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return new AttachmentBuilder(buffer, { name: "xpro-season-leaderboard.png" });
}

module.exports = {
  buildMemberRankingImage,
};
