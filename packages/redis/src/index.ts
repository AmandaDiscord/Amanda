import { createClient, type RedisClientType } from "redis"

import confprovider = require("@amanda/config")

class RedisProvider {
	public static client: RedisClientType | null = null

	public static async GET<T = any>(namespace: string, id: string): Promise<T | null> {
		if (!RedisProvider.client) return null
		const data = await RedisProvider.client.GET(`${namespace}.${id}`)
		if (!data) return null
		return JSON.parse(data)
	}

	public static async SET(namespace: string, id: string, data: Record<string | number | symbol, any>, index?: string): Promise<void> {
		if (!RedisProvider.client) return
		await Promise.all([
			RedisProvider.client.SET(`${namespace}.${id}`, JSON.stringify(data)),
			index ? RedisProvider.SADD(index, id) : Promise.resolve(void 0)
		])
	}

	public static async DEL(namespace: string, id: string, index?: string, dropIndex?: boolean): Promise<void> {
		if (!RedisProvider.client) return
		await Promise.all([
			RedisProvider.client.DEL(`${namespace}.${id}`),
			index ? RedisProvider.SREM(index, id, dropIndex) : Promise.resolve(void 0)
		])
	}

	public static async SADD(index: string, id: string | Array<string>): Promise<void> {
		if (!RedisProvider.client) return
		const client = RedisProvider.client
		let mapped: Array<Promise<boolean>>
		if (Array.isArray(id)) mapped = id.map(i => RedisProvider.SISMEMBER(index, i))
		else mapped = [RedisProvider.SISMEMBER(index, id)]
		const existing = await Promise.all(mapped)
		const filtered = (Array.isArray(id) ? id : [id]).filter((item, ind) => !existing[ind])
		if (!filtered.length) return
		await client.SADD(index, filtered)
	}

	public static async SREM(index: string, id: string | Array<string>, dropIndex?: boolean): Promise<void> {
		if (!RedisProvider.client) return
		await Promise.all([
			typeof id === "string" || (Array.isArray(id) && id.length) ? RedisProvider.client.SREM(index, id) : Promise.resolve(void 0),
			dropIndex ? RedisProvider.client.DEL(index) : Promise.resolve(void 0)
		])
	}

	public static async SMEMBERS(index: string): Promise<Array<string>> {
		const members = await RedisProvider.client?.SMEMBERS(index)
		return members ?? []
	}

	public static async SISMEMBER(index: string, id: string): Promise<boolean> {
		const is = await RedisProvider.client?.SISMEMBER(index, id)
		return !!is
	}

	public static onConfigChange(): void {
		if (confprovider.config.redis_enabled && !RedisProvider.client) RedisProvider.connect()
		else if (!confprovider.config.redis_enabled && RedisProvider.client) RedisProvider.disconnect()
	}

	public static async connect(): Promise<void> {
		if (!confprovider.config.redis_enabled) return

		RedisProvider.client = createClient({
			url: `redis://${confprovider.config.redis_user}:${confprovider.config.redis_password}@${confprovider.config.redis_domain}`,
			socket: {
				reconnectStrategy: 10000
			}
		})

		RedisProvider.client.on("error", RedisProvider.onClientError)

		await RedisProvider.client.connect()
		console.log("Connected to Redis")
	}

	public static disconnect(): void {
		if (!RedisProvider.client) return

		const client = RedisProvider.client

		client.quit().then(() => client.removeListener("error", RedisProvider.onClientError)).catch(console.error)
		console.log("Redis disabled")
		RedisProvider.client = null
	}

	public static onClientError(...params: Array<any>): void {
		console.error(...params)
	}
}

export = RedisProvider
