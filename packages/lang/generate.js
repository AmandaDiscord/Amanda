const fs = require("fs")
const path = require("path")

const outDir = path.join(__dirname)

const en_us = require("./localizations/en-us.json")

const langs = fs.readdirSync(path.join(__dirname, "./localizations"))
const langNames = langs.map(i => i.replace(/\.json$/, "").replace("-", "_"))

const totalDTSString = langNames.map(i => `export const ${i}: Lang`).join("\n")
	+ `\n\nexport type Lang = ${JSON.stringify(en_us, null, "\t")}\n`

fs.writeFileSync(`${outDir}/index.d.ts`, totalDTSString, { encoding: "utf8" })

const totalIndexString = "const sync = require(\"@amanda/sync\")\nmodule.exports = {\n"
	+ langNames.map((i, ind) => `\t${i}: sync.require("./localizations/${langs[ind]}")`).join(",\n")
	+ "\n}\n"

fs.writeFileSync(`${outDir}/index.js`, totalIndexString, { encoding: "utf8" })

console.log("Generated lang docs")
