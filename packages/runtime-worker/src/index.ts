import "@amanda/logger"

import { SnowTransfer, DiscordAPIError } from "snowtransfer"

import sync = require("@amanda/sync")
import confprovider = require("@amanda/config")
import sql = require("@amanda/sql")
import redis = require("@amanda/redis")
import WebsiteConnector = require("@amanda/web-internal")
import REPLProvider = require("@amanda/repl")
import { CommandManager, ChatInputCommand } from "@amanda/commands"
import buttons = require("@amanda/buttons")

import { type APIChatInputApplicationCommandInteraction, type GatewayDispatchPayload, AllowedMentionsTypes } from "discord-api-types/v10"
import type { CommandManagerParams } from "@amanda/shared-types"

const sharedUtils = sync.require("@amanda/shared-utils") as typeof import("@amanda/shared-utils")

import passthrough = require("./passthrough")

import Amanda = require("./Amanda")

passthrough.sync = sync
passthrough.confprovider = confprovider
passthrough.sql = sql
passthrough.client = new Amanda(new SnowTransfer(passthrough.confprovider.config.current_token, {
	allowed_mentions: {
		parse: [AllowedMentionsTypes.Role, AllowedMentionsTypes.User]
	}
}))
passthrough.commands = new CommandManager<CommandManagerParams>(cmd => [
	new ChatInputCommand(cmd),
	sharedUtils.getLang(cmd.locale),
	cmd.guild_id ? Number((BigInt(cmd.guild_id) >> BigInt(22)) % BigInt(passthrough.confprovider.config.total_shards)) : 0
], (c, e) => sharedUtils.defaultCommandManagerErrorHandler(c, passthrough.client.snow, e))
passthrough.webconnector = new WebsiteConnector("/internal")

;(async () => {
	await passthrough.sql.connect()
	await redis.connect()

	passthrough.client.snow.requestHandler.on("rateLimit", (...args) => console.error(`Ratelimit hit\n`, ...args))
	passthrough.client.snow.requestHandler.on("requestError", (_reqID, err) => {
		const e = err as DiscordAPIError
		console.error(e, e.request.data)
	})

	const user = await sharedUtils.getUser(
		passthrough.confprovider.config.client_id,
		passthrough.client.snow)

	if (user) passthrough.client.user = user

	passthrough.sync.require([
		"./commands/couples",
		"./commands/hidden",
		"./commands/images",
		"./commands/interaction",
		"./commands/money",
		"./commands/meta"
	])

	passthrough.webconnector.on("message", data => {
		const parsed: GatewayDispatchPayload = data
		if (parsed.t === "INTERACTION_CREATE") {
			if (parsed.d.type === 2) {
				passthrough.commands.handle(
					parsed.d as APIChatInputApplicationCommandInteraction,
					passthrough.confprovider.config.is_dev
						? () => passthrough.client.snow.interaction.createInteractionResponse(parsed.d.id, parsed.d.token, { type: 5 })
						: void 0
				)
			}
			else if (parsed.d.type === 3) buttons.handle(parsed.d)
		}
	})

	const replfunctions = passthrough.sync.require("./replfunctions") as typeof import("./replfunctions")

	void new REPLProvider({ passthrough, replfunctions })

	console.log("Command client ready")
})()
