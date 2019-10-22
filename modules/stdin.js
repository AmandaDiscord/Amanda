// @ts-check

const Discord = require("discord.js")
const path = require("path")
const repl = require("repl")
const util = require("util")
const vm = require("vm")

const passthrough = require("../passthrough")
const { config, client, commands, db, reloader, reloadEvent, gameStore, queueStore, frisky, nedb, periodicHistory } = passthrough

const utils = require("../modules/utilities.js")
reloader.useSync("./modules/utilities.js", utils)

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

reloadEvent.once(path.basename(__filename), () => {
	process.exit()
})

client.once("prefixes", () => {
	if (utils.getFirstShard() === 0) {
		const cli = repl.start({ prompt: "> ", eval: customEval, writer: s => s })

		Object.assign(cli.context, passthrough, { Discord })

		cli.once("exit", () => {
			if (client.shard) client.shard.killAll()
			else process.exit()
		})
	} else console.log(`This is shard ${client.options.shards}. No REPL.`)
})
