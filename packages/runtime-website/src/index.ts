import "@amanda/logger"

import Sync = require("heatsync")
import uWS = require("uWebSockets.js")
import { SnowTransfer } from "snowtransfer"
import { Manager } from "lavacord"


import ConfigProvider = require("@amanda/config")
import SQLProvider = require("@amanda/sql")
import REPLProvider = require("@amanda/repl")
import { CommandManager, ChatInputCommand } from "@amanda/commands"
import sharedUtils = require("@amanda/shared-utils")

import type { CommandManagerParams } from "@amanda/shared-types"

import passthrough = require("./passthrough")

passthrough.server = uWS.App()
passthrough.sync = new Sync()
passthrough.confprovider = new ConfigProvider(passthrough.sync)
passthrough.sql = new SQLProvider(passthrough.confprovider)
passthrough.commands = new CommandManager<CommandManagerParams>(cmd => [
	new ChatInputCommand(cmd),
	sharedUtils.getLang(cmd.locale),
	cmd.guild_id ? Number((BigInt(cmd.guild_id) >> BigInt(22)) % BigInt(passthrough.confprovider.config.total_shards)) : 0
])
passthrough.snow = new SnowTransfer(passthrough.confprovider.config.current_token)

;(async () => {
	await passthrough.sql.connect().catch(console.error)

	const lavalinkNodeData = await passthrough.sql.orm.select("lavalink_nodes")
	const lavalinkNodes = lavalinkNodeData.map(node => {
		const newData = {
			password: passthrough.confprovider.config.lavalink_password,
			id: node.name.toLowerCase(),
			resumeKey: "",
			resumeTimeout: 0
		}
		return Object.assign(newData, node)
	})

	passthrough.confprovider.config.lavalink_nodes.push(...lavalinkNodes)

	for (const node of passthrough.confprovider.config.lavalink_nodes) {
		node.resumeKey = `${passthrough.confprovider.config.client_id}/website`
		node.resumeTimeout = 75
	}

	passthrough.lavalink = new Manager(passthrough.confprovider.config.lavalink_nodes.filter(n => n.enabled), {
		user: passthrough.confprovider.config.client_id,
		send: packet => {
			const shardID = packet.d.guild_id ? Number((BigInt(packet.d.guild_id) >> BigInt(22)) % BigInt(passthrough.confprovider.config.total_shards)) : 0
			const worker = Object.values(passthrough.gatewayWorkers).find(w => w.shards.includes(shardID))

			if (!worker) return false

			packet.d.shard_id = shardID
			packet.t = "SEND_MESSAGE"

			worker.send(packet)

			return true
		}
	})

	void new REPLProvider(passthrough)

	passthrough.lavalink.once("ready", () => console.log("Lavalink ready"))

	passthrough.lavalink.on("error", error => console.error(`There was a LavaLink error: ${error && (error as Error).message ? (error as Error).message : error}`))

	await passthrough.lavalink.connect().catch(console.error)

	import("./paths/accounts")
	import("./paths/blogs")
	import("./paths/dash")
	import("./paths/discord")
	import("./paths/redirects")
	import("./paths/static")

	import("./ws/gateway")
	import("./ws/internal")
	import("./ws/public")

	passthrough.sync.require([
		"./music/music",
		"./music/playlist"
	])

	const port = passthrough.confprovider.config.website_port
	passthrough.server.listen(port, sock => {
		if (sock) console.log(`Listening to port ${port}`)
		else console.log(`Failed to listen to port ${port}`)
	})
})()
