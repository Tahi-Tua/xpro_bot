const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LEADERBOARD_HEADERS,
  buildLeaderboardSheetRows,
  getMemberHubSheetsStatus,
  getUpcomingEventsFromGoogleSheets,
  rowsToObjects,
} = require("../utils/memberHubSheets");
const {
  base64url,
  getGoogleSheetsConfig,
  normalizePrivateKey,
} = require("../utils/googleSheetsClient");

test("memberHubSheets: builds leaderboard rows with deterministic tie ranks", () => {
  const rows = buildLeaderboardSheetRows([
    { name: "Beta", score: 20, updatedAt: Date.parse("2026-01-01T00:00:00.000Z") },
    { name: "Gamma", score: 10, updatedAt: Date.parse("2026-01-02T00:00:00.000Z") },
    { name: "Alpha", score: 20, updatedAt: Date.parse("2026-01-03T00:00:00.000Z") },
  ]);

  assert.deepEqual(rows[0], LEADERBOARD_HEADERS);
  assert.deepEqual(rows.slice(1).map((row) => [row[0], row[2], row[3]]), [
    ["Alpha", 20, 1],
    ["Beta", 20, 1],
    ["Gamma", 10, 3],
  ]);
});

test("memberHubSheets: empty leaderboard keeps only headers", () => {
  assert.deepEqual(buildLeaderboardSheetRows([]), [LEADERBOARD_HEADERS]);
});

test("memberHubSheets: reports missing Google Sheets configuration", () => {
  const status = getMemberHubSheetsStatus({});
  assert.equal(status.configured, false);
  assert.ok(status.missing.includes("GOOGLE_SHEETS_ID"));
});

test("memberHubSheets: converts sheet rows to objects", () => {
  const rows = rowsToObjects([
    ["Title", "Status"],
    ["KOTH", "planned"],
    ["", ""],
  ]);

  assert.deepEqual(rows, [{ Title: "KOTH", Status: "planned" }]);
});

test("memberHubSheets: upcoming events read skips when config is missing", async () => {
  const result = await getUpcomingEventsFromGoogleSheets({ env: {} });
  assert.equal(result.skipped, true);
  assert.deepEqual(result.events, []);
});

test("googleSheetsClient: parses service account JSON config", () => {
  const config = getGoogleSheetsConfig({
    GOOGLE_SHEETS_ID: "sheet-id",
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: "bot@example.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
    }),
  });

  assert.equal(config.configured, true);
  assert.equal(config.clientEmail, "bot@example.iam.gserviceaccount.com");
  assert.match(config.privateKey, /\nabc\n/);
});

test("googleSheetsClient: normalizes escaped private key newlines", () => {
  assert.equal(normalizePrivateKey("a\\nb"), "a\nb");
});

test("googleSheetsClient: base64url output is URL safe", () => {
  const encoded = base64url("hello?");
  assert.equal(encoded.includes("="), false);
  assert.equal(encoded.includes("+"), false);
  assert.equal(encoded.includes("/"), false);
});
