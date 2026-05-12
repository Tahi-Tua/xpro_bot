const fs = require("fs");
const path = require("path");

const heroes = [];
const heroesDir = __dirname;

const files = fs.readdirSync(heroesDir).filter(
  (file) => file.endsWith(".js") && file !== "index.js"
).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

for (const file of files) {
  try {
    const hero = require(path.join(heroesDir, file));
    if (!hero?.id || !hero?.name || !hero?.tips) {
      console.warn(`[Heroes] Skipping ${file}: missing id, name, or tips.`);
      continue;
    }
    heroes.push(hero);
  } catch (err) {
    console.warn(`[Heroes] Skipping ${file}: ${err.message}`);
  }
}

module.exports = heroes;
