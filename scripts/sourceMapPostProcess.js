const fs = require("node:fs")
const path = require("node:path")

const oneLineCommentRegex = /\t* *\/\/.+\n?/g
const multiLineCommentRegex = /\t*\/\*\*[\S\s]+?\*\/\n?/gm

const toSrcMapPath = path.join(process.cwd(), process.argv[2])

/** @type {{ version: number, sources: Array<string>, names: Array<string>, mappings: Array<string>, sourcesContent: Array<string> }} */
const srcMap = JSON.parse(fs.readFileSync(toSrcMapPath, { encoding: "utf8" }))

/** @type {Array<string>} */
const newContent = []

for (const content of srcMap.sourcesContent) {
	const removed = content.replaceAll(multiLineCommentRegex, match => "\r\n".repeat(match.split("\n").length - 1)).replaceAll(oneLineCommentRegex, "")
	newContent.push(removed)
}

srcMap.sourcesContent = newContent

fs.writeFileSync(toSrcMapPath, JSON.stringify(srcMap))
const stat = fs.statSync(toSrcMapPath)
console.log(`Done removing comments from src maps. New sourcemap size: ${(stat.size / 1024).toFixed(2)} KB`)
