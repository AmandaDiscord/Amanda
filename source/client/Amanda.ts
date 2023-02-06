import { EventEmitter } from "events"

interface Events {
	gateway: [import("discord-api-types/v10").GatewayDispatchPayload & { shard_id: number; cluster_id: string }],
	ready: []
}

interface Amanda {
	addListener<E extends keyof Events>(event: E, listener: (...args: Events[E]) => unknown): this;
	emit<E extends keyof Events>(event: E, ...args: Events[E]): boolean;
	eventNames(): Array<keyof Events>;
	listenerCount(event: keyof Events): number;
	listeners(event: keyof Events): Array<(...args: Array<unknown>) => unknown>;
	off<E extends keyof Events>(event: E, listener: (...args: Events[E]) => unknown): this;
	on<E extends keyof Events>(event: E, listener: (...args: Events[E]) => unknown): this;
	once<E extends keyof Events>(event: E, listener: (...args: Events[E]) => unknown): this;
	prependListener<E extends keyof Events>(event: E, listener: (...args: Events[E]) => unknown): this;
	prependOnceListener<E extends keyof Events>(event: E, listener: (...args: Events[E]) => unknown): this;
	rawListeners(event: keyof Events): Array<(...args: Array<unknown>) => unknown>;
	removeAllListeners(event?: keyof Events): this;
	removeListener<E extends keyof Events>(event: E, listener: (...args: Events[E]) => unknown): this;
}

class Amanda extends EventEmitter {
	public snow: import("snowtransfer").SnowTransfer
	public user: import("discord-api-types/v10").APIUser

	public constructor(snow: import("snowtransfer").SnowTransfer) {
		super()
		this.snow = snow
	}
}

export = Amanda
