const path = require("path")
const fs = require("fs")

const toObject = process.argv[2]
if (!toObject) {
	console.error("No path arg provided")
	process.exit(1)
}

const abs = path.join(process.cwd(), toObject)

fs.rmSync(abs, { recursive: true })

console.log(`Removed ${abs}`)
