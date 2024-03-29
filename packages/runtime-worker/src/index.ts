import "@amanda/logger"

import { SnowTransfer } from "snowtransfer"

import sync = require("@amanda/sync")
import confprovider = require("@amanda/config")
import sql = require("@amanda/sql")
import redis = require("@amanda/redis")
import WebsiteConnector = require("@amanda/web-internal")
import REPLProvider = require("@amanda/repl")
import { CommandManager, ChatInputCommand } from "@amanda/commands"
import sharedUtils = require("@amanda/shared-utils")
import buttons = require("@amanda/buttons")

import type { APIChatInputApplicationCommandInteraction, GatewayDispatchPayload } from "discord-api-types/v10"
import type { CommandManagerParams } from "@amanda/shared-types"

import passthrough = require("./passthrough")

import Amanda = require("./Amanda")

passthrough.sync = sync
passthrough.confprovider = confprovider
passthrough.sql = sql
passthrough.commands = new CommandManager<CommandManagerParams>(cmd => [
	new ChatInputCommand(cmd),
	sharedUtils.getLang(cmd.locale),
	cmd.guild_id ? Number((BigInt(cmd.guild_id) >> BigInt(22)) % BigInt(passthrough.confprovider.config.total_shards)) : 0
], console.error)
passthrough.client = new Amanda(new SnowTransfer(passthrough.confprovider.config.current_token))
passthrough.webconnector = new WebsiteConnector("/internal")

;(async () => {
	await passthrough.sql.connect().catch(console.error)
	await redis.connect()

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
			if (parsed.d.type === 2) passthrough.commands.handle(parsed.d as APIChatInputApplicationCommandInteraction, passthrough.confprovider.config.is_dev ? passthrough.client.snow : void 0)
			else if (parsed.d.type === 3) buttons.handle(parsed.d)
		}
	})

	const replfunctions: typeof import("./replfunctions") = passthrough.sync.require("./replfunctions")

	void new REPLProvider({ passthrough, replfunctions })

	console.log("Command client ready")
})()
