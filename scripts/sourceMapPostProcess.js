const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")

const toSrcMapPath = path.join(process.cwd(), process.argv[2])

/**
 * Collect the exact [pos, end) ranges of every comment in a source text using TypeScript's parser.
 * Every comment lives in the leading trivia of some token (including the end-of-file token),
 * so walking all tokens and asking for their leading comment ranges finds all of them.
 * Unlike a regex approach, this can never mistake // or /* inside strings, template literals
 * or regex literals for a comment.
 * @param {string} sourceText
 * @param {string} fileName
 * @returns {Array<{ pos: number, end: number }>}
 */
function collectCommentRanges(sourceText, fileName) {
	const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, fileName.endsWith(".js") ? ts.ScriptKind.JS : ts.ScriptKind.TS)
	/** @type {Map<number, number>} */
	const ranges = new Map() // keyed by pos to dedupe, since ancestor nodes share their first token's trivia

	/** @param {import("typescript").Node} node */
	const visit = node => {
		// getLeadingCommentRanges only returns comments after the first line break past fullStart;
		// comments on the same line as the previous token are "trailing" trivia, so ask for both
		for (const getRanges of [ts.getLeadingCommentRanges, ts.getTrailingCommentRanges]) {
			const found = getRanges(sourceText, node.getFullStart())
			if (found) {
				for (const range of found) {
					ranges.set(range.pos, range.end)
				}
			}
		}
		for (const child of node.getChildren(sourceFile)) {
			visit(child)
		}
	}
	visit(sourceFile)

	return Array.from(ranges.entries(), ([pos, end]) => ({ pos, end })).sort((a, b) => a.pos - b.pos)
}

/**
 * Remove all comments from a source text while keeping its line structure byte-identical
 * (every line terminator a comment spanned is kept), so the sourcemap's line/column
 * mappings into this text stay correct.
 * @param {string} sourceText
 * @param {string} fileName
 * @returns {string}
 */
function stripComments(sourceText, fileName) {
	let result = ""
	let lastIndex = 0
	for (const { pos, end } of collectCommentRanges(sourceText, fileName)) {
		result += sourceText.slice(lastIndex, pos)
		result += sourceText.slice(pos, end).replace(/[^\r\n]+/g, "") // keep only the line terminators
		lastIndex = end
	}
	result += sourceText.slice(lastIndex)

	// Collapse the whitespace left behind on lines that were comment-only
	return result.replace(/^[ \t]+$/gm, "")
}

/**
 * @param {string} text
 * @returns {number}
 */
function countLines(text) {
	return text.split(/\r\n|\r|\n/).length
}

function main() {
	/** @type {{ version: number, sources: Array<string>, names: Array<string>, mappings: string, sourcesContent: Array<string | null> }} */
	const srcMap = JSON.parse(fs.readFileSync(toSrcMapPath, { encoding: "utf8" }))

	srcMap.sourcesContent = srcMap.sourcesContent.map((content, index) => {
		if (content == null) return content // the spec allows sources without embedded content
		const fileName = srcMap.sources[index] ?? "source.ts"
		const stripped = stripComments(content, fileName)

		// The mappings encode line/column positions into this text; a changed line count means they now lie
		if (countLines(stripped) !== countLines(content)) {
			throw new Error(`Stripping comments changed the line count of ${fileName} (${countLines(content)} -> ${countLines(stripped)}), which would corrupt the sourcemap`)
		}
		return stripped
	})

	fs.writeFileSync(toSrcMapPath, JSON.stringify(srcMap))
	const stat = fs.statSync(toSrcMapPath)
	console.log(`Done removing comments from src maps. New sourcemap size: ${(stat.size / 1024).toFixed(2)} KB`)
}

if (require.main === module) main()

module.exports = { stripComments, countLines }
