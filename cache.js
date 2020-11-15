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

let opAmount = 0
let totalOps = 0

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
		return response.status(200).send(worker.createDataResponse({ ram: process.memoryUsage(), uptime: process.uptime(), activeOPs: opAmount, totalOPs: totalOps })).end()
	})

	worker.post("/request", async (request, response) => {
		if (!request.body) return response.status(204).send(worker.createErrorResponse("No payload")).end()
		/** @type {import("./typings").CacheRequestData<keyof import("./typings").CacheOperations>} */
		const data = request.body

		if (!data.op) return response.status(400).send(worker.createErrorResponse("No op in payload")).end()

		function sendInternalError(error) {
			return response.status(500).send(worker.createErrorResponse(error)).end()
		}

		/**
		 * @param {"filter" | "find"} mode
		 * @param {"guild" | "channel" | "user" | "member" | "voiceState"} name
		 * @param {Object.<string, any>} properties
		 * @param {{ limit?: number }} [options]
		 * @returns {Promise<Array<any>>}
		 */
		async function filterCache(mode, name, properties, options) {
			opAmount++
			totalOps++
			if (!options) options = { limit: 10 }
			const table = rain.cache[name]
			const failed = ["failed"]
			if (!table) {
				sendInternalError(`No cache table found: ${name}`)
				opAmount--
				return failed
			}
			let members
			try {
				members = await table.getIndexMembers()
			} catch (e) {
				sendInternalError(e)
				opAmount--
				return failed
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

				let objects
				try {
					// @ts-ignore
					if (["member", "voiceState"].includes(name)) objects = await Promise.all(batch.map(id => table.get(id, properties.guild_id)))
					// @ts-ignore
					else objects = await Promise.all(batch.map(id => table.get(id)))
				} catch (e) {
					sendInternalError(e)
					opAmount--
					return failed
				}

				for (const instance of objects) {
					if (!passing) continue
					if (options.limit && matched.length === options.limit) {
						passing = false
						continue
					}
					if (!instance) continue
					const obj = instance && instance.boundObject ? instance.boundObject : (instance || {})

					if (properties.guild_id && obj.guild_id != properties.guild_id) continue

					const keys = Object.keys(properties)

					for (const key of keys) {
						if (key === "guild_id") continue
						const property = properties[key]

						if (keys.length === 0) {
							end()
							continue
						} else {
							const objp = obj[key]
							if (typeof objp === "string" && objp.toLowerCase().includes(property)) {
								end()
								continue
							} else {
								if (objp === property) {
									end()
									continue
								} else continue
							}
						}
					}

					// eslint-disable-next-line no-inner-declarations
					function end() {
						if (mode === "find") {
							passing = false
							return
						}
						matched.push(obj)
					}
				}
				pass++
			}
			opAmount--
			return matched
		}


		if (data.op === "FIND_GUILD") {
			const d = await filterCache("find", "guild", data.params || {})
			if (d[0] === "failed") return
			return response.status(200).send(worker.createDataResponse(d)).end()


		} else if (data.op === "FILTER_GUILDS") {
			const q = data.params || {}
			// @ts-ignore
			const limit = q.limit
			// @ts-ignore
			delete q.limit
			const d = await filterCache("filter", "guild", q, { limit })
			if (d[0] === "failed") return
			return response.status(200).send(worker.createDataResponse(d)).end()


		} else if (data.op === "FIND_CHANNEL") {
			const d = await filterCache("find", "channel", data.params || {})
			if (d[0] === "failed") return
			return response.status(200).send(worker.createDataResponse(d)).end()


		} else if (data.op === "FILTER_CHANNELS") {
			const q = data.params || {}
			// @ts-ignore
			const limit = q.limit
			// @ts-ignore
			delete q.limit
			const d = await filterCache("filter", "channel", q, { limit })
			if (d[0] === "failed") return
			return response.status(200).send(worker.createDataResponse(d)).end()


		} else if (data.op === "GET_USER") {
			opAmount++
			totalOps++
			/** @type {{ id: string }} */
			// @ts-ignore
			const query = data.params || {}
			if (!query.id) {
				opAmount--
				return response.status(400).send(worker.createErrorResponse("Missing id field")).end()
			}
			let user
			try {
				user = await rain.cache.user.get(query.id)
			} catch (e) {
				opAmount--
				return sendInternalError(e)
			}
			const obj = user && user.boundObject ? user.boundObject : (user ? user : null)
			opAmount--
			return response.status(200).send(worker.createDataResponse(obj)).end()


		} else if (data.op === "FIND_USER") {
			const d = await filterCache("find", "user", data.params || {})
			if (d[0] === "failed") return
			return response.status(200).send(worker.createDataResponse(d)).end()


		} else if (data.op === "FILTER_USERS") {
			const q = data.params || {}
			// @ts-ignore
			const limit = q.limit
			// @ts-ignore
			delete q.limit
			const d = await filterCache("filter", "user", q, { limit })
			if (d[0] === "failed") return
			return response.status(200).send(worker.createDataResponse(d)).end()


		} else if (data.op === "FIND_MEMBER") {
			const d = await filterCache("find", "member", data.params || {})
			if (d[0] === "failed") return
			return response.status(200).send(worker.createDataResponse(d)).end()


		} else if (data.op === "FILTER_MEMBERS") {
			const q = data.params || {}
			// @ts-ignore
			const limit = q.limit
			// @ts-ignore
			delete q.limit
			const d = await filterCache("filter", "member", q, { limit })
			if (d[0] === "failed") return
			return response.status(200).send(worker.createDataResponse(d)).end()


		} else if (data.op === "GET_USER_GUILDS") {
			opAmount++
			totalOps++
			/** @type {{ id: string }} */
			// @ts-ignore
			const query = data.params || {}

			let guilds
			try {
				guilds = await rain.cache.guild.getIndexMembers()
			} catch (e) {
				opAmount--
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
						opAmount--
						return sendInternalError(e)
					}
					indexed.filter(i => i[1]).forEach(item => matched.push(item[0]))
					pass++
				}
			}
			opAmount--
			return response.status(200).send(worker.createDataResponse(matched)).end()

		} else if (data.op === "GET_MEMBERS_IN_ROLE") {
			opAmount++
			totalOps++
			/** @type {{ role_id: string, guild_id: string }} */
			// @ts-ignore
			const query = data.params || {}

			if (!query.guild_id || !query.role_id) {
				opAmount--
				return response.status(400).send(worker.createErrorResponse("Missing guild_id or role_id fields"))
			}
			let members
			try {
				members = await rain.cache.member.getIndexMembers(query.guild_id)
			} catch (e) {
				opAmount--
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
					opAmount--
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
						opAmount--
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
			opAmount--
			return response.status(200).send(worker.createDataResponse(matched)).end()


		} else if (data.op === "FIND_VOICE_STATE") {
			const d = await filterCache("find", "voiceState", data.params || {})
			if (d[0] === "failed") return
			return response.status(200).send(worker.createDataResponse(d)).end()


		} else if (data.op === "FILTER_VOICE_STATES") {
			const q = data.params || {}
			// @ts-ignore
			const limit = q.limit
			// @ts-ignore
			delete q.limit
			const d = await filterCache("filter", "voiceState", q, { limit })
			if (d[0] === "failed") return
			return response.status(200).send(worker.createDataResponse(d)).end()


		} else if (data.op === "SAVE_DATA") {
			opAmount++
			totalOps++
			/** @type {import("./typings").CacheSaveData} */
			// @ts-ignore
			const query = data.params || {}
			if (!query.type || !query.data) {
				opAmount--
				return response.status(400).send(worker.createErrorResponse("Missing type or data field")).end()
			}
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
				opAmount--
				return sendInternalError(e)
			}
			opAmount--
			return response.status(200).send(worker.createDataResponse("Saved")).end()


		} else if (data.op === "DELETE_USER") {
			opAmount++
			totalOps++
			/** @type {{ id: string }}} */
			// @ts-ignore
			const query = data.params || {}
			if (!query.id) {
				opAmount--
				return response.status(400).send(worker.createErrorResponse("Missing id field")).end()
			}
			try {
				await rain.cache.user.removeFromIndex(query.id)
			} catch (e) {
				opAmount--
				return sendInternalError(e)
			}
			return response.status(200).send(worker.createDataResponse("Deleted")).end()


		} else if (data.op === "DELETE_USERS") {
			opAmount++
			totalOps++
			/** @type {import("./typings").CacheUserData & { limit?: number, ids?: Array<string>, confirm?: boolean }}} */
			// @ts-ignore
			const query = data.params || {}
			if (!query.ids && !query.discriminator && !query.id && !query.tag && !query.username) {
				if (!query.confirm) {
					opAmount--
					return response.status(400).send(worker.createErrorResponse("Missing all fields")).end()
				} else {
					await rain.cache.user.removeIndex()
					opAmount--
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
						opAmount--
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
							opAmount--
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
					opAmount--
					if (matched.length > 0) return response.status(200).send(worker.createDataResponse(matched.map(m => m.id))).end()
					else return response.status(200).send(worker.createDataResponse([]))
				}
			} catch (e) {
				opAmount--
				return sendInternalError(e)
			}
			opAmount--
			return sendInternalError("How did we get here?")


		} else response.status(400).send(worker.createErrorResponse("Invalid op")).end()
	})

	worker.post("/gateway", async (request, response) => {
		if (!request.body) return response.status(204).send(worker.createErrorResponse("No payload")).end()
		response.status(200).send(worker.createDataResponse("ACK")).end()
		/** @type {import("thunderstorm/dist/internal").InboundDataType<keyof import("thunderstorm/dist/internal").CloudStormEventDataTable>} */
		const data = request.body
		await rain.eventProcessor.inbound(data)
		connection.channel.sendToQueue(config.amqp_data_queue, Buffer.from(JSON.stringify(request.body)))
	})
})()
