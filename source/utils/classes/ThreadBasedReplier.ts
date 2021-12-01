import passthrough from "../../passthrough"
const { sync } = passthrough

const SingleUseMap = sync.require("./SingleUseMap") as typeof import("./SingleUseMap")

class ThreadBasedReplier<OPS extends { [op: string]: number }> {
	public outgoing = new SingleUseMap<string, (value: unknown) => void>()
	public outgoingPersist = new SingleUseMap<string, { list: Array<unknown>, amount: number }>()
	public lastThreadID = 0n

	private get nextThreadID() {
		return `${process.pid}_${(++this.lastThreadID)}`
	}

	private buildRequest<O extends OPS[keyof OPS], D>(op: O, data: D) {
		return { t: this.nextThreadID, o: op, d: data }
	}

	public request<O extends OPS[keyof OPS], D>(op: O, data: D, sendFN: (raw: { t: string; o: O; d: D }) => unknown): Promise<unknown>
	public request<O extends OPS[keyof OPS], D>(op: O, data: D, sendFn: (raw: { t: string; o: O; d: D }) => unknown, amount: number, timeout?: number): Promise<Array<unknown>>
	public request<O extends OPS[keyof OPS], D>(op: O, data: D, sendFn: (raw: { t: string; o: O; d: D }) => unknown, amount?: number, timeout?: number): Promise<unknown | Array<unknown>> {
		// 3. request to a client
		const raw = this.buildRequest(op, data)
		sendFn(raw)
		return new Promise(resolve => {
			// 4. create a promise whose resolve will be called later when threadID is consumed
			if (amount) {
				this.outgoingPersist.set(raw.t, { list: [], amount })
				if (timeout) {
					setTimeout(() => {
						const persist = this.outgoingPersist.get(raw.t)
						if (persist) this.outgoing.use(raw.t)?.(persist.list) // don't call resolve directly because the Promise could already be fulfilled and consumed.
						this.outgoing.delete(raw.t)
						this.outgoingPersist.delete(raw.t)
					}, timeout)
				}
			}
			this.outgoing.set(raw.t, resolve)
		})
	}

	public consume(data: { t: string, d: unknown }) {
		if (!this.outgoing.has(data.t) && !this.outgoingPersist.has(data.t)) return
		const persist = this.outgoingPersist.get(data.t)
		if (persist) {
			if (!this.outgoing.has(data.t)) void this.outgoingPersist.delete(data.t)
			persist.list.push(data.d)
			if (persist.amount === persist.list.length) {
				this.outgoing.use(data.t)?.(persist.list)
				this.outgoingPersist.delete(data.t)
			}
			return
		}

		this.outgoing.use(data.t)?.(data.d)
	}

	public trigger(threadID: string) {
		if (this.outgoing.has(threadID) && this.outgoingPersist.has(threadID)) {
			this.outgoing.use(threadID)?.(this.outgoingPersist.use(threadID)?.list || [])
		}
	}
}

export = ThreadBasedReplier
