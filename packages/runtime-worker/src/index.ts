import "@amanda/logger"

import Sync = require("heatsync")
import { SnowTransfer } from "snowtransfer"

import ConfigProvider = require("@amanda/config")
import SQLProvider = require("@amanda/sql")
import WebsiteConnector = require("@amanda/web-internal")
import REPLProvider = require("@amanda/repl")
import { CommandManager, ChatInputCommand } from "@amanda/commands"
import sharedUtils = require("@amanda/shared-utils")

import type { CommandManagerParams } from "@amanda/shared-types"

import passthrough = require("./passthrough")

import Amanda = require("./Amanda")

passthrough.sync = new Sync()
passthrough.confprovider = new ConfigProvider(passthrough.sync)
passthrough.sql = new SQLProvider(passthrough.confprovider)
passthrough.commands = new CommandManager<CommandManagerParams>(cmd => [
	new ChatInputCommand(cmd),
	sharedUtils.getLang(cmd.locale),
	cmd.guild_id ? Number((BigInt(cmd.guild_id) >> BigInt(22)) % BigInt(passthrough.confprovider.config.total_shards)) : 0
])
passthrough.client = new Amanda(new SnowTransfer(passthrough.confprovider.config.current_token))
passthrough.webconnector = new WebsiteConnector(passthrough.confprovider, "/internal")

;(async () => {
	await passthrough.sql.connect().catch(console.error)

	const user = await sharedUtils.getUser(
		passthrough.confprovider.config.client_id,
		passthrough.confprovider,
		passthrough.sql,
		passthrough.client.snow)

	if (user) passthrough.client.user = user

	passthrough.sync.require([
		"./commands/hidden",
		"./commands/images",
		"./commands/interaction",
		"./commands/meta",
		"./commands/music-stub"
	])

	passthrough.webconnector.on("message", data => {
		const single = Array.isArray(data)
			? Buffer.concat(data)
			: Buffer.from(data)

		const parsed = JSON.parse(single.toString())

		if (parsed.t === "INTERACTION_CREATE") passthrough.commands.handle(parsed.d, passthrough.client.snow)
	})

	const replfunctions: typeof import("./replfunctions") = passthrough.sync.require("./replfunctions")

	void new REPLProvider({ passthrough, replfunctions })

	console.log("Command client ready")
})()
