const { Events } = require("discord.js");
const {
  classifyProjectChanges,
  detectProjectChanges,
  saveSmartSyncState,
} = require("../utils/projectSmartSync");
const { deployGuildSlashCommands } = require("../utils/slashCommandDeployer");
const { syncHeroTips } = require("./heroTips");
const { syncRulesMessage } = require("./rulesMessage");

const PROJECT_SMART_SYNC_ENABLED = (process.env.PROJECT_SMART_SYNC || "true").toLowerCase() !== "false";
const PROJECT_SMART_SYNC_DELAY_MS = Number(process.env.PROJECT_SMART_SYNC_DELAY_MS || 8000);
const PROJECT_SMART_SYNC_DEPLOY_COMMANDS = (process.env.PROJECT_SMART_SYNC_DEPLOY_COMMANDS || "true").toLowerCase() !== "false";

let smartSyncStarted = false;

function formatChangedSummary(changes) {
  return `${changes.added.length} added, ${changes.modified.length} modified, ${changes.deleted.length} deleted`;
}

async function runProjectSmartSync(client) {
  const { currentHashes, changes } = detectProjectChanges();

  if (changes.all.length === 0) {
    console.log("[ProjectSync] No project file changes detected.");
    return { changed: false };
  }

  console.log(`[ProjectSync] Detected project changes: ${formatChangedSummary(changes)}.`);

  const targets = classifyProjectChanges(changes.all);
  const tasks = [];

  if (targets.slashCommands) {
    if (PROJECT_SMART_SYNC_DEPLOY_COMMANDS) {
      tasks.push(deployGuildSlashCommands(client));
    } else {
      console.log("[ProjectSync] Slash command changes detected, auto deploy disabled.");
    }
  }

  if (targets.heroTips) {
    tasks.push(syncHeroTips(client, {
      reason: "project smart sync",
      changedPaths: targets.heroPaths,
    }));
  }

  if (targets.rulesMessage) {
    tasks.push(syncRulesMessage(client, { reason: "project smart sync" }));
  }

  if (targets.unmapped.length) {
    const preview = targets.unmapped.slice(0, 8).join(", ");
    const suffix = targets.unmapped.length > 8 ? `, +${targets.unmapped.length - 8} more` : "";
    console.log(`[ProjectSync] No Discord sync target for: ${preview}${suffix}`);
  }

  const results = await Promise.allSettled(tasks);
  const failed = results.filter((result) => result.status === "rejected");

  if (failed.length > 0) {
    failed.forEach((result) => {
      console.error("[ProjectSync] Sync task failed:", result.reason?.message || result.reason);
    });
    return { changed: true, saved: false, failed: failed.length };
  }

  await saveSmartSyncState({
    fileHashes: currentHashes,
    lastSyncedAt: new Date().toISOString(),
  });

  console.log("[ProjectSync] State updated after selective sync.");
  return { changed: true, saved: true };
}

function startProjectSmartSync(client) {
  if (!PROJECT_SMART_SYNC_ENABLED || smartSyncStarted) return;
  smartSyncStarted = true;

  setTimeout(() => {
    runProjectSmartSync(client).catch((err) => {
      console.error("[ProjectSync] Failed:", err.message);
    });
  }, PROJECT_SMART_SYNC_DELAY_MS);
}

module.exports = (client) => {
  client.on(Events.ClientReady, () => {
    startProjectSmartSync(client);
  });
};

module.exports.runProjectSmartSync = runProjectSmartSync;
module.exports.startProjectSmartSync = startProjectSmartSync;
module.exports.formatChangedSummary = formatChangedSummary;
