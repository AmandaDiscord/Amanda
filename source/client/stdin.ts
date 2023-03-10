/* eslint-disable @typescript-eslint/no-unused-vars */

import path = require("path")
import repl = require("repl")
import util = require("util")
import fs = require("fs")

import Lang = require("@amanda/lang")

import passthrough = require("../passthrough")
const { client, config, constants, commands, sync } = passthrough

type LocaledObject = { [locale in import("discord-api-types/v10").LocaleString]?: string; }
type NameAndDesc = { name: string; description: string; }

const extraContext = {
	underscoreToEndRegex: /_\w+$/,
	nameRegex: /^[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u,
	buildCommandLanguageObject(cmd: string) {
		const localizations = Object.entries(Lang).map(([k, l]) => ({ lang: k.replace(extraContext.underscoreToEndRegex, sub => `-${sub.slice(1).toUpperCase()}`), cmd: l[cmd] || {} })) as Array<{ lang: string; cmd: NameAndDesc & { options?: Array<NameAndDesc & { options?: Array<NameAndDesc> }> } }>

		return {
			name_localizations: localizations.reduce((acc, cur) => {
				const toMatch = cur.cmd.name
				if (!toMatch) return acc
				const match = toMatch.match(extraContext.nameRegex)
				if (!match) {
					console.log(`${toMatch} doesn't match name regex. Ignoring`)
					return acc
				}
				const final = toMatch?.toLowerCase().trim()
				if (final !== toMatch) console.error(`${toMatch} !== ${final}`)
				acc[cur.lang] = final
				return acc
			}, {}),
			description_localizations: localizations.reduce((acc, cur) => { acc[cur.lang] = cur.cmd.description; return acc }, {})
		}
	},
	buildCommandLanguageOptions(cmd: string) {
		const command = commands.cache.get(cmd)
		if (!command || !command.options) return void 0
		const localizations = Object.entries(Lang).map(([k, l]) => ({ lang: k.replace(extraContext.underscoreToEndRegex, sub => `-${sub.slice(1).toUpperCase()}`), cmd: l[cmd] || {} })) as Array<{ lang: string; cmd: NameAndDesc & { options?: Array<NameAndDesc & { options?: Array<NameAndDesc> }> } }>

		return command.options.map((cur, ind) => Object.assign({
			name_localizations: localizations.reduce((acc, desc) => {
				const toMatch = desc.cmd.options?.[ind].name
				const match = toMatch?.match(extraContext.nameRegex)
				if (toMatch && !match) {
					console.log(`${toMatch} doesn't match name regex. Ignoring`)
					return acc
				}
				const final = toMatch?.toLowerCase().trim()
				if (final !== toMatch) console.error(`${toMatch} !== ${final}`)
				acc[desc.lang] = final
				return acc
			}, {}) as LocaledObject,
			description_localizations: localizations.reduce((acc, desc) => { acc[desc.lang] = desc.cmd.options?.[ind].description; return acc }, {}) as LocaledObject,
			options: cur.type === 1 && cur.options
				? cur.options.map((cur2, ind2) => Object.assign({
					name_localizations: localizations.reduce((acc, desc) => {
						const toMatch = desc.cmd.options![ind].options![ind2].name
						const match = toMatch.match(extraContext.nameRegex)
						if (toMatch && !match) {
							console.log(`${toMatch} doesn't match name regex. Ignoring`)
							return acc
						}
						const final = toMatch?.toLowerCase().trim()
						if (final !== toMatch) console.error(`${toMatch} !== ${final}`)
						acc[desc.lang] = final
						return acc
					}, {}) as LocaledObject,
					description_localizations: localizations.reduce((acc, desc) => { acc[desc.lang] = desc.cmd.options![ind].options![ind2].description; return acc }, {}) as LocaledObject
				}, cur2))
				: void 0
		}, cur))
	},
	refreshcommands() {
		const payload = Array.from(commands.cache.values()).map(c => {
			const obj = extraContext.buildCommandLanguageObject(c.name)
			const options = extraContext.buildCommandLanguageOptions(c.name)
			return {
				name: c.name,
				description: c.description,
				name_localizations: Object.keys(obj.name_localizations).length ? obj.name_localizations : void 0,
				description_localizations: Object.keys(obj.description_localizations).length ? obj.description_localizations : void 0,
				options: options,
				default_member_permissions: null
			}
		})
		client.snow.interaction.bulkOverwriteApplicationCommands(passthrough.configuredUserID, payload) // Amanda is a "new" account which doesn't have a different ID from the application
	},
	generatedocs() {
		const cmds = Array.from(commands.cache.values()).map(c => {
			const value: NameAndDesc & { options?: Array<NameAndDesc>; } = {
				name: c.name,
				description: c.description
			}
			if (c.options) value.options = c.options.map(extraContext.assignOptions)
			return [c.name, value] as [string, typeof value]
		})
		const v = {} as { [name: string]: import("../types").UnpackArray<typeof cmds>["1"] }
		for (const [name, value] of cmds) v[name] = value
		fs.promises.writeFile(path.join(__dirname, "../../webroot/commands.json"), JSON.stringify(v))
	},
	assignOptions(option: import("discord-api-types/v10").APIApplicationCommandOption): NameAndDesc & { options?: Array<NameAndDesc> } {
		const rt: ReturnType<typeof extraContext.assignOptions> = {
			name: option.name,
			description: option.description
		}
		if (option.type === 1 && option.options) rt.options = option.options.map(extraContext.assignOptions)
		return rt
	},
	async dropVolatile() {
		if (!config.db_enabled) return "db not enabled"
		await Promise.all([
			passthrough.db.query({ text: "DELETE FROM voice_states" }),
			passthrough.db.query({ text: "DELETE FROM guilds" })
		])
	}
}

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
