import "@amanda/logger"

import fs = require("fs")
import path = require("path")

import uWS = require("uWebSockets.js")
import { SnowTransfer, DiscordAPIError } from "snowtransfer"
import { Manager, RestError } from "lavacord"

import sync = require("@amanda/sync")
import confprovider = require("@amanda/config")
import sql = require("@amanda/sql")
import redis = require("@amanda/redis")
import REPLProvider = require("@amanda/repl")
import { CommandManager, ChatInputCommand } from "@amanda/commands"
import sharedUtils = require("@amanda/shared-utils")

import type { CommandManagerParams } from "@amanda/shared-types"
import { type APIVoiceState, AllowedMentionsTypes } from "discord-api-types/v10"

import passthrough = require("./passthrough")

passthrough.server = uWS.App()
passthrough.sync = sync
passthrough.confprovider = confprovider
passthrough.snow = new SnowTransfer(passthrough.confprovider.config.current_token, {
	allowed_mentions: {
		parse: [AllowedMentionsTypes.Role, AllowedMentionsTypes.User]
	}
})
passthrough.commands = new CommandManager<CommandManagerParams>(cmd => [
	new ChatInputCommand(cmd),
	sharedUtils.getLang(cmd.locale),
	cmd.guild_id ? Number((BigInt(cmd.guild_id) >> BigInt(22)) % BigInt(passthrough.confprovider.config.total_shards)) : 0
], (c, e) => sharedUtils.defaultCommandManagerErrorHandler(c, passthrough.snow, e))

passthrough.snow.requestHandler.on("rateLimit", (...args) => console.error(`Ratelimit hit\n`, ...args))
passthrough.snow.requestHandler.on("requestError", (_reqID, err) => {
	const e = err as DiscordAPIError
	console.error(e, e.request.data)
})

const pathToOldQueuesAndNodes = path.join(__dirname, "../queue-restore.json")

;(async () => {
	await sql.connect()
	await redis.connect()
	const oldQueuesAndNodes: StoredQueuesAndNodes = JSON.parse(await fs.promises.readFile(pathToOldQueuesAndNodes, { encoding: "utf-8" }).catch(() => "{\"queues\":{},\"nodes\":{}}"))
	const lavalinkNodeData = await sql.orm.select("lavalink_nodes")
	const lavalinkNodes = lavalinkNodeData.map(node => {
		const id = node.name.toLowerCase()
		const newData = {
			password: passthrough.confprovider.config.lavalink_password,
			id: id,
			resuming: true,
			resumeTimeout: 25,
			sessionId: oldQueuesAndNodes.nodes[id],
			reconnectInterval: 20000
		}
		return Object.assign(newData, node) as typeof newData & typeof node
	})

	passthrough.confprovider.config.lavalink_nodes.push(...lavalinkNodes)
	const oldLLNodes = passthrough.confprovider.config.lavalink_nodes.slice(0)

	passthrough.confprovider.addCallback(() => {
		passthrough.confprovider.config.lavalink_nodes.length = 0
		passthrough.confprovider.config.lavalink_nodes.push(...oldLLNodes)
	})

	passthrough.lavalink = new Manager(oldLLNodes.filter(n => n.enabled), {
		userId: passthrough.confprovider.config.client_id,
		send: packet => {
			const shardID = packet.d.guild_id ? Number((BigInt(packet.d.guild_id) >> BigInt(22)) % BigInt(passthrough.confprovider.config.total_shards)) : 0
			const worker = passthrough.gatewayWorkers.get(passthrough.gatewayShardIndex.get(shardID)!)

			if (!worker) {
				console.error(`No gateway worker available to send a message for shard ${shardID}`, packet)
				return false
			}

			const toWorker: typeof packet & { t?: string; d?: { shard_id?: number } } = packet
			toWorker.t = "SEND_MESSAGE"
			toWorker.d.shard_id = shardID

			worker.send(toWorker)

			return true
		}
	})

	void new REPLProvider(passthrough)

	passthrough.lavalink.once("ready", () => console.log("Lavalink ready"))

	passthrough.lavalink.on("error", error => console.error(`There was a LavaLink error: ${error instanceof RestError ? `${error.message}\n${error.error.path}\n${JSON.stringify(error.data)}` : (error as Error)?.stack ?? error}`))

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
		"./lover",
		"./music/music",
		"./music/playlist"
	])

	const musicUtils: typeof import("./music/utils") = passthrough.sync.require("./music/utils")
	Promise.all(
		Object.entries(oldQueuesAndNodes.queues).map(async entry => {
			const stillInVC = await redis.GET<APIVoiceState>("voice", passthrough.confprovider.config.client_id)
			if (stillInVC?.channel_id !== entry[1].voiceChannel.id) return
			musicUtils.queues.createQueueFromRestore(entry[0], entry[1])
		})
	)

	const port = passthrough.confprovider.config.website_port
	passthrough.server.listen(port, sock => {
		if (sock) console.log(`Listening to port ${port}`)
		else console.log(`Failed to listen to port ${port}`)
	})
})()

process.stdin.resume()

type StoredQueuesAndNodes = {
	queues: { [guildID: string]: ReturnType<import("./music/queue").Queue["toJSON"]> }
	nodes: { [nodeID: string]: string | undefined }
}

function exitHandler(...params: Array<unknown>) {
	console.warn(...params)
	if (passthrough.lavalink) {
		const obj: StoredQueuesAndNodes = {
			queues: {},
			nodes: {}
		}
		for (const [id, node] of passthrough.lavalink.nodes.entries()) obj.nodes[id] = node.sessionId
		for (const [id, queue] of passthrough.queues.entries()) {
			// <= 1 means Amanda will leave eventually so dont add. The users all left during an update which sucks, but we cannot hold refs
			if (this.listeners.size > 1) obj.queues[id] = queue.toJSON()
			else queue.destroy()
		}

		fs.writeFileSync(pathToOldQueuesAndNodes, JSON.stringify(obj))
	}
	return process.exit()
}

process.on("exit", exitHandler)
process.on("SIGINT", exitHandler)
process.on("SIGUSR1", exitHandler)
process.on("SIGUSR2", exitHandler)
