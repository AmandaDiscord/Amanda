import { createClient, type RedisClientType } from "redis"

import confprovider = require("@amanda/config")

/**
 * Wrapper around the redis lib that handles data formatting
 * and indexing automatically
 */
class RedisProvider {
	/** The backing client for the redis connection */
	public static client: RedisClientType | null = null

	/**
	 * Get data from a namespace by id
	 * @param namespace The namespace (to prevent id collisions as they can be the same across different namespaces)
	 * @param id The id of the resource
	 */
	public static async GET<T = any>(namespace: string, id: string): Promise<T | null> {
		if (!RedisProvider.client) return null
		const data = await RedisProvider.client.GET(`${namespace}.${id}`)
		if (!data) return null
		return JSON.parse(data)
	}

	/**
	 * Adds data to a key and optionally, to a Set (index)
	 * @param namespace The namespace (to prevent id collisions as they can be the same across different namespaces)
	 * @param id The id of the resource
	 * @param data The data to set
	 * @param index The Set to add the id to
	 */
	public static async SET(namespace: string, id: string, data: Record<string | number | symbol, any>, index?: string): Promise<void> {
		if (!RedisProvider.client) return
		await Promise.all([
			RedisProvider.client.SET(`${namespace}.${id}`, JSON.stringify(data)),
			index ? RedisProvider.SADD(index, id) : Promise.resolve(void 0)
		])
	}

	/**
	 * Removes data from a key and optionally, from a Set (index) and can drop it
	 * @param namespace The namespace (to prevent id collisions as they can be the same across different namespaces)
	 * @param id The id of the resource
	 * @param index The Set to remove the id from
	 * @param dropIndex If the entire Set should be removed (the data remains intact, just unindexed)
	 */
	public static async DEL(namespace: string, id: string, index?: string, dropIndex?: boolean): Promise<void> {
		if (!RedisProvider.client) return
		await Promise.all([
			RedisProvider.client.DEL(`${namespace}.${id}`),
			index ? RedisProvider.SREM(index, id, dropIndex) : Promise.resolve(void 0)
		])
	}

	/**
	 * Adds one or multiple member to a Set (index)
	 * @param index The Set to add the id(s) to
	 * @param id The id(s) of the resource
	 */
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

	/**
	 * Removes a member from a Set (index) and optionally drops it
	 * @param index The Set to remove the id(s) from
	 * @param id The id(s) of the resource
	 * @param dropIndex If the entire Set should be removed (the data remains intact, just unindexed)
	 */
	public static async SREM(index: string, id: string | Array<string>, dropIndex?: boolean): Promise<void> {
		if (!RedisProvider.client) return
		await Promise.all([
			typeof id === "string" || (Array.isArray(id) && id.length) ? RedisProvider.client.SREM(index, id) : Promise.resolve(void 0),
			dropIndex ? RedisProvider.client.DEL(index) : Promise.resolve(void 0)
		])
	}

	/**
	 * Get all members within a Set (index)
	 * @param index The Set to get all members of
	 */
	public static async SMEMBERS(index: string): Promise<Array<string>> {
		const members = await RedisProvider.client?.SMEMBERS(index)
		return members ?? []
	}

	/**
	 * Determines if an ID is in a Set (index)
	 * @param index The Set to test against
	 * @param id The id of the resource
	 */
	public static async SISMEMBER(index: string, id: string): Promise<boolean> {
		const is = await RedisProvider.client?.SISMEMBER(index, id)
		return !!is
	}

	/**
	 * Counts how many members are in a Set (index)
	 * @param index The Set to count
	 */
	public static async SCARD(index: string): Promise<number> {
		const amount = await RedisProvider.client?.SCARD(index)
		return amount ?? 0
	}

	/**
	 * Internal method that gets called when the config file changes
	 */
	public static onConfigChange(): void {
		if (confprovider.config.redis_enabled && !RedisProvider.client) RedisProvider.connect()
		else if (!confprovider.config.redis_enabled && RedisProvider.client) RedisProvider.disconnect()
	}

	/**
	 * Initiate the connection of the RedisProvider
	 */
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

	/**
	 * Destroy the connection of the RedisProvider
	 */
	public static disconnect(): void {
		if (!RedisProvider.client) return

		const client = RedisProvider.client

		client.quit().then(() => client.removeListener("error", RedisProvider.onClientError)).catch(console.error)
		console.log("Redis disabled")
		RedisProvider.client = null
	}

	/**
	 * Internal logger function that can be removed by reference on disconnect
	 */
	public static onClientError(...params: Array<any>): void {
		console.error(...params)
	}
}

confprovider.addCallback(RedisProvider.onConfigChange)

export = RedisProvider
