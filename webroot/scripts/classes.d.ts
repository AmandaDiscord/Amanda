declare class ElemJS {
	public parent: ElemJS | undefined
	public children: Array<ElemJS>
	public element: HTMLElement

	public constructor(type: string | HTMLElement)

	public bind(element: string | HTMLElement): this
	public class(...tokens: Parameters<HTMLElement["classList"]["add"]>): this
	public direct<K extends keyof HTMLElement>(name: K, value: HTMLElement[K]): this
	public attribute(...params: Parameters<HTMLElement["setAttribute"]>): this
	public style<K extends keyof HTMLElement["style"]>(name: K, value: HTMLElement["style"][K]): this
	public id(name: string): this
	public text(name: string): this
	public html(name: string): this
	public child(toAdd: any, position?: number): this
	public clearChildren(): void
}

declare class AnonImage extends ElemJS {
	public constructor(url: string)
}

export class Player extends ElemJS {
	public session: import("./player").Session
	public track: ReturnType<import("../../source/music/tracktypes").Track["toObject"]> | null
	public thumbnailDisplayHeight: number
	public attributes: { loop?: boolean }
	public trackSet: boolean
	public parts: { controls: ElemJS | undefined, time: PlayerTime }

	public constructor(container: string | HTMLElement, session: import("./player").Session)

	public setTrack(track: NonNullable<Player["track"]> | null): void
	public updateData(data: Partial<NonNullable<Player["track"]>>): void
	public updateTime(data: Parameters<PlayerTime["update"]>["0"]): void
	public updateAttributes(data: Player["attributes"]): void
	public render(): void
}

export class PlayerTime extends ElemJS {
	public animation: ReturnType<HTMLElement["animate"]> | null
	public interval: NodeJS.Timer | null
	public state: { playing: boolean; trackStartTime: number; pausedAt: number | null; maxTime: number; live: boolean }

	public update(data: Partial<PlayerTime["state"]>): void
	public getTime(): number
	public getMSRemaining(): number
	public getTransform(): string
	public render(): void
	public renderCurrentTime(): void
}

export class Queue extends ElemJS {
	public addingCount: number
	public animateMax: number
	public isFirstAdd: boolean

	public children: Array<QueueItem>

	public constructor(container: string | HTMLElement, session: import("./player").Session)

	public addItem(data: QueueItem["data"], position?: number): void
	public removeIndex(index: number): void
	public removeAllTracks(): void
	public shift(): void
	public replaceItems(data: Array<Parameters<this["addItem"]>["0"]>): void
}

export class QueueItem extends ElemJS {
	public data: Partial<ReturnType<import("../../source/music/tracktypes").Track["toObject"]>>
	public queue: Queue
	public adding: boolean
	public removing: boolean
	public parts: { title: ElemJS | undefined, length: ElemJS | undefined, controls: ElemJS | undefined }

	public constructor(data: QueueItem["data"], queue: Queue)

	public updateData(data: QueueItem["data"]): void
	public render(): void
	public preloadThumbnail(): void
	public remove(): void
	public disable(): void
	public animateAdd(): void
	public animateRemove(): void
	public animateShift(): void
}

export class VoiceInfo extends ElemJS {
	public oldMembers: Array<string>
	public members: Array<string>
	public memberStore: Map<string, VoiceMember>

	public constructor(container: string | HTMLElement)

	public setMembers(members: import("../../source/types").WebQueue["members"]): void
	public render(): void
}

export class VoiceMember extends ElemJS {
	public props: import("../../source/types").InferMap<import("../../source/music/queue").Queue["listeners"]>["value"]
	public avatarSize: number
	public parts: { avatar: AnonImage; name: ElemJS }
	public isNew: boolean
	public leaving: boolean

	public constructor(props: VoiceMember["props"])

	public join(voiceInfo: ElemJS): Promise<void>
	public addSelf(voiceInfo: ElemJS): void
	public leave(): Promise<Array<void>>
	public animateJoin(): void
	public animateLeave(): Promise<Array<void>>
	public getAvatar(): AnonImage
	public getName(): ElemJS
}

declare class SideControl extends ElemJS {
	public disabled: boolean
	public sideControls: SideControls

	public constructor(sideControls: SideControls, name: string, image: string)
}

declare class AddTrackControl extends SideControl {
	public constructor(sideControls: SideControls)

	public onClick(): void
}

declare class TrackInfoControl extends SideControl {
	public constructor(sideControls: SideControls)

	public render(): void
}

declare class ClearQueueControl extends SideControl {
	public constructor(sideControls: SideControls)

	public onClick(): void
	public render(): void
}

declare class ListenInBrowserControl extends SideControl {
	public started: boolean

	public constructor(sideControls: SideControls)

	public onClick(): void
	public render(): void
}

export class SideControls extends ElemJS {
	public session: import("./player").Session
	public mainLoaded: boolean
	public parts: { listen: ListenInBrowserControl; add: AddTrackControl; info: TrackInfoControl; clear: ClearQueueControl }
	public partsList: Array<SideControl>

	public constructor(container: string | HTMLElement, session: import("./player").Session)

	public render(): void
}
