const fs = require("fs")
const path = require("path")

const outDir = path.join(__dirname)

const en_us = require("./localizations/en-us.json")

const langs = fs.readdirSync(path.join(__dirname, "./localizations"))

const totalString = `${langs.map(i => `export const ${i.replace(/\.json$/, "").replace("-", "_")}: Lang`).join("\n")}`
	+ `\n\nexport type Lang = ${JSON.stringify(en_us, null, "\t")}\n`

fs.writeFileSync(`${outDir}/index.d.ts`, totalString, { encoding: "utf8" })

console.log("Generated lang docs")
