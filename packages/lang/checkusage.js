const fs = require("fs")
const path = require("path")

const english = require("@amanda/lang").en_us

const paths = [
	"commands/src",
	"runtime-website/src/music",
	"runtime-worker/src",
	"shared-utils/src"
]

/** @param {string} dir */
function recurse(dir) {
	const dirs = fs.readdirSync(dir)
	const stats = dirs.map(d => fs.statSync(path.join(dir, d)))

	for (let index = 0; index < stats.length; index++) {
		const stat = stats[index]
		const toObject = dirs[index]

		if (stat.isDirectory()) recurse(path.join(dir, toObject))
		else if (stat.isFile()) processFile(path.join(dir, toObject))
	}
}

const globalRegex = /\.GLOBAL\.(\w+)/g

const found = []
const exclude = [ // These are definitely used in Amanda but the regex cannot pick up due to dynamic key usage
	"LOOP_ON",
	"LOOP_OFF",
	"QUEUE_PAUSED",
	"QUEUE_UNPAUSED",

	"HUG_AMANDA",
	"NOM_AMANDA",
	"KISS_AMANDA",
	"CUDDLE_AMANDA",
	"POKE_AMANDA",
	"SLAP_AMANDA",
	"BOOP_AMANDA",
	"PAT_AMANDA",

	"HUG_OTHER",
	"NOM_OTHER",
	"KISS_OTHER",
	"CUDDLE_OTHER",
	"POKE_OTHER",
	"SLAP_OTHER",
	"BOOP_OTHER",
	"PAT_OTHER"
]

/** @param {string} file */
function processFile(file) {
	const data = fs.readFileSync(file, { encoding: "utf8" })

	const modReferences = data.matchAll(globalRegex)

	for (const match of modReferences) {
		if (!found.includes(match[1])) found.push(match[1])
	}
}

for (const dir of paths) {
	recurse(path.join(__dirname, "../", dir))
}

for (const key of Object.keys(english.GLOBAL)) {
	if (!found.includes(key) && !exclude.includes(key)) console.log(`${key} not found in usages`)
}

console.log("Done with usage checking")
process.exit()
