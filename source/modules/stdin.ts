import Discord from "thunderstorm"
import path from "path"
import repl from "repl"
import util from "util"

import passthrough from "../passthrough"

import logger from "../utils/logger"

async function customEval(input: string, context: import("vm").Context, filename: string, callback: (err: Error | null, result: unknown) => unknown) {
	let depth = 0
	if (input == "exit\n") return process.exit()
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
		return callback(e, undefined)
	}
}

passthrough.sync.events.on(__filename, () => logger.warn("stdin does not auto-reload."))

const cli = repl.start({ prompt: "> ", eval: customEval, writer: s => s })

Object.assign(cli.context, passthrough, { Discord, path })

cli.once("exit", () => {
	process.exit()
})
