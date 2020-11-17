// @ts-check

const path = require("path")
const repl = require("repl")
const util = require("util")
const vm = require("vm")

const passthrough = require("../passthrough")
const { config, db, ipc, pugCache, sassCache, snow, wss } = passthrough

const utils = require("./utilities.js")

async function friendlySaveQueues(callback) {
	process.stdout.write("Saving... ")
	const results = await ipc.replier.requestSaveQueues()
	process.stdout.write("done.\nEach shard updated this many documents:\n")
	process.stdout.write(JSON.stringify(results)+"\n")
	process.stdout.write("You may now end the shard processes.")
	callback(undefined, "")
}

/**
 * @param {string} input
 * @param {vm.Context} context
 * @param {string} filename
 * @param {(err: Error|null, result: any) => any} callback
 */
async function customEval(input, context, filename, callback) {
	let depth = 0
	if (input == "save\n") return friendlySaveQueues(callback)
	if (input == "exit\n") return process.exit()
	if (input.startsWith(":")) {
		const splitPoint = input.indexOf(" ")
		depth = +input.slice(0, splitPoint)
		input = input.slice(splitPoint+1)
	}
	const result = await eval(input)
	const output = util.inspect(result, false, depth, true)
	return callback(undefined, output)
}

const cli = repl.start({ prompt: "> ", eval: customEval, writer: s => s })

cli.once("exit", () => process.exit())
