import sql = require("@amanda/sql")

import passthrough = require("./passthrough")
const { confprovider, sync } = passthrough

const sharedUtils = sync.require("@amanda/shared-utils") as typeof import("@amanda/shared-utils")

import { en_us as English } from "@amanda/lang"

import type { APIApplicationCommandAutocompleteInteraction, APIApplicationCommandOptionChoice } from "discord-api-types/v10"

const likeEscapeRegex = /[%_\\]/g

export type AutocompleteHandler = (interaction: APIApplicationCommandAutocompleteInteraction) => Promise<Array<APIApplicationCommandOptionChoice>>

export const handlers = new Map<string, AutocompleteHandler>()

// Subcommands that require the requester to own the playlist. Their suggestions are scoped to the user's own playlists
const ownerOnlyActions = new Set<string>([
	English.playlists.options.add.name,
	English.playlists.options.remove.name,
	English.playlists.options.move.name,
	English.playlists.options.lists.options.delete.name
])

handlers.set(English.playlists.name, async interaction => {
	if (!confprovider.config.db_enabled) return []

	const focused = sharedUtils.findFocusedOption(interaction.data.options)
	if (typeof focused?.value !== "string") return []

	// The action is the subcommand name, except under "lists" where the focused option itself is the action
	const topOption = interaction.data.options?.[0]
	const action = topOption?.name === English.playlists.options.lists.name ? focused.name : topOption?.name

	const escaped = focused.value.replace(likeEscapeRegex, "\\$&")

	let matches: Array<{ name: string }>
	if (ownerOnlyActions.has(action ?? "")) {
		const userID = (interaction.member?.user ?? interaction.user)?.id
		if (!userID) return []
		matches = await sql.all<{ name: string }>("SELECT name FROM playlists WHERE author = $1 AND name ILIKE $2 || '%' ORDER BY name LIMIT 25", [userID, escaped])
	} else {
		matches = await sql.all<{ name: string }>("SELECT name FROM playlists WHERE name ILIKE $1 || '%' ORDER BY name LIMIT 25", [escaped])
	}

	return matches.map(row => ({ name: row.name, value: row.name }))
})

handlers.set(English.settings.name, async interaction => {
	const focused = sharedUtils.findFocusedOption(interaction.data.options)
	if (focused?.name !== English.settings.options.modify.name || typeof focused.value !== "string") return []

	const settingOption = interaction.data.options?.find(option => option.name === English.settings.options.setting.name)
	const settingName = (settingOption as { value?: string } | undefined)?.value
	const setting = sharedUtils.profileSettings[settingName ?? ""]
	if (!setting?.allowedValues) return []

	const search = focused.value.toLowerCase()

	return setting.allowedValues
		.map(String)
		.concat(setting.nullable ? ["null"] : [])
		.filter(value => value.toLowerCase().startsWith(search))
		.slice(0, 25)
		.map(value => ({ name: value, value }))
})
