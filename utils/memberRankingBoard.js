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

function truncate(value, max = 30) {
  const text = displayName({ displayName: value });
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function rowClass(rank) {
  if (rank === 1) return "url(#top1)";
  if (rank === 2) return "url(#top2)";
  if (rank === 3) return "url(#top3)";
  return "rgba(15,23,42,0.35)";
}

function rankLabel(rank) {
  if (rank === 1) return "🥇 #1";
  if (rank === 2) return "🥈 #2";
  if (rank === 3) return "🥉 #3";
  return `#${rank}`;
}

function buildScoreboardSvg(rankings) {
  const entries = Array.isArray(rankings) ? rankings : [];
  const sorted = [...entries].sort((a, b) => Number(b.season || 0) - Number(a.season || 0));
  const width = 1080;
  const rowHeight = 64;
  const headerHeight = 252;
  const tableTop = 282;
  const footerHeight = 90;
  const height = tableTop + 58 + sorted.length * rowHeight + footerHeight;

  const rows = sorted.map((entry, index) => {
    const rank = index + 1;
    const y = tableTop + 58 + index * rowHeight;
    const score = formatNumber(entry.season);
    return `
      <g>
        <rect x="0" y="${y}" width="1080" height="${rowHeight}" fill="${rowClass(rank)}" stroke="rgba(148,163,184,0.10)" />
        <text x="34" y="${y + 40}" class="rank">${escapeXml(rankLabel(rank))}</text>
        <text x="182" y="${y + 40}" class="name">${escapeXml(truncate(displayName(entry), 32))}</text>
        <rect x="870" y="${y + 16}" width="154" height="36" rx="18" fill="rgba(56,189,248,0.15)" stroke="rgba(56,189,248,0.35)" />
        <text x="948" y="${y + 40}" class="score" text-anchor="middle">${escapeXml(score)}</text>
      </g>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="pageBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#07111f" />
      <stop offset="55%" stop-color="#0b1020" />
      <stop offset="100%" stop-color="#111827" />
    </linearGradient>
    <radialGradient id="glowA" cx="0" cy="0" r="1">
      <stop offset="0%" stop-color="rgba(0,255,200,0.45)" />
      <stop offset="100%" stop-color="rgba(0,255,200,0)" />
    </radialGradient>
    <radialGradient id="glowB" cx="1" cy="1" r="1">
      <stop offset="0%" stop-color="rgba(120,80,255,0.50)" />
      <stop offset="100%" stop-color="rgba(120,80,255,0)" />
    </radialGradient>
    <linearGradient id="titleGradient" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#00f5ff" />
      <stop offset="50%" stop-color="#7c3aed" />
      <stop offset="100%" stop-color="#ffcc00" />
    </linearGradient>
    <linearGradient id="tableHeader" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>
    <linearGradient id="top1" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(255,215,0,0.24)" />
      <stop offset="100%" stop-color="rgba(15,23,42,0.35)" />
    </linearGradient>
    <linearGradient id="top2" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(192,192,192,0.20)" />
      <stop offset="100%" stop-color="rgba(15,23,42,0.35)" />
    </linearGradient>
    <linearGradient id="top3" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(205,127,50,0.22)" />
      <stop offset="100%" stop-color="rgba(15,23,42,0.35)" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="24" stdDeviation="22" flood-color="rgba(0,0,0,0.45)" />
    </filter>
    <style><![CDATA[
      .title { font: 900 72px "Segoe UI", Arial, sans-serif; letter-spacing: 10px; }
      .subtitle { font: 500 28px "Segoe UI", Arial, sans-serif; fill: #cbd5e1; }
      .head { font: 800 28px "Segoe UI", Arial, sans-serif; fill: #94a3b8; letter-spacing: 3px; }
      .rank { font: 900 31px "Segoe UI", Arial, sans-serif; fill: #e2e8f0; }
      .name { font: 800 30px "Segoe UI", Arial, sans-serif; fill: #f8fafc; }
      .score { font: 900 30px "Segoe UI", Arial, sans-serif; fill: #38bdf8; }
      .footer { font: 600 22px "Segoe UI", Arial, sans-serif; fill: #94a3b8; }
    ]]></style>
  </defs>

  <rect width="1080" height="${height}" fill="url(#pageBg)" />
  <circle cx="0" cy="0" r="440" fill="url(#glowA)" />
  <circle cx="1080" cy="${height}" r="520" fill="url(#glowB)" />

  <text x="540" y="106" text-anchor="middle" class="title" fill="url(#titleGradient)">TABLEAU DE SCORE</text>
  <text x="540" y="164" text-anchor="middle" class="subtitle">Classement officiel des ${sorted.length} joueurs</text>

  <g filter="url(#shadow)">
    <rect x="24" y="224" width="1032" height="${height - 280}" rx="26" fill="rgba(15,23,42,0.78)" stroke="rgba(148,163,184,0.25)" />
    <rect x="24" y="224" width="1032" height="58" rx="26" fill="url(#tableHeader)" />
    <rect x="24" y="254" width="1032" height="28" fill="url(#tableHeader)" />

    <text x="34" y="263" class="head">RANK</text>
    <text x="182" y="263" class="head">NOM</text>
    <text x="930" y="263" class="head" text-anchor="middle">SCORE</text>

    <g transform="translate(24,0)">
      ${rows}
    </g>
  </g>

  <text x="540" y="${height - 32}" text-anchor="middle" class="footer">Mise à jour du classement • ${sorted.length} joueurs</text>
</svg>`;
}

function buildScoreboardSvgBuffer(rankings) {
  return Buffer.from(buildScoreboardSvg(rankings), "utf8");
}

module.exports = {
  buildScoreboardSvg,
  buildScoreboardSvgBuffer,
};
