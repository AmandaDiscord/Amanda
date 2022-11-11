/* eslint-disable @typescript-eslint/no-unused-vars */

import path from "path"
import repl from "repl"
import util from "util"
import fs from "fs"

import passthrough from "../passthrough"
const { client, config, constants, commands, requester, sync } = passthrough

import logger from "../utils/logger"

const announcement = sync.require("../commands/status") as typeof import("../commands/status")

function refreshcommands() {
	if (!client.ready) return logger.error("Client isn't ready yet")
	client.snow.interaction.bulkOverwriteApplicationCommands(client.application.id, [...commands.cache.values()].map(c => ({
		name: c.name,
		description: c.description,
		options: c.options,
		default_member_permissions: null
	})))
}

function generatedocs() {
	const cmds = [...commands.cache.values()].map(c => {
		const value = {
			name: c.name,
			description: c.description
		} as { name: string; description: string; options?: Array<{ name: string; description: string; }> }
		if (c.options) value.options = c.options.map(o => ({ name: o.name, description: o.description }))
		return [c.name, value] as [string, typeof value]
	})
	const v = [] as Array<import("../types").UnpackArray<typeof cmds>["1"]>
	for (const [_, value] of cmds) v.push(value)
	fs.promises.writeFile(path.join(__dirname, "../../webroot/commands.json"), JSON.stringify(v))
}

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
		return callback(e, undefined)
	}
}

passthrough.sync.events.on(__filename, () => logger.warn("stdin does not auto-reload."))

const cli = repl.start({ prompt: "", eval: customEval, writer: s => s })

Object.assign(cli.context, passthrough, { path })

cli.once("exit", () => process.exit())
