// @ts-check

const Discord = require("discord.js")
const path = require("path")
const repl = require("repl")
const util = require("util")
const vm = require("vm")

const passthrough = require("../passthrough")
const { config, db, ipc, pugCache, sassCache, snow, wss } = passthrough

const utils = require("./utilities.js")

/**
 * @param {string} input
 * @param {vm.Context} context
 * @param {string} filename
 * @param {(err: Error|null, result: any) => any} callback
 */
async function customEval(input, context, filename, callback) {
	let depth = 0
	if (input == "exit\n") return process.exit()
	if (input.startsWith(":")) {
		const [depthOverwrite, command] = input.split(" ")
		depth = +depthOverwrite.slice(1)
		input = command
	}
	const result = await eval(input)
	const output = util.inspect(result, false, depth, true)
	return callback(undefined, output)
}

const cli = repl.start({ prompt: "> ", eval: customEval, writer: s => s })

cli.once("exit", () => process.exit())
