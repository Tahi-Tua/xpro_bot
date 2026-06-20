const test = require("node:test");
const assert = require("node:assert/strict");
const {
  loadSeasonRankings,
  parseSeasonRankings,
  toSafeSeason,
} = require("../utils/memberRankingSeasons");
const { loadSlashCommandPayloads } = require("../utils/slashCommandDeployer");

test("memberRankingSeasons: loads and ranks an existing season", () => {
  const rankings = parseSeasonRankings({
    seasons: {
      27: [
        { name: "Beta", score: 20 },
        { name: "Alpha", score: 20 },
        { name: "Gamma", score: 10 },
      ],
    },
  }, 27);

  assert.deepEqual(rankings, [
    { name: "Alpha", score: 20, rank: 1 },
    { name: "Beta", score: 20, rank: 1 },
    { name: "Gamma", score: 10, rank: 3 },
  ]);
});

test("memberRankingSeasons: ignores entries without name or valid score", () => {
  const rankings = parseSeasonRankings({
    seasons: {
      27: [
        { name: "", score: 100 },
        { name: "Valid", score: 50.9 },
        { name: "NoScore" },
        { name: "BadScore", score: "abc" },
        { name: "Negative", score: -1 },
      ],
    },
  }, "27");

  assert.deepEqual(rankings, [
    { name: "Valid", score: 50, rank: 1 },
  ]);
});

test("memberRankingSeasons: returns empty rankings for a missing season", () => {
  assert.deepEqual(parseSeasonRankings({ seasons: { 27: [] } }, 999), []);
});

test("memberRankingSeasons: validates season numbers", () => {
  assert.equal(toSafeSeason(27), "27");
  assert.equal(toSafeSeason("27"), "27");
  assert.equal(toSafeSeason(0), null);
  assert.equal(toSafeSeason("abc"), null);
});

test("memberRankingSeasons: can load from provided data", async () => {
  const result = await loadSeasonRankings(27, {
    data: {
      seasons: {
        27: [{ name: "Alpha", score: 10 }],
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.season, "27");
  assert.equal(result.source, "provided data");
  assert.deepEqual(result.rankings, [{ name: "Alpha", score: 10, rank: 1 }]);
});

test("slash commands: ranking has season subcommand with required integer option", () => {
  const ranking = loadSlashCommandPayloads().find((command) => command.name === "ranking");
  const subcommand = ranking.options.find((option) => option.name === "season");
  const seasonOption = subcommand.options.find((option) => option.name === "season");

  assert.equal(subcommand.type, 1);
  assert.equal(seasonOption.type, 4);
  assert.equal(seasonOption.required, true);
  assert.equal(seasonOption.min_value, 1);
});
