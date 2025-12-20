const fs = require("fs");
const path = require("path");

const heroes = [];
const heroesDir = __dirname;

const files = fs.readdirSync(heroesDir).filter(
  (file) => file.endsWith(".js") && file !== "index.js"
);

for (const file of files) {
  const hero = require(path.join(heroesDir, file));
  heroes.push(hero);
}

module.exports = heroes;
