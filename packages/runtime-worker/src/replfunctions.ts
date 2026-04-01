import Lang = require("@amanda/lang")

import type { APIApplicationCommandOption, Locale } from "discord-api-types/v10"

import passthrough = require("./passthrough")
const { client, confprovider, commands } = passthrough

type LocaledObject = { [locale in Locale]?: string; }
type NameAndDesc = { name: string; description: string; }

const extraContext = {
	underscoreToEndRegex: /_\w+$/,
	nameRegex: /^[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u,
	buildCommandLanguageObject(command: { name: string }): { name_localizations: LocaledObject; description_localizations: LocaledObject } {
		const localizations = Object.entries(Lang).map(([k, l]) => ({
			lang: k.replace(extraContext.underscoreToEndRegex, sub => `-${sub.slice(1).toUpperCase()}`), cmd: l[command.name as keyof typeof l] ?? {}
		})) as Array<{ lang: string; cmd: NameAndDesc & { options?: Array<NameAndDesc & { options?: Array<NameAndDesc> }> } }>

		return {
			name_localizations: localizations.reduce((acc, cur) => {
				const toMatch = cur.cmd.name
				if (!toMatch) return acc
				const match = extraContext.nameRegex.exec(toMatch)
				if (!match) {
					console.log(`${toMatch} doesn't match name regex. Ignoring`)
					return acc
				}
				const final = toMatch?.toLowerCase().trim()
				if (final !== toMatch) console.error(`${toMatch} !== ${final}`)
				acc[cur.lang] = final
				return acc
			}, {} as Record<string, string>),
			description_localizations: localizations.reduce((acc, cur) => { acc[cur.lang] = cur.cmd.description; return acc }, {} as Record<string, string>)
		}
	},
	buildCommandLanguageOptions(command: { name: string, options?: Array<APIApplicationCommandOption> }): Array<APIApplicationCommandOption> | undefined {
		if (!command.options) return
		const localizations = Object.entries(Lang).map(([k, l]) => ({ lang: k.replace(extraContext.underscoreToEndRegex, sub => `-${sub.slice(1).toUpperCase()}`), cmd: l[command.name as keyof typeof l] ?? {} })) as Array<{ lang: string; cmd: NameAndDesc & { options?: Record<string, NameAndDesc & { options?: Record<string, NameAndDesc> }> } }>

		return command.options.map(cur => ({
			name_localizations: localizations.reduce((acc, desc) => {
				const toMatch = desc.cmd.options?.[cur.name].name
				const match = toMatch?.match(extraContext.nameRegex)
				if (toMatch && !match) {
					console.log(`${toMatch} doesn't match name regex. Ignoring`)
					return acc
				}
				const final = toMatch?.toLowerCase().trim()
				if (final !== toMatch) console.error(`${toMatch} !== ${final}`)
				acc[desc.lang] = final
				return acc
			}, {} as Record<string, string | undefined>) as LocaledObject,
			description_localizations: localizations.reduce((acc, desc) => { acc[desc.lang] = desc.cmd.options?.[cur.name].description; return acc }, {} as Record<string, string | undefined>) as LocaledObject,
			options: cur.type === 1 && cur.options
				? cur.options.map(cur2 => ({
					name_localizations: localizations.reduce((acc, desc) => {
						const toMatch = desc.cmd.options![cur.name].options![cur2.name].name
						const match = extraContext.nameRegex.exec(toMatch)
						if (toMatch && !match) {
							console.log(`${toMatch} doesn't match name regex. Ignoring`)
							return acc
						}
						const final = toMatch?.toLowerCase().trim()
						if (final !== toMatch) console.error(`${toMatch} !== ${final}`)
						acc[desc.lang] = final
						return acc
					}, {} as Record<string, string>) as LocaledObject,
					description_localizations: localizations.reduce((acc, desc) => { acc[desc.lang] = desc.cmd.options![cur.name].options![cur2.name].description; return acc }, {} as Record<string, string>) as LocaledObject,
					...cur2
				}))
				: void 0,
			...cur
		}) as APIApplicationCommandOption)
	},
	async refreshcommands(): Promise<void> {
		let webcommands: Array<{ name: string; type: number; description: string; guild_ids?: Array<string>; integration_types?: Array<number>; contexts?: Array<number>; options?: Array<APIApplicationCommandOption> }>
		try {
			webcommands = await fetch(`${confprovider.config.website_protocol}://${confprovider.config.website_domain}/commands.json`).then(r => r.json())
		} catch (e) {
			console.error("There was an error getting the website's commands", e)
			webcommands = []
		}

		const payload = [...webcommands, ...Array.from(commands.commands.values())].map(c => {
			const obj = extraContext.buildCommandLanguageObject(c)
			const options = extraContext.buildCommandLanguageOptions(c)
			return {
				name: c.name,
				type: c.type ?? 1,
				description: c.description,
				guild_ids: c.guild_ids,
				integration_types: c.integration_types,
				contexts: c.contexts,
				name_localizations: Object.keys(obj.name_localizations).length ? obj.name_localizations : void 0,
				description_localizations: Object.keys(obj.description_localizations).length ? obj.description_localizations : void 0,
				options: options,
				default_member_permissions: null
			}
		})

		// Amanda is a "new" account which doesn't have a different ID from the application

		const globalCommands = payload.filter(c => !c.guild_ids?.length)
		if (globalCommands.length) {
			const response = await client.snow.interaction.bulkOverwriteApplicationCommands(confprovider.config.client_id, globalCommands).catch(console.error)
			console.log(response)
		}

		const guildedCommands = payload.filter(c => c.guild_ids?.length)
		if (guildedCommands.length) {
			const uniqueGuildIds = guildedCommands.map(c => c.guild_ids!).flat().filter((id, ind, arr) => arr.indexOf(id) === ind)
			for (const guildID of uniqueGuildIds) {
				const forGuild = guildedCommands.filter(c => c.guild_ids!.includes(guildID))
				const response = await client.snow.interaction.bulkOverwriteGuildApplicationCommands(confprovider.config.client_id, guildID, forGuild).catch(console.error)
				console.log(response)
			}
		}
	},
	assignOptions(option: APIApplicationCommandOption): NameAndDesc & { options?: Array<NameAndDesc> } {
		const rt: ReturnType<typeof extraContext.assignOptions> = {
			name: option.name,
			description: option.description
		}
		if (option.type === 1 && option.options) rt.options = option.options.map(extraContext.assignOptions)
		return rt
	}
}

export = extraContext
