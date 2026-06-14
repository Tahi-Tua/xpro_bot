const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const WIDTH = 1200;
const HEIGHT = 1500;
const ROW_HEIGHT = 175;
const TABLE_X = 32;
const TABLE_Y = 350;
const TABLE_WIDTH = WIDTH - TABLE_X * 2;
const HEADER_HEIGHT = 125;
const fontDir = path.join(__dirname, "../assets/fonts");
const fontFileNames = [
  "NotoSans.ttf",
  "NotoSansDevanagariUI-Regular.ttf",
  "NotoSansSymbols2-Regular.ttf",
  "NotoSansCanadianAboriginal-Regular.ttf",
  "NotoSansCherokee.ttf",
  "NotoSansYi-Regular.ttf",
  "NotoSansTaiViet-Regular.ttf",
  "NotoSansTaiLe-Regular.ttf",
  "NotoSansLimbu-Regular.ttf",
  "NotoSansSylotiNagri-Regular.ttf",
  "NotoSerifTibetan-Regular.ttf",
];

function getLeaderboardFontFiles() {
  return fontFileNames
    .map((fileName) => path.join(fontDir, fileName))
    .filter((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).size > 0);
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncateName(name, maxLength = 24) {
  const value = String(name || "Unknown").trim();
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function formatScore(score) {
  return Math.max(0, Number(score) || 0).toLocaleString("en-US").replace(/,/g, "");
}

function buildRows(entries) {
  const rows = entries.slice(0, 5);
  while (rows.length < 5) {
    rows.push({ name: "-", score: 0, empty: true });
  }
  return rows;
}

function rowOverlay(rank) {
  if (rank === 1) return "url(#goldRow)";
  if (rank === 2) return "url(#silverRow)";
  if (rank === 3) return "url(#bronzeRow)";
  return "rgba(10, 16, 34, 0.68)";
}

function medalMarkup(rank, x, y) {
  const colors = {
    1: ["#f5c542", "#8b5cf6"],
    2: ["#cfd8e3", "#64748b"],
    3: ["#d18b5b", "#a85532"],
  };
  const color = colors[rank];
  if (!color) return "";

  return `
    <g>
      <path d="M${x - 19} ${y - 24} L${x - 5} ${y + 3} L${x - 20} ${y + 3} L${x - 34} ${y - 24} Z" fill="${color[1]}" opacity="0.95" />
      <path d="M${x + 19} ${y - 24} L${x + 5} ${y + 3} L${x + 20} ${y + 3} L${x + 34} ${y - 24} Z" fill="${color[1]}" opacity="0.95" />
      <circle cx="${x}" cy="${y + 16}" r="23" fill="${color[0]}" stroke="#f9fafb" stroke-width="3" />
      <circle cx="${x}" cy="${y + 16}" r="15" fill="none" stroke="#111827" stroke-width="3" opacity="0.55" />
      <text x="${x}" y="${y + 25}" text-anchor="middle" class="medal-number">${rank}</text>
    </g>
  `;
}

function renderLeaderboardSvg(entries, options = {}) {
  const title = escapeXml(options.title || "XPRO MEMBER");
  const subtitle = escapeXml(options.subtitle || "Ranking of the 5 best contributors");
  const footer = escapeXml(options.footer || "Official ranking update");
  const rows = buildRows(entries);

  const rowMarkup = rows.map((entry, index) => {
    const rank = index + 1;
    const y = TABLE_Y + HEADER_HEIGHT + ROW_HEIGHT * index;
    const name = escapeXml(truncateName(entry.name));
    const score = escapeXml(formatScore(entry.score));
    const opacity = entry.empty ? "0.45" : "1";

    return `
      <g opacity="${opacity}">
        <rect x="${TABLE_X}" y="${y}" width="${TABLE_WIDTH}" height="${ROW_HEIGHT}" fill="${rowOverlay(rank)}" />
        <line x1="${TABLE_X}" y1="${y}" x2="${TABLE_X + TABLE_WIDTH}" y2="${y}" stroke="#23304a" stroke-width="2" opacity="0.75" />
        ${medalMarkup(rank, 112, y + 68)}
        <text x="${rank <= 3 ? 138 : 76}" y="${y + 105}" class="rank">#${rank}</text>
        <text x="275" y="${y + 105}" class="name">${name}</text>
        <rect x="902" y="${y + 44}" width="188" height="88" rx="44" fill="#18304a" stroke="#3e6c90" stroke-width="3" />
        <text x="996" y="${y + 101}" text-anchor="middle" class="score">${score}</text>
      </g>
    `;
  }).join("");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#071f22" />
      <stop offset="0.52" stop-color="#07111f" />
      <stop offset="1" stop-color="#111427" />
    </linearGradient>
    <radialGradient id="glowLeft" cx="0.07" cy="0.03" r="0.5">
      <stop offset="0" stop-color="#19f5cf" stop-opacity="0.28" />
      <stop offset="1" stop-color="#19f5cf" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="glowRight" cx="0.92" cy="0.92" r="0.55">
      <stop offset="0" stop-color="#7c3aed" stop-opacity="0.42" />
      <stop offset="1" stop-color="#7c3aed" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="titleGradient" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#50d9ff" />
      <stop offset="0.48" stop-color="#7c4dff" />
      <stop offset="1" stop-color="#f2b84b" />
    </linearGradient>
    <linearGradient id="tableHeader" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#121a31" />
      <stop offset="1" stop-color="#1b253d" />
    </linearGradient>
    <linearGradient id="goldRow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#595d1f" stop-opacity="0.82" />
      <stop offset="0.42" stop-color="#222822" stop-opacity="0.76" />
      <stop offset="1" stop-color="#0b1020" stop-opacity="0.78" />
    </linearGradient>
    <linearGradient id="silverRow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#334052" stop-opacity="0.84" />
      <stop offset="0.45" stop-color="#151b31" stop-opacity="0.78" />
      <stop offset="1" stop-color="#0b1020" stop-opacity="0.78" />
    </linearGradient>
    <linearGradient id="bronzeRow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#442d2c" stop-opacity="0.86" />
      <stop offset="0.45" stop-color="#1a1724" stop-opacity="0.78" />
      <stop offset="1" stop-color="#0b1020" stop-opacity="0.78" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="26" stdDeviation="26" flood-color="#000000" flood-opacity="0.42" />
    </filter>
    <style>
      .title { font-family: "Noto Sans", sans-serif; font-size: 92px; font-weight: 900; letter-spacing: 4px; }
      .subtitle { font-family: "Noto Sans", "Noto Sans Symbols 2", sans-serif; font-size: 42px; fill: #d6deeb; }
      .header { font-family: "Noto Sans", sans-serif; font-size: 34px; font-weight: 900; letter-spacing: 11px; fill: #b8c2d4; }
      .rank { font-family: "Noto Sans", sans-serif; font-size: 52px; font-weight: 900; fill: #f3f7ff; }
      .medal-number { font-family: "Noto Sans", sans-serif; font-size: 23px; font-weight: 900; fill: #111827; }
      .name { font-family: "Noto Sans", "Noto Sans Devanagari UI", "Noto Serif Tibetan", "Noto Sans Canadian Aboriginal", "Noto Sans Cherokee", "Noto Sans Yi", "Noto Sans Tai Viet", "Noto Sans Tai Le", "Noto Sans Limbu", "Noto Sans Syloti Nagri", "Noto Sans Symbols 2", sans-serif; font-size: 48px; font-weight: 850; fill: #ffffff; }
      .score { font-family: "Noto Sans", sans-serif; font-size: 44px; font-weight: 900; fill: #58caff; }
      .footer { font-family: "Noto Sans", "Noto Sans Symbols 2", sans-serif; font-size: 40px; fill: #9aa3b4; }
    </style>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glowLeft)" />
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glowRight)" />

  <text x="${WIDTH / 2}" y="145" text-anchor="middle" class="title" fill="url(#titleGradient)">${title}</text>
  <text x="${WIDTH / 2}" y="250" text-anchor="middle" class="subtitle">${subtitle}</text>

  <g filter="url(#shadow)">
    <clipPath id="tableClip">
      <rect x="${TABLE_X}" y="${TABLE_Y}" width="${TABLE_WIDTH}" height="${HEADER_HEIGHT + ROW_HEIGHT * 5}" rx="55" />
    </clipPath>
    <rect x="${TABLE_X}" y="${TABLE_Y}" width="${TABLE_WIDTH}" height="${HEADER_HEIGHT + ROW_HEIGHT * 5}" rx="55" fill="#0f172a" stroke="#243148" stroke-width="2" />
    <g clip-path="url(#tableClip)">
      <rect x="${TABLE_X}" y="${TABLE_Y}" width="${TABLE_WIDTH}" height="${HEADER_HEIGHT}" fill="url(#tableHeader)" />
      <text x="76" y="${TABLE_Y + 78}" class="header">RANK</text>
      <text x="275" y="${TABLE_Y + 78}" class="header">NOM</text>
      <text x="956" y="${TABLE_Y + 78}" class="header">SCORE</text>
      ${rowMarkup}
    </g>
  </g>

  <text x="${WIDTH / 2}" y="1422" text-anchor="middle" class="footer">${footer}</text>
</svg>`;
}

function renderLeaderboardPng(entries, options = {}) {
  const svg = renderLeaderboardSvg(entries, options);
  const renderer = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: WIDTH,
    },
    font: {
      fontFiles: getLeaderboardFontFiles(),
      loadSystemFonts: false,
      defaultFontFamily: "Noto Sans",
    },
  });

  return renderer.render().asPng();
}

module.exports = {
  formatScore,
  getLeaderboardFontFiles,
  renderLeaderboardPng,
  renderLeaderboardSvg,
};
