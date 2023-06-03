import amqp = require("amqplib")
import type { Channel, ConsumeMessage } from "amqplib"

import type ConfigProvider = require("@amanda/config")

class AMQPProvider {
	public channel: Channel | null = null

	public constructor(
		public confprovider: ConfigProvider,
		public queues: { [queue: string]: ((message: ConsumeMessage | null, amqpProvider: AMQPProvider) => unknown) | undefined }
	) {
		confprovider.addCallback(this.onConfigChange.bind(this))
	}

	public async connect() {
		if (!this.confprovider.config.amqp_enabled) return

		const connection = await amqp.connect(this.confprovider.config.amqp_url).catch(e => void console.error(e))
		if (!connection) return

		try {
			const channel = await connection.createChannel()
			for (const queue of Object.keys(this.queues)) {
				await channel.assertQueue(queue, { durable: false, autoDelete: true })
			}
			console.log("Connected to AMQP")
			this.channel = channel
		} catch {
			return
		}

		for (const [queue, callback] of Object.entries(this.queues)) {
			if (callback) this.channel.consume(queue, message => callback(message, this)).catch(console.error)
		}
		this.channel.once("close", (...args) => this.onChannelClose(...args))
	}

	public async disconnect() {
		if (!this.channel) return
		await this.channel.connection.close()
			.then(() => console.warn("AMQP disabled"))
			.catch(console.error)
		this.channel = null
	}

	private onChannelClose(...args: Array<unknown>) {
		console.error(...args)
	}

	private onConfigChange(): void {
		if (this.confprovider.config.amqp_enabled && !this.channel) this.connect().catch(console.error)
		else if (!this.confprovider.config.amqp_enabled && this.channel) this.disconnect().catch(console.error)
	}
}

export = AMQPProvider
