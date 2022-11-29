/* eslint-disable @typescript-eslint/no-unused-vars */

import path from "path"
import repl from "repl"
import util from "util"
import fs from "fs"

import Lang from "@amanda/lang"

import passthrough from "../passthrough"
const { client, config, constants, commands, requester, sync } = passthrough

const announcement = sync.require("../commands/status") as typeof import("../commands/status")

const underscoreToEndRegex = /_\w+$/

type LocaledObject = { [locale in import("discord-typings").Locale]?: string; }

function buildCommandLanguageObject(cmd: string) {
	const rt: { name: LocaledObject; description: LocaledObject; } = { name: {}, description: {} }
	for (const key of Object.keys(Lang)) {
		const l = key as keyof typeof Lang
		const discordKey = l.replace(underscoreToEndRegex, sub => `-${sub.slice(1).toUpperCase()}`)
		const langCommandKey = cmd as Exclude<keyof import("@amanda/lang").Lang, "GLOBAL">

		rt.name[discordKey] = Lang[l][langCommandKey].name
		rt.description[discordKey] = Lang[l][langCommandKey].description
	}
	return rt
}

/* function buildOptions(cmd: string) {
	const options = commands.cache.get(cmd)!.options
	if (!options) return void 0
	const rebuilt: Array<import("discord-typings").ApplicationCommandOption> = []
	for (const option of options) {
		const rt: { description_localizations: LocaledObject; options?: Array<import("discord-typings").ApplicationCommandOption> } = { description_localizations: {} }
		for (const key of Object.keys(Lang)) {
			const l = key as keyof typeof Lang
			const langCommandKey = cmd as Exclude<keyof import("@amanda/lang").Lang, "GLOBAL">
			const langCommand = Lang[l][langCommandKey]

			if (!langCommand["options"]) {
				rebuilt.push(option) // always trust local
				continue
			}
			const extracted = langCommand as Extract<typeof langCommand, { options: Array<any> }>
			const found = extracted.options[options.indexOf(option)]

			const discordKey = l.replace(underscoreToEndRegex, sub => `-${sub.slice(1).toUpperCase()}`)
			rt.description_localizations[discordKey] = found.description
			rebuilt.push(Object.assign(rt, option))
		}
	}
	console.log(rebuilt)
	return rebuilt
}*/

function refreshcommands() {
	if (!client.ready) return console.error("Client isn't ready yet")
	const payload = [...commands.cache.values()].map(c => {
		const obj = buildCommandLanguageObject(c.name)
		return {
			name: c.name,
			description: c.description,
			name_localizations: obj.name,
			description_localizations: obj.description,
			options: c.options,
			default_member_permissions: null
		} as import("discord-typings").ApplicationCommandBase
	})
	client.snow.interaction.bulkOverwriteApplicationCommands(client.application.id, payload)
}

type NameAndDesc = { name: string; description: string; }

function generatedocs() {
	const cmds = [...commands.cache.values()].map(c => {
		const value: NameAndDesc & { options?: Array<NameAndDesc>; } = {
			name: c.name,
			description: c.description
		}
		if (c.options) value.options = c.options.map(assignOptions)
		return [c.name, value] as [string, typeof value]
	})
	const v = {} as { [name: string]: import("../types").UnpackArray<typeof cmds>["1"] }
	for (const [name, value] of cmds) v[name] = value
	fs.promises.writeFile(path.join(__dirname, "../../webroot/commands.json"), JSON.stringify(v))
}

function assignOptions(option: import("discord-typings").ApplicationCommandOption): NameAndDesc & { options?: Array<NameAndDesc> } {
	const rt: ReturnType<typeof assignOptions> = {
		name: option.name,
		description: option.description
	}
	if (option.type === 1 && option.options) rt.options = option.options.map(assignOptions)
	return rt
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

passthrough.sync.events.on(__filename, () => console.warn("stdin does not auto-reload."))

const cli = repl.start({ prompt: "", eval: customEval, writer: s => s })

Object.assign(cli.context, passthrough, { path })

cli.once("exit", () => process.exit())
