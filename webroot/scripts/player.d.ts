export type Packet<T> = {
	nonce?: number;
	op: typeof import("./utilities").opcodes[keyof typeof import("./utilities").opcodes],
	d?: T
}

export class Session {
	public ws: WebSocket
	public state: import("../../source/types").WebQueue | null
	public player: import("./classes").Player
	public queue: import("./classes").Queue
	public voiceInfo: import("./classes").VoiceInfo
	public sideControls: import("./classes").SideControls
	public listenManager: import("./wrappers/ListenManager").ListenManager

	public constructor(webs: WebSocket)

	public send(data: Packet<unknown>): void
	public onOpen(): void
	public onClose(event: CloseEvent): void
	public acknowledge(data: Packet<{ serverTimeDiff: number }>): void
	public updateState(data: Packet<Partial<NonNullable<Session["state"]>> | null>): void
	public listenersUpdate(data: Packet<{ members: import("../../source/types").WebQueue["members"] }>): void
	public trackAdd(data: Packet<{ position: number; track: ReturnType<import("../../source/music/tracktypes").Track["toObject"]> }>): void
	public trackRemove(data: Packet<{ index: number }>): void
	public clearQueue(): void
	public next(): void
	public trackUpdate(data: Packet<{ index: number; track: ReturnType<import("../../source/music/tracktypes").Track["toObject"]> }>): void
	public timeUpdate(data: Packet<{ playing: boolean; }>): void
	public resetTime(): void
	public updatePlayerTime(): void
	public togglePlayback(): void
	public skip(): void
	public stop(): void
	public attributesChange(data: Packet<{ loop: boolean }>): void
	public requestAttributesChange(data: { loop: boolean }): void
}
