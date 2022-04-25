import { EventEmitter } from "events"

interface Events {
	gateway: [import("discord-typings").GatewayPayload],
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
	public lavalink: import("lavacord").Manager | undefined
	public snow: import("snowtransfer").SnowTransfer
	public ready = false
	public user: import("discord-typings").User
	public application: import("discord-typings").Application

	public constructor(snow: import("snowtransfer").SnowTransfer) {
		super()
		this.snow = snow
	}
}

export = Amanda
