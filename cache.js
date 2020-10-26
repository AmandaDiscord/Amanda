// @ts-check

const RainCache = require("raincache")
const repl = require("repl")
const util = require("util")

const AmpqpConnector = RainCache.Connectors.AmqpConnector
const RedisStorageEngine = RainCache.Engines.RedisStorageEngine

const config = require("./config")
const BaseWorkerServer = require("./modules/structures/BaseWorkerServer")

const connection = new AmpqpConnector({
	amqpUrl: `amqp://${config.amqp_username}:${config.redis_password}@${config.amqp_origin}:${config.amqp_port}/amanda-vhost`
})

// @ts-ignore
const rain = new RainCache({
	storage: {
		default: new RedisStorageEngine({
			redisOptions: {
				host: config.amqp_origin,
				password: config.redis_password
			}
		})
	},
	debug: false
}, connection, connection)

const worker = new BaseWorkerServer("cache", config.redis_password);

(async () => {
	await rain.initialize()
	console.log("Cache initialized.")

	connection.channel.assertQueue(config.amqp_data_queue, { durable: false, autoDelete: true })

	/**
	 * @param {string} input
	 * @param {import("vm").Context} context
	 * @param {string} filename
	 * @param {(err: Error|null, result: any) => any} callback
	 */
	// @ts-ignore
	async function customEval(input, context, filename, callback) {
		let depth = 0
		if (input == "exit\n") return process.exit()
		if (input.startsWith(":")) {
			const depthOverwrite = input.split(" ")[0]
			depth = +depthOverwrite.slice(1)
			input = input.slice(depthOverwrite.length + 1)
		}
		const result = await eval(input)
		const output = util.inspect(result, false, depth, true)
		return callback(undefined, output)
	}

	const cli = repl.start({ prompt: "> ", eval: customEval, writer: s => s })

	Object.assign(cli.context, { rain, worker, connection })

	cli.once("exit", () => {
		process.exit()
	})

	worker.get("/stats", (request, response) => {
		return response.status(200).send(worker.createDataResponse({ ram: process.memoryUsage(), uptime: process.uptime() })).end()
	})

	worker.post("/request", async (request, response) => {
		if (!request.body) return response.status(204).send(worker.createErrorResponse("No payload")).end()
		/** @type {import("./typings").CacheRequestData<keyof import("./typings").CacheOperations>} */
		const data = request.body

		if (!data.op) return response.status(400).send(worker.createErrorResponse("No op in payload")).end()

		function sendInternalError(error) {
			return response.status(500).send(worker.createErrorResponse(error)).end()
		}

		if (data.op === "FIND_GUILD") {
			/** @type {{ id?: string, name?: string }} */
			// @ts-ignore
			const query = data.params || {}
			let members
			try {
				members = await rain.cache.guild.getIndexMembers()
			} catch (e) {
				return sendInternalError(e)
			}
			const batchLimit = 50
			let pass = 1
			let passing = true
			let match
			while (passing) {
				const starting = (batchLimit * pass) - batchLimit
				const batch = members.slice(starting, starting + batchLimit)

				if (batch.length === 0) {
					passing = false
					continue
				}

				let guilds
				try {
					guilds = await Promise.all(batch.map(id => rain.cache.guild.get(id)))
				} catch (e) {
					return sendInternalError(e)
				}

				for (const guild of guilds) {
					if (match) continue
					const obj = guild && guild.boundObject ? guild.boundObject : (guild || {})

					// @ts-ignore
					if (query.id && obj.id === query.id) {
						end()
						continue
					// @ts-ignore
					} else if (query.name && (obj.name ? obj.name.toLowerCase().includes(query.name.toLowerCase()) : false)) {
						end()
						continue
					} else {
						continue
					}

					// eslint-disable-next-line no-inner-declarations
					function end() {
						match = obj
						passing = false
					}
				}
				pass++
			}
			return response.status(200).send(worker.createDataResponse(match)).end()

		} else if (data.op === "FILTER_GUILDS") {
			/** @type {{ id?: string, name?: string, limit?: number }} */
			// @ts-ignore
			const query = data.params || { limit: 10 }
			let members
			try {
				members = await rain.cache.guild.getIndexMembers()
			} catch (e) {
				return sendInternalError(e)
			}
			const batchLimit = 50
			let pass = 1
			let passing = true
			const matched = []
			while (passing) {
				const starting = (batchLimit * pass) - batchLimit
				const batch = members.slice(starting, starting + batchLimit)

				if (batch.length === 0) {
					passing = false
					continue
				}

				let guilds
				try {
					guilds = await Promise.all(batch.map(id => rain.cache.guild.get(id)))
				} catch (e) {
					return sendInternalError(e)
				}

				for (const guild of guilds) {
					if (!passing) continue
					if (query.limit && matched.length === query.limit) {
						passing = false
						continue
					}
					const obj = guild && guild.boundObject ? guild.boundObject : (guild || {})

					if (!query.id && !query.name) {
						end()
						continue
					// @ts-ignore
					} else if (obj.id === query.id) {
						end()
						continue
					// @ts-ignore
					} else if (obj.name === (obj.name ? obj.name.toLowerCase().includes(query.name.toLowerCase()) : false)) {
						end()
						continue
					} else {
						continue
					}

					// eslint-disable-next-line no-inner-declarations
					function end() {
						matched.push(obj)
					}
				}
				pass++
			}
			return response.status(200).send(worker.createDataResponse(matched)).end()


		} else if (data.op === "FIND_CHANNEL") {
			/** @type {{ id?: string, name?: string, guild_id?: string }} */
			// @ts-ignore
			const query = data.params || {}
			let members
			try {
				members = await rain.cache.channel.getIndexMembers()
			} catch (e) {
				return sendInternalError(e)
			}
			const batchLimit = 50
			let pass = 1
			let passing = true
			let match
			while (passing) {
				const starting = (batchLimit * pass) - batchLimit
				const batch = members.slice(starting, starting + batchLimit)

				if (batch.length === 0) {
					passing = false
					continue
				}

				let channels
				try {
					channels = await Promise.all(batch.map(id => rain.cache.channel.get(id)))
				} catch(e) {
					return sendInternalError(e)
				}

				for (const channel of channels) {
					if (match) continue
					const obj = channel && channel.boundObject ? channel.boundObject : (channel || {})

					// @ts-ignore
					if (query.guild_id && obj.guild_id != query.guild_id) continue

					// @ts-ignore
					if (query.id && obj.id === query.id) {
						end()
						continue
					// @ts-ignore
					} else if (query.name && (obj.name ? obj.name.toLowerCase().includes(query.name.toLowerCase()) : false)) {
						end()
						continue
					} else {
						continue
					}

					// eslint-disable-next-line no-inner-declarations
					function end() {
						match = obj
						passing = false
					}
				}
				pass++
			}
			return response.status(200).send(worker.createDataResponse(match)).end()

		} else if (data.op === "FILTER_CHANNELS") {
			/** @type {{ id?: string, name?: string, guild_id?: string, limit?: number }} */
			// @ts-ignore
			const query = data.params || { limit: 10 }
			let members
			try {
				members = await rain.cache.channel.getIndexMembers()
			} catch (e) {
				return sendInternalError(e)
			}
			const batchLimit = 50
			let pass = 1
			let passing = true
			const matched = []
			while (passing) {
				const starting = (batchLimit * pass) - batchLimit
				const batch = members.slice(starting, starting + batchLimit)

				if (batch.length === 0) {
					passing = false
					continue
				}

				let channels
				try {
					channels = await Promise.all(batch.map(id => rain.cache.channel.get(id)))
				} catch(e) {
					return sendInternalError(e)
				}

				for (const channel of channels) {
					if (!passing) continue
					if (query.limit && matched.length === query.limit) {
						passing = false
						continue
					}
					const obj = channel && channel.boundObject ? channel.boundObject : (channel || {})

					// @ts-ignore
					if (query.guild_id && obj.guild_id != query.guild_id) continue

					if (!query.id && !query.name && !query.guild_id) {
						end()
						continue
					// @ts-ignore
					} if (query.id && obj.id === query.id) {
						end()
						continue
					// @ts-ignore
					} else if (query.name && (obj.name ? obj.name.toLowerCase().includes(query.name.toLowerCase()) : false)) {
						end()
						continue
					} else {
						continue
					}

					// eslint-disable-next-line no-inner-declarations
					function end() {
						matched.push(obj)
					}
				}
				pass++
			}
			return response.status(200).send(worker.createDataResponse(matched)).end()


		} else if (data.op === "GET_USER") {
			/** @type {{ id: string }} */
			// @ts-ignore
			const query = data.params || {}
			if (!query.id) return response.status(400).send(worker.createErrorResponse("Missing id field")).end()
			let user
			try {
				user = await rain.cache.user.get(query.id)
			} catch (e) {
				return sendInternalError(e)
			}
			const obj = user && user.boundObject ? user.boundObject : (user ? user : null)
			return response.status(200).send(worker.createDataResponse(obj)).end()

		} else if (data.op === "FIND_USER") {
			/** @type {{ id?: string, username?: string, discriminator?: string, tag?: string }} */
			// @ts-ignore
			const query = data.params || {}
			let members
			try {
				members = await rain.cache.user.getIndexMembers()
			} catch (e) {
				return sendInternalError(e)
			}
			const batchLimit = 50
			let pass = 1
			let passing = true
			let match
			while (passing) {
				const starting = (batchLimit * pass) - batchLimit
				const batch = members.slice(starting, starting + batchLimit)

				if (batch.length === 0) {
					passing = false
					continue
				}

				let users
				try {
					users = await Promise.all(batch.map(id => rain.cache.user.get(id)))
				} catch (e) {
					return sendInternalError(e)
				}

				for (const user of users) {
					if (match) continue
					const obj = user && user.boundObject ? user.boundObject : (user || {})

					// @ts-ignore
					if (query.id && obj.id === query.id) {
						end()
						continue
					// @ts-ignore
					} else if (query.username && (obj.username ? obj.username.toLowerCase().includes(query.username.toLowerCase()) : false)) {
						end()
						continue
					// @ts-ignore
					} else if (query.discriminator && obj.discriminator === query.discriminator) {
						end()
						continue
					// @ts-ignore
					} else if (query.tag && (obj.username && obj.discriminator ? `${obj.username}#${obj.discriminator}`.toLowerCase() === query.tag.toLowerCase() : false)) {
						end()
						continue
					} else {
						continue
					}

					// eslint-disable-next-line no-inner-declarations
					function end() {
						match = obj
						passing = false
					}
				}
				pass++
			}
			return response.status(200).send(worker.createDataResponse(match)).end()

		} else if (data.op === "FILTER_USERS") {
			/** @type {{ id?: string, username?: string, discriminator?: string, tag?: string, limit?: number }} */
			// @ts-ignore
			const query = data.params || { limit: 10 }
			let members
			try {
				members = await rain.cache.user.getIndexMembers()
			} catch (e) {
				return sendInternalError(e)
			}
			const batchLimit = 50
			let pass = 1
			let passing = true
			const matched = []
			while (passing) {
				const starting = (batchLimit * pass) - batchLimit
				const batch = members.slice(starting, starting + batchLimit)

				if (batch.length === 0) {
					passing = false
					continue
				}

				let users
				try {
					users = await Promise.all(batch.map(id => rain.cache.user.get(id)))
				} catch (e) {
					return sendInternalError(e)
				}

				for (const user of users) {
					if (!passing) continue
					if (query.limit && matched.length === query.limit) {
						passing = false
						continue
					}
					const obj = user && user.boundObject ? user.boundObject : (user || {})

					if (!query.id && !query.username && !query.discriminator && !query.tag) {
						end()
						continue
					// @ts-ignore
					} else if (query.id && obj.id === query.id) {
						end()
						continue
					// @ts-ignore
					} else if (query.username && (obj.username ? obj.username.toLowerCase().includes(query.username.toLowerCase()) : false)) {
						end()
						continue
					// @ts-ignore
					} else if (query.discriminator && obj.discriminator === query.discriminator) {
						end()
						continue
					// @ts-ignore
					} else if (query.tag && (obj.username && obj.discriminator ? `${obj.username}#${obj.discriminator}`.toLowerCase() === query.tag.toLowerCase() : false)) {
						end()
						continue
					} else {
						continue
					}

					// eslint-disable-next-line no-inner-declarations
					function end() {
						matched.push(obj)
					}
				}
				pass++
			}
			return response.status(200).send(worker.createDataResponse(matched)).end()


		} else if (data.op === "FIND_MEMBER") {
			/** @type {{ id?: string, username?: string, discriminator?: string, tag?: string, nick?: string, guild_id?: string }} */
			// @ts-ignore
			const query = data.params || {}
			let members
			try {
				if (query.guild_id) members = await rain.cache.member.getIndexMembers(query.guild_id)
				else members = await rain.cache.member.getIndexMembers()
			} catch (e) {
				return sendInternalError(e)
			}
			const batchLimit = 50
			let pass = 1
			let passing = true
			let match
			while (passing) {
				const starting = (batchLimit * pass) - batchLimit
				const batch = members.slice(starting, starting + batchLimit)

				if (batch.length === 0) {
					passing = false
					continue
				}

				let mems
				try {
					if (query.guild_id) mems = await Promise.all(batch.map(id => rain.cache.member.get(id, query.guild_id)))
					else mems = await Promise.all(batch.map(id => rain.cache.member.get(id)))
				} catch (e) {
					return sendInternalError(e)
				}

				for (const member of mems) {
					if (match) continue
					const mobj = member && member.boundObject ? member.boundObject : (member || {})
					// @ts-ignore
					const user = await rain.cache.user.get(mobj.id)
					const uobj = user && user.boundObject ? user.boundObject : (user || {})

					// @ts-ignore
					if (query.guild_id && mobj.guild_id != query.guild_id) continue

					// @ts-ignore
					if (query.id && mobj.id === query.id) {
						end()
						continue
					// @ts-ignore
					} else if (query.username && (uobj.username ? uobj.username.toLowerCase().includes(query.username.toLowerCase()) : false)) {
						end()
						continue
					// @ts-ignore
					} else if (query.discriminator && uobj.discriminator === query.discriminator) {
						end()
						continue
					// @ts-ignore
					} else if (query.tag && (uobj.username && uobj.discriminator ? `${uobj.username}#${uobj.discriminator}`.toLowerCase() === query.tag.toLowerCase() : false)) {
						end()
						continue
					// @ts-ignore
					} else if (query.nick && (mobj.nick ? mobj.nick.toLowerCase().includes(query.nick.toLowerCase()) : false)) {
						end()
						continue
					} else {
						continue
					}

					// eslint-disable-next-line no-inner-declarations
					function end() {
						match = { user: uobj, ...mobj }
						passing = false
					}
				}
				pass++
			}
			return response.status(200).send(worker.createDataResponse(match)).end()

		} else if (data.op === "FILTER_MEMBERS") {
			/** @type {{ id?: string, username?: string, discriminator?: string, tag?: string, nick?: string, guild_id?: string, limit?: number }} */
			// @ts-ignore
			const query = data.params || { limit: 10 }
			let members = []
			try {
				if (query.guild_id) members = await rain.cache.member.getIndexMembers(query.guild_id)
			} catch (e) {
				return sendInternalError(e)
			}
			const batchLimit = 50
			let pass = 1
			let passing = true
			const matched = []
			while (passing) {
				const starting = (batchLimit * pass) - batchLimit
				const batch = members.slice(starting, starting + batchLimit)

				if (batch.length === 0) {
					passing = false
					continue
				}

				let mems
				try {
					if (query.guild_id) mems = await Promise.all(batch.map(id => rain.cache.member.get(id, query.guild_id)))
					else mems = []
				} catch (e) {
					return sendInternalError(e)
				}

				for (const member of mems) {
					if (!passing) continue
					if (query.limit && matched.length === query.limit) {
						passing = false
						continue
					}
					const mobj = member && member.boundObject ? member.boundObject : (member || {})
					let user
					try {
						user = await rain.cache.user.get(mobj.id)
					} catch (e) {
						return sendInternalError(e)
					}
					const uobj = user && user.boundObject ? user.boundObject : (user || {})

					if (query.guild_id && mobj.guild_id != query.guild_id) continue

					if (!query.id && !query.username && !query.discriminator && !query.tag && !query.guild_id && !query.nick) {
						end()
						continue
					} if (query.id && mobj.id === query.id) {
						end()
						continue
					// @ts-ignore
					} else if (query.username && (uobj.username ? uobj.username.toLowerCase().includes(query.username.toLowerCase()) : false)) {
						end()
						continue
					// @ts-ignore
					} else if (query.discriminator && uobj.discriminator === query.discriminator) {
						end()
						continue
					// @ts-ignore
					} else if (query.tag && (uobj.username && uobj.discriminator ? `${uobj.username}#${uobj.discriminator}`.toLowerCase() === query.tag.toLowerCase() : false)) {
						end()
						continue
					} else if (query.nick && (mobj.nick ? mobj.nick.toLowerCase().includes(query.nick.toLowerCase()) : false)) {
						end()
						continue
					} else {
						continue
					}

					// eslint-disable-next-line no-inner-declarations
					function end() {
						matched.push({ user: uobj, ...mobj })
					}
				}
				pass++
			}
			return response.status(200).send(worker.createDataResponse(matched)).end()

		} else if (data.op === "GET_USER_GUILDS") {
			/** @type {{ id: string }} */
			// @ts-ignore
			const query = data.params || {}

			let guilds
			try {
				guilds = await rain.cache.guild.getIndexMembers()
			} catch (e) {
				return sendInternalError(e)
			}
			const batchLimit = 100
			let pass = 1
			let passing = true
			const matched = []
			if (query.id) {

				while (passing) {
					const starting = (batchLimit * pass) - batchLimit
					const batch = guilds.slice(starting, starting + batchLimit)

					if (batch.length === 0) {
						passing = false
						continue
					}

					/** @type {Array<[string, boolean]>} */
					let indexed
					try {
						// @ts-ignore
						indexed = await Promise.all(batch.map(async id => [id, await rain.cache.member.isIndexed(query.id, id)]))
					} catch (e) {
						return sendInternalError(e)
					}
					indexed.filter(i => i[1]).forEach(item => matched.push(item[0]))
					pass++
				}
			}
			return response.status(200).send(worker.createDataResponse(matched)).end()

		} else if (data.op === "GET_MEMBERS_IN_ROLE") {
			/** @type {{ role_id: string, guild_id: string }} */
			// @ts-ignore
			const query = data.params || {}

			if (!query.guild_id || !query.role_id) return response.status(400).send(worker.createErrorResponse("Missing guild_id or role_id fields"))
			let members
			try {
				members = await rain.cache.member.getIndexMembers(query.guild_id)
			} catch (e) {
				return sendInternalError(e)
			}
			const batchLimit = 50
			let pass = 1
			let passing = true
			const matched = []
			while (passing) {
				const starting = (batchLimit * pass) - batchLimit
				const batch = members.slice(starting, starting + batchLimit)

				if (batch.length === 0) {
					passing = false
					continue
				}

				let mems
				try {
					mems = await Promise.all(batch.map(id => rain.cache.member.get(id, query.guild_id)))
				} catch (e) {
					return sendInternalError(e)
				}

				for (const member of mems) {
					if (!passing) continue
					const mobj = member && member.boundObject ? member.boundObject : (member || {})
					let user
					try {
						// @ts-ignore
						user = await rain.cache.user.get(mobj.id)
					} catch (e) {
						return sendInternalError(e)
					}
					const uobj = user && user.boundObject ? user.boundObject : (user || {})

					// @ts-ignore
					if (mobj.guild_id != query.guild_id) continue

					// @ts-ignore
					if (mobj.roles.includes(query.role_id)) {
						end()
						continue
					} else {
						continue
					}

					// eslint-disable-next-line no-inner-declarations
					function end() {
						matched.push({ user: uobj, ...mobj })
					}
				}
				pass++
			}
			return response.status(200).send(worker.createDataResponse(matched)).end()


		} else if (data.op === "FIND_VOICE_STATE") {
			/** @type {{ channel_id?: string, user_id?: string, guild_id?: string }} */
			// @ts-ignore
			const query = data.params || {}
			let members
			try {
				members = await rain.cache.voiceState.getIndexMembers()
			} catch (e) {
				return sendInternalError(e)
			}
			const batchLimit = 50
			let pass = 1
			let passing = true
			let match
			while (passing) {
				const starting = (batchLimit * pass) - batchLimit
				const batch = members.slice(starting, starting + batchLimit)

				if (batch.length === 0) {
					passing = false
					continue
				}

				let states
				try {
					states = await Promise.all(batch.map(id => rain.cache.voiceState.get(id, query.guild_id)))
				} catch (e) {
					return sendInternalError(e)
				}

				for (const state of states) {
					if (match) continue
					const sobj = state && state.boundObject ? state.boundObject : (state || {})
					let user
					try {
						// @ts-ignore
						user = await rain.cache.user.get(state.user_id)
					} catch (e) {
						return sendInternalError(e)
					}
					const uobj = user && user.boundObject ? user.boundObject : (user || {})

					// @ts-ignore
					if (query.guild_id && sobj.guild_id != query.guild_id) continue

					// @ts-ignore
					if (query.channel_id && sobj.channel_id === query.channel_id) {
						end()
						continue
					// @ts-ignore
					} else if (query.user_id && sobj.user_id === query.user_id) {
						end()
						continue
					} else {
						continue
					}

					// eslint-disable-next-line no-inner-declarations
					function end() {
						match = { user: uobj, ...sobj }
						passing = false
					}
				}
				pass++
			}
			return response.status(200).send(worker.createDataResponse(match)).end()

		} else if (data.op === "FILTER_VOICE_STATES") {
			/** @type {{ channel_id?: string, user_id?: string, guild_id?: string, limit?: number }} */
			// @ts-ignore
			const query = data.params || { limit: 10 }
			let members
			try {
				members = await rain.cache.voiceState.getIndexMembers()
			} catch (e) {
				return sendInternalError(e)
			}
			const batchLimit = 50
			let pass = 1
			let passing = true
			const matched = []
			while (passing) {
				const starting = (batchLimit * pass) - batchLimit
				const batch = members.slice(starting, starting + batchLimit)

				if (batch.length === 0) {
					passing = false
					continue
				}

				let states
				try {
					states = await Promise.all(batch.map(id => rain.cache.voiceState.get(id, query.guild_id)))
				} catch (e) {
					return sendInternalError(e)
				}

				for (const state of states) {
					if (!passing) continue
					if (query.limit && matched.length === query.limit) {
						passing = false
						continue
					}
					if (!state) continue
					const sobj = state && state.boundObject ? state.boundObject : (state || {})
					let user
					try {
						// @ts-ignore
						user = await rain.cache.user.get(sobj.user_id)
					} catch (e) {
						return sendInternalError(e)
					}
					const uobj = user && user.boundObject ? user.boundObject : (user || {})

					// @ts-ignore
					if (query.guild_id && sobj.guild_id != query.guild_id) continue

					if (!query.channel_id && !query.user_id) {
						end()
						continue
					// @ts-ignore
					} if (query.channel_id && sobj.channel_id === query.channel_id) {
						end()
						continue
					// @ts-ignore
					} else if (query.user_id && sobj.user_id === query.user_id) {
						end()
						continue
					} else {
						continue
					}

					// eslint-disable-next-line no-inner-declarations
					function end() {
						matched.push({ user: uobj, ...sobj })
					}
				}
				pass++
			}
			return response.status(200).send(worker.createDataResponse(matched)).end()


		} else if (data.op === "SAVE_DATA") {
			/** @type {import("./typings").CacheSaveData} */
			// @ts-ignore
			const query = data.params || {}
			if (!query.type || !query.data) return response.status(400).send(worker.createErrorResponse("Missing type or data field")).end()
			/** @type {import("./typings").CacheSaveData["type"]} */
			const type = query.type
			const methods = {
				"GUILD": rain.cache.guild,
				"CHANNEL": rain.cache.channel,
				"USER": rain.cache.user
			}
			try {
				await methods[type].update(query.data.id, query.data)
			} catch (e) {
				return sendInternalError(e)
			}
			return response.status(200).send(worker.createDataResponse("Saved")).end()


		} else if (data.op === "DELETE_USER") {
			/** @type {{ id: string }}} */
			// @ts-ignore
			const query = data.params || {}
			if (!query.id) return response.status(400).send(worker.createErrorResponse("Missing id field")).end()
			try {
				await rain.cache.user.removeFromIndex(query.id)
			} catch (e) {
				return sendInternalError(e)
			}
			return response.status(200).send(worker.createDataResponse("Deleted")).end()

		} else if (data.op === "DELETE_USERS") {
			/** @type {import("./typings").CacheUserData & { limit?: number, ids?: Array<string>, confirm?: boolean }}} */
			// @ts-ignore
			const query = data.params || {}
			if (!query.ids && !query.discriminator && !query.id && !query.tag && !query.username) {
				if (!query.confirm) return response.status(400).send(worker.createErrorResponse("Missing all fields")).end()
				else {
					await rain.cache.user.removeIndex()
					return response.status(200).send(worker.createDataResponse("Deleted all")).end()
				}
			}
			try {
				if (query.id) {
					await rain.cache.user.removeFromIndex(query.id)
				} else {
					let members
					try {
						members = await rain.cache.user.getIndexMembers()
					} catch (e) {
						return sendInternalError(e)
					}
					const batchLimit = 50
					let pass = 1
					let passing = true
					const matched = []
					while (passing) {
						const starting = (batchLimit * pass) - batchLimit
						const batch = members.slice(starting, starting + batchLimit)

						if (batch.length === 0) {
							passing = false
							continue
						}

						let users
						try {
							users = await Promise.all(batch.map(id => rain.cache.user.get(id)))
						} catch (e) {
							return sendInternalError(e)
						}

						for (const user of users) {
							if (query.limit && matched.length === query.limit) {
								passing = false
								continue
							}
							const obj = user && user.boundObject ? user.boundObject : (user || {})

							// @ts-ignore
							if (query.username && (obj.username ? obj.username.toLowerCase().includes(query.username.toLowerCase()) : false)) {
								end()
								continue
							// @ts-ignore
							} else if (query.discriminator && obj.discriminator === query.discriminator) {
								end()
								continue
							// @ts-ignore
							} else if (query.tag && (obj.username && obj.discriminator ? `${obj.username}#${obj.discriminator}`.toLowerCase() === query.tag.toLowerCase() : false)) {
								end()
								continue
							} else {
								continue
							}

							// eslint-disable-next-line no-inner-declarations
							function end() {
								matched.push(obj)
							}
						}
						pass++
					}
					if (matched.length > 0) return response.status(200).send(worker.createDataResponse(matched.map(m => m.id))).end()
					else return response.status(200).send(worker.createDataResponse([]))
				}
			} catch (e) {
				return sendInternalError(e)
			}
			return sendInternalError("How did we get here?")


		} else response.status(400).send(worker.createErrorResponse("Invalid op")).end()
	})

	worker.post("/gateway", async (request, response) => {
		if (!request.body) return response.status(204).send(worker.createErrorResponse("No payload")).end()
		/** @type {import("thunderstorm/dist/internal").InboundDataType<keyof import("thunderstorm/dist/internal").CloudStormEventDataTable>} */
		const data = request.body
		await handleCache(data)
		response.status(200).send(worker.createDataResponse("Cached")).end()
		connection.channel.sendToQueue(config.amqp_data_queue, Buffer.from(JSON.stringify(request.body)))
	})
})()


/**
 * We obviously want to wait for the cache ops to complete because most of the code still runs under the assumption
 * that rain AT LEAST has some data regarding an entity. I would hate to fetch info about something if we would have
 * just waited for cache ops to finish actually caching things for the worker to be able to access.
 * @param {import("thunderstorm/dist/internal").InboundDataType<keyof import("thunderstorm/dist/internal").CloudStormEventDataTable>} event
 */
async function handleCache(event) {
	if (event.t === "GUILD_CREATE") {
		// @ts-ignore
		await rain.cache.guild.update(event.d.id, event.d) // Rain apparently handles members and such

	// @ts-ignore
	} else if (event.t === "GUILD_UPDATE") await rain.cache.guild.update(event.d.id, event.d)

	else if (event.t === "GUILD_DELETE") {
		// @ts-ignore
		if (!event.d.unavailable) await rain.cache.guild.remove(event.d.id) // Rain apparently also handles deletion of everything in a guild

	// @ts-ignore
	} else if (event.t === "CHANNEL_CREATE") await rain.cache.channel.update(event.d.id, event.d) // Rain handles permission_overwrites

	// @ts-ignore
	else if (event.t === "CHANNEL_UPDATE") await rain.cache.channel.update(event.d.id, event.d)

	// @ts-ignore
	else if (event.t === "CHANNEL_DELETE") {
		// @ts-ignore
		if (!event.d.guild_id) return
		// @ts-ignore
		await rain.cache.channel.remove(event.d.channel_id)

	} else if (event.t === "MESSAGE_CREATE") {
		/** @type {import("@amanda/discordtypings").MessageData} */
		// @ts-ignore
		const typed = event.d

		if (typed.webhook_id) return

		// @ts-ignore
		if (typed.member && typed.author) await rain.cache.member.update(typed.author.id, typed.guild_id, { guild_id: typed.guild_id, user: typed.author, id: typed.author.id, ...typed.member })
		else if (typed.author) await rain.cache.user.update(typed.author.id, typed.author)

		if (typed.mentions && typed.mentions.length > 0 && typed.guild_id) {
			await Promise.all(typed.mentions.map(user => {
				// @ts-ignore
				if (user.member) rain.cache.member.update(user.id, typed.guild_id, user.member)
				else rain.cache.user.update(user.id, user)
			}))
		}

	} else if (event.t === "VOICE_STATE_UPDATE") {
		/** @type {import("@amanda/discordtypings").VoiceStateData} */
		// @ts-ignore
		const typed = event.d
		if (!typed.guild_id) return
		// @ts-ignore
		if (typed.member && typed.user_id && typed.guild_id) await rain.cache.member.update(typed.user_id, typed.guild_id, { guild_id: typed.guild_id, ...typed.member })

		if (typed.channel_id) await rain.cache.voiceState.update(typed.user_id, typed.guild_id, typed)
		else await rain.cache.voiceState.remove(typed.user_id, typed.guild_id)

	} else if (event.t === "GUILD_MEMBER_UPDATE") {
		/** @type {import("@amanda/discordtypings").MemberData & { user: import("@amanda/discordtypings").UserData } & { guild_id: string }} */
		// @ts-ignore
		const typed = event.d
		// @ts-ignore
		await rain.cache.member.update(typed.user.id, typed.guild_id, typed) // This should just only be the ClientUser unless the GUILD_MEMBERS intent is passed

	} else if (event.t === "GUILD_ROLE_CREATE") {
		/** @type {{ guild_id: string, role: import("@amanda/discordtypings").RoleData }} */
		// @ts-ignore
		const typed = event.d
		// @ts-ignore
		await rain.cache.role.update(typed.role.id, typed.guild_id, typed.role)

	} else if (event.t === "GUILD_ROLE_UPDATE") {
		/** @type {{ guild_id: string, role: import("@amanda/discordtypings").RoleData }} */
		// @ts-ignore
		const typed = event.d
		// @ts-ignore
		await rain.cache.role.update(typed.role.id, typed.guild_id, typed.role)

	} else if (event.t === "GUILD_ROLE_DELETE") {
		// @ts-ignore
		await rain.cache.role.remove(event.d.role_id, event.d.guild_id)
	}
}
