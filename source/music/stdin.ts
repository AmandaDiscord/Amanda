/* eslint-disable @typescript-eslint/no-unused-vars */

import repl = require("repl")
import util = require("util")

import passthrough = require("../passthrough")
const { snow, config, constants, commands, sync, queues } = passthrough

const extraContext = {}

setImmediate(() => { // assign after since old extraContext data will get removed
	if (!passthrough.repl) {
		const cli = repl.start({ prompt: "", eval: customEval, writer: s => s })
		Object.assign(cli.context, extraContext, passthrough)
		passthrough.repl = cli
	} else Object.assign(passthrough.repl.context, extraContext)
})

async function customEval(input: string, _context: import("vm").Context, _filename: string, callback: (err: Error | null, result: unknown) => unknown) {
	let depth = 0
	if (input === "exit\n") return process.exit()
	if (input.startsWith(":")) {
		const depthOverwrite = input.split(" ")[0]
		depth = +depthOverwrite.slice(1)
		input = input.slice(depthOverwrite.length + 1)
	}
	let result: unknown
	try {
		result = await eval(input)
		const output = util.inspect(result, false, depth, true)
		return callback(null, output)
	} catch (e) {
		return callback(null, util.inspect(e, true, 100, true))
	}
}

sync.events.once(__filename, () => {
	for (const key in extraContext) {
		delete passthrough.repl.context[key]
	}
})
sync.addTemporaryListener(process, "exit", () => process.exit())
