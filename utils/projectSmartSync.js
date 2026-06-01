const crypto = require("crypto");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const stateFile = path.join(projectRoot, "data/projectSmartSyncState.json");

const WATCH_DIRS = [
  "commands",
  "config",
  "handlers",
  "utils",
  "attached_assets",
  "data/heroes",
];

const WATCH_FILES = [
  "index.js",
  "deploy-commands.js",
  "package.json",
];

const ALLOWED_EXTENSIONS = new Set([
  ".js",
  ".json",
  ".md",
  ".txt",
  ".yml",
  ".yaml",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
]);

const IGNORE_PATTERNS = [
  /(^|[\\/])node_modules([\\/]|$)/,
  /(^|[\\/])\.git([\\/]|$)/,
  /(^|[\\/])data[\\/](?!heroes[\\/])/,
  /\.sqlite(?:-.+)?$/i,
  /\.log$/i,
  /package-lock\.json$/i,
];

let projectSyncSaveQueue = Promise.resolve();

function normalizeStateKey(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function toStateKey(filePath) {
  return normalizeStateKey(path.relative(projectRoot, filePath));
}

function fromStateKey(stateKey) {
  return path.join(projectRoot, stateKey);
}

function shouldIgnore(filePath) {
  const normalized = normalizeStateKey(filePath);
  return IGNORE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isAllowedProjectFile(filePath) {
  if (shouldIgnore(filePath)) return false;
  return ALLOWED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function walkFiles(dir, output) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (shouldIgnore(fullPath)) continue;

    if (entry.isDirectory()) {
      walkFiles(fullPath, output);
      continue;
    }

    if (entry.isFile() && isAllowedProjectFile(fullPath)) {
      output.push(fullPath);
    }
  }
}

function listProjectFiles() {
  const files = [];

  for (const dir of WATCH_DIRS) {
    walkFiles(path.join(projectRoot, dir), files);
  }

  for (const file of WATCH_FILES) {
    const fullPath = path.join(projectRoot, file);
    if (fs.existsSync(fullPath) && isAllowedProjectFile(fullPath)) {
      files.push(fullPath);
    }
  }

  return Array.from(new Set(files.map((file) => path.resolve(file))))
    .sort((a, b) => toStateKey(a).localeCompare(toStateKey(b)));
}

function hashFile(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function loadSmartSyncState() {
  try {
    if (!fs.existsSync(stateFile)) return { fileHashes: {} };
    const data = fs.readFileSync(stateFile, "utf8");
    if (!data.trim()) return { fileHashes: {} };
    return JSON.parse(data);
  } catch (err) {
    console.warn("[ProjectSync] Could not load state:", err.message);
    return { fileHashes: {} };
  }
}

function saveSmartSyncState(state) {
  projectSyncSaveQueue = projectSyncSaveQueue
    .then(async () => {
      await fsPromises.mkdir(path.dirname(stateFile), { recursive: true });
      const tempFile = `${stateFile}.tmp`;
      await fsPromises.writeFile(tempFile, JSON.stringify(state, null, 2), "utf8");
      await fsPromises.rename(tempFile, stateFile);
    })
    .catch((err) => {
      console.warn("[ProjectSync] Could not save state:", err.message);
    });

  return projectSyncSaveQueue;
}

function detectProjectChanges() {
  const state = loadSmartSyncState();
  const previousHashes = state.fileHashes || {};
  const currentHashes = {};

  for (const filePath of listProjectFiles()) {
    currentHashes[toStateKey(filePath)] = hashFile(filePath);
  }

  const added = [];
  const modified = [];
  const deleted = [];

  for (const [stateKey, hash] of Object.entries(currentHashes)) {
    if (!previousHashes[stateKey]) {
      added.push(stateKey);
    } else if (previousHashes[stateKey] !== hash) {
      modified.push(stateKey);
    }
  }

  for (const stateKey of Object.keys(previousHashes)) {
    if (!currentHashes[stateKey]) {
      deleted.push(stateKey);
    }
  }

  return {
    state,
    currentHashes,
    changes: {
      added,
      modified,
      deleted,
      all: [...added, ...modified, ...deleted],
      firstRun: Object.keys(previousHashes).length === 0,
    },
  };
}

function classifyProjectChanges(changedStateKeys) {
  const changed = new Set(changedStateKeys.map(normalizeStateKey));
  const startsWithAny = (prefixes) =>
    Array.from(changed).some((stateKey) => prefixes.some((prefix) => stateKey.startsWith(prefix)));
  const hasAny = (files) => files.some((file) => changed.has(file));

  const heroStateKeys = Array.from(changed).filter((stateKey) =>
    stateKey.startsWith("config/heroes/") ||
    stateKey.startsWith("data/heroes/") ||
    stateKey === "handlers/heroTips.js" ||
    stateKey === "config/channels.js"
  );

  const rulesStateKeys = Array.from(changed).filter((stateKey) =>
    stateKey === "config/rules-content.js" ||
    stateKey === "handlers/rulesMessage.js" ||
    stateKey === "config/channels.js" ||
    stateKey.startsWith("attached_assets/rules")
  );

  return {
    slashCommands: startsWithAny(["commands/"]) || hasAny(["deploy-commands.js", "utils/slashCommandDeployer.js"]),
    heroTips: heroStateKeys.length > 0,
    heroPaths: heroStateKeys
      .filter((stateKey) => stateKey.startsWith("config/heroes/") || stateKey.startsWith("data/heroes/"))
      .map(fromStateKey),
    rulesMessage: rulesStateKeys.length > 0,
    unmapped: Array.from(changed).filter((stateKey) =>
      !stateKey.startsWith("commands/") &&
      !stateKey.startsWith("config/heroes/") &&
      !stateKey.startsWith("data/heroes/") &&
      stateKey !== "handlers/heroTips.js" &&
      stateKey !== "handlers/rulesMessage.js" &&
      stateKey !== "config/rules-content.js" &&
      stateKey !== "config/channels.js" &&
      !stateKey.startsWith("attached_assets/rules") &&
      stateKey !== "deploy-commands.js" &&
      stateKey !== "utils/slashCommandDeployer.js"
    ),
  };
}

module.exports = {
  projectRoot,
  stateFile,
  WATCH_DIRS,
  WATCH_FILES,
  classifyProjectChanges,
  detectProjectChanges,
  fromStateKey,
  isAllowedProjectFile,
  listProjectFiles,
  loadSmartSyncState,
  saveSmartSyncState,
  toStateKey,
};
