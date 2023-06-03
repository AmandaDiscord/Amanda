import "@amanda/logger"

import Sync = require("heatsync")
import uWS = require("uWebSockets.js")
import { SnowTransfer } from "snowtransfer"
import { Manager } from "lavacord"


import ConfigProvider = require("@amanda/config")
import SQLProvider = require("@amanda/sql")
import AMQPProvider = require("@amanda/amqp")
import { CommandManager, ChatInputCommand } from "@amanda/commands"
import sharedUtils = require("@amanda/shared-utils")

import type { CommandManagerParams } from "@amanda/shared-types"

import passthrough = require("./passthrough")

passthrough.server = uWS.App()
passthrough.sync = new Sync()
passthrough.confprovider = new ConfigProvider(passthrough.sync)
passthrough.sql = new SQLProvider(passthrough.confprovider)
passthrough.amqp = new AMQPProvider(passthrough.confprovider, {
	[passthrough.confprovider.config.amqp_receive_queue_command]: undefined
})
passthrough.commands = new CommandManager<CommandManagerParams>(cmd => [
	new ChatInputCommand(cmd),
	sharedUtils.getLang(cmd.locale),
	cmd.guild_id ? Number((BigInt(cmd.guild_id) >> BigInt(22)) % BigInt(passthrough.confprovider.config.total_shards)) : 0
])
passthrough.snow = new SnowTransfer(passthrough.confprovider.config.current_token)

;(async () => {
	await Promise.all([
		passthrough.sql.connect().catch(console.error),
		passthrough.amqp.connect().catch(console.error)
	])

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
		send: async packet => {
			const url = await passthrough.sql.orm.raw(
				"SELECT gateway_clusters.url, guilds.shard_id FROM guilds INNER JOIN gateway_clusters ON guilds.cluster_id = gateway_clusters.cluster_id WHERE guilds.client_id = $1 AND guilds.guild_id = $2",
				[passthrough.confprovider.config.client_id, packet.d.guild_id]
			).then(r => r?.rows[0])

			if (!url) return false
			packet.d.shard_id = url.shard_id

			await fetch(`${url.url}/gateway/voice-status-update`, {
				method: "POST",
				headers: {
					Authorization: passthrough.confprovider.config.current_token
				},
				body: JSON.stringify(packet.d)
			})

			return true
		}
	})

	passthrough.lavalink.once("ready", () => console.log("Lavalink ready"))

	passthrough.lavalink.on("error", error => console.error(`There was a LavaLink error: ${error && (error as Error).message ? (error as Error).message : error}`))

	await passthrough.lavalink.connect().catch(console.error)

	import("./paths/accounts")
	import("./paths/blogs")
	import("./paths/dash")
	import("./paths/discord")
	import("./paths/redirects")
	import("./paths/static")

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
