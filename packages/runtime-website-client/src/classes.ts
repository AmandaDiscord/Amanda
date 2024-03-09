import { imageStore } from "./imagestore"
import { prettySeconds, opcodes } from "./utilities.js"

import "./global"
import type { Session } from "./player"
import type { Queue as WebQueue } from "../../runtime-website/src/music/queue.js"
import type { Track as WebTrack } from "../../runtime-website/src/music/tracktypes.js"
import type { UnpackArray } from "../../shared-types/index"

// From HTML
const serverTimeDiff = _serverTimeDiff

type WebQueueMembers = ReturnType<WebQueue["toJSON"]>["members"]
type WebTrackJSON = ReturnType<WebTrack["toObject"]>

export class ElemJS<E extends HTMLElement = HTMLElement> {
	public parent: ElemJS<HTMLElement>
	public children: Array<ElemJS<HTMLElement>> = []
	public element: E

	public constructor(type: keyof HTMLElementTagNameMap | E) {
		if (type instanceof HTMLElement) this.bind(type)
		else this.bind(document.createElement(type) as E)
	}

	public bind(element: E): this {
		this.element = element
		this.element.js = this
		return this
	}

	public class(...classes: Array<string>): this {
		for (const name of classes) if (name) this.element.classList.add(name)
		return this
	}

	public direct<K extends keyof E>(name: K, value: E[K]): this {
		if (name) this.element[name] = value
		return this
	}

	public attribute(name: string, value: string): this {
		if (name) this.element.setAttribute(name, value)
		return this
	}

	public style<K extends keyof HTMLElement["style"]>(name: K, value: HTMLElement["style"][K]): this {
		if (name) this.element.style[name] = value
		return this
	}

	public id(name: string): this {
		if (name) this.element.id = name
		return this
	}

	public text(name: string): this {
		this.element.innerText = name
		return this
	}

	public html(name: string): this {
		this.element.innerHTML = name
		return this
	}

	public child(toAdd?: ElemJS<HTMLElement>, position?: number): this {
		if (typeof (toAdd) === "object") {
			toAdd.parent = this

			if (typeof (position) === "number" && position >= 0) {
				this.element.insertBefore(toAdd.element, this.element.children[position])
				this.children.splice(position, 0, toAdd)
			} else {
				this.element.appendChild(toAdd.element)
				this.children.push(toAdd)
			}
		}

		return this
	}

	public clearChildren(): void {
		this.children.length = 0
		while (this.element.lastChild) this.element.removeChild(this.element.lastChild)
	}
}

class AnonImage extends ElemJS<HTMLImageElement> {
	public constructor(url: string) {
		super("img")
		this.direct("crossOrigin", "anonymous")
		this.direct("src", url)
	}
}

const r = /[.#]?[\w-]+/g
const spaceRegex = /^\s*/

function ejs(string: string | TemplateStringsArray): ElemJS | undefined {
	const indentHistory = new Map<number, ElemJS>()
	const lines = string[0].split("\n")

	lines.forEach(line => {
		const indent = spaceRegex.exec(line)![0].length
		line = line.replace(spaceRegex, "")
		let element: ElemJS | undefined
		let next: any = null

		do {
			next = r.exec(line)
			if (next) {
				next = next[0]
				if (next.startsWith("#")) element!.id(next.slice(1))
				else if (next.startsWith(".")) element!.class(next.slice(1))
				else element = new ElemJS(next)
			}
		} while (next)

		indentHistory.set(indent, element!)
		if (indent > 0) indentHistory.get(indent - 1)!.child(element)
	})

	return indentHistory.get(0)
}

export class Queue<E extends HTMLElement = HTMLElement> extends ElemJS<E> {
	public addingCount = 0
	public animateMax = 12
	public isFirstAdd = true

	declare public children: Array<QueueItem<this>>

	public constructor(container: E, public session: Session) {
		super(container)
	}

	public addItem(data: WebTrackJSON, position?: number): void {
		const shouldAnimate = this.addingCount < this.animateMax
		const e = new QueueItem(data, this)
		if (shouldAnimate) {
			this.child(e, position)
			e.animateAdd()
		} else {
			setTimeout(() => {
				this.child(e, position)
			}, 1300)
		}
	}

	public removeIndex(index: number): void {
		const removed = this.children.splice(index, 1)[0]
		if (removed) removed.animateRemove()
	}

	public removeAllTracks(): void {
		// queue does not include now playing, so clear the queue by removing all
		if (this.children.length <= this.animateMax) {
			for (const item of this.children) {
				item.animateRemove()
			}
			this.children.length = 0
		} else this.clearChildren()
	}

	public shift(): void {
		const removed = this.children.shift()
		// if (removed) this.element.removeChild(removed.element)
		if (removed) removed.animateShift()
	}

	public replaceItems(data: Array<Parameters<Queue["addItem"]>["0"]>): void {
		this.clearChildren()
		data.forEach(item => this.addItem(item))
	}
}

export class QueueItem<Q extends Queue> extends ElemJS<HTMLDivElement> {
	public adding = false
	public removing = false
	public parts = {
		title: ejs`div.song-title` as ElemJS<HTMLDivElement>,
		length: ejs`div.song-length` as ElemJS<HTMLDivElement>,
		controls: ejs`div.song-management` as ElemJS<HTMLDivElement>
	}
	public data: WebTrackJSON = {} as WebTrackJSON
	public shifting = false

	declare public parent: Q

	public constructor(data: WebTrackJSON, public queue: Q) {
		super("div")
		this.class("queue-item")

		;["play", "remove"].forEach(icon => {
			const child = new AnonImage(`/images/${icon}.svg`).direct("onclick", () => this[icon]())
			this.parts.controls.child(child)
		})

		this.updateData(data)
	}

	public updateData(data: WebTrackJSON): void {
		Object.assign(this.data, data)
		this.render()
		this.preloadThumbnail()
	}

	public render(): void {
		this.clearChildren()
		this.parts.title.text(this.data.title)
		this.parts.length.text(prettySeconds(this.data.length))
		this.child(this.parts.title)
		this.child(this.parts.length)
		this.child(this.parts.controls)
	}

	public preloadThumbnail(): void {
		if (this.data.thumbnail.src.length) imageStore.add(this.data.thumbnail.src)
	}

	public play(): void {
		const index = this.queue.children.indexOf(this)
		this.disable()
		this.queue.session.send({
			op: opcodes.TRACK_PLAY_NOW,
			d: { index: index + 1 }
		})
	}

	public remove(): void {
		const index = this.queue.children.indexOf(this)
		this.disable()
		this.queue.session.send({
			op: opcodes.TRACK_REMOVE,
			d: { index: index + 1 }
		})
	}

	public disable(): void {
		this.class("disabled")
		this.parts.controls.children.forEach(button => button.direct("onclick", null))
	}

	public animateAdd(): void {
		if (this.adding) return
		const addOffsetPerItem = 70
		const animationTime = 400
		const addOffsetForFirst = 200

		this.adding = true
		// backup animation check, but this should always pass
		const shouldAnimate = this.queue.addingCount < this.queue.animateMax
		if (shouldAnimate) {
			// this is where the count is actually increased
			this.queue.addingCount++

			const style = window.getComputedStyle(this.element)
			const props = ["height", "paddingTop", "paddingBottom", "marginBottom"]

			const values: Keyframe = {}
			props.forEach(key => {
				values[key] = "0px"
			})
			values.opacity = 0
			values.marginBottom = "-10px"
			values.easing = "ease"

			const endValues: Keyframe = {}
			props.forEach(key => {
				endValues[key] = style[key]
			})
			if (this.element.children[2].getBoundingClientRect().height < 1) endValues.height = parseInt(endValues.height as string) + 24 + "px"
			endValues.opacity = 1

			Object.entries(values).forEach(entry => {
				this.element.style[entry[0]] = entry[1]
			})

			setTimeout(() => {
				this.element.animate([
					values, endValues
				], animationTime).addEventListener("finish", () => {
					this.adding = false
					if (shouldAnimate) this.queue.addingCount--
					Object.entries(values).forEach(entry => {
						this.element.style[entry[0]] = ""
					})
				})
			}, this.queue.addingCount * addOffsetPerItem + (+this.queue.isFirstAdd * addOffsetForFirst))
		} else {
			this.element.style.display = "none"
			setTimeout(() => {
				this.element.style.display = ""
			}, this.queue.addingCount * addOffsetPerItem + (+this.queue.isFirstAdd * addOffsetForFirst + animationTime))
		}
	}

	public animateRemove(): void {
		if (this.removing) return
		this.removing = true

		this.disable()

		const style = window.getComputedStyle(this.element)
		const props = ["height", "paddingTop", "paddingBottom", "marginBottom"]

		const values: Keyframe = {}
		props.forEach(key => {
			values[key] = style[key]
		})
		values.easing = "ease"
		values.opacity = 1

		const endValues: Keyframe = {}
		props.forEach(key => {
			endValues[key] = "0px"
		})
		endValues.opacity = 0
		endValues.marginBottom = "-10px"

		this.element.animate([
			values, endValues
		], 400).addEventListener("finish", () => {
			this.element.remove()
		})
	}

	public animateShift(): void {
		if (this.shifting) return
		this.shifting = true

		const height = Math.floor(this.element.getBoundingClientRect().height) + 20

		this.queue.element.animate([
			{ top: "0px", easing: "ease-out" },
			{ top: -height + "px" }
		], 400).addEventListener("finish", () => {
			this.element.remove()
		})
		this.element.animate([
			{ opacity: 1 }, { opacity: 0 }
		], 200).addEventListener("finish", () => {
			this.element.style.opacity = "0"
		})
	}
}

class AttributeButton extends ElemJS<HTMLImageElement> {
	public constructor(public player: Player<HTMLElement>, public propertyName: keyof Player<HTMLElement>["attributes"]) {
		super("img")

		this.direct("onclick", () => {
			this.player.attributes[propertyName] = !this.player.attributes[propertyName]
			this.player.session.requestAttributesChange({ [propertyName]: this.player.attributes[propertyName] }) // this actually toggles
			this.render()
		})

		this.render()
	}

	public render(): void {
		this.direct("src", `/images/${this.propertyName}_${this.player.attributes[this.propertyName] ? "active" : "inactive"}.svg`)
	}
}

export class Player<E extends HTMLElement> extends ElemJS<E> {
	public track: WebTrackJSON | null = null
	public thumbnailDisplayHeight = 94
	public attributes = {
		loop: false
	}
	public trackSet = false
	public parts: {
		controls: ElemJS<HTMLElement>
		time: PlayerTime
		loopButton: AttributeButton
	} = {
			controls: ejs`div.controls`!,
			time: new PlayerTime(),
			loopButton: new AttributeButton(this, "loop")
		}

	public constructor(container: E, public session: Session) {
		super(container)

		;(["rewind" as const, "togglePlayback" as const, "skip" as const, "stop" as const]).forEach(icon => {
			this.parts.controls.child(new AnonImage(`/images/${icon}.svg`).direct("onclick", () => this.session[icon]()))
		})
		this.parts.controls.child(this.parts.loopButton)
		this.render()
	}

	public setTrack(track: WebTrackJSON | null): void {
		this.trackSet = true
		this.track = track
		this.render()
	}

	public updateData(data: WebTrackJSON): void {
		this.trackSet = true
		Object.assign(this.track!, data)
		this.render()
	}

	public updateTime(data: Parameters<PlayerTime["update"]>["0"]): void {
		this.parts.time.update(data)
	}

	public updateAttributes(data: Player<E>["attributes"]): void {
		this.attributes = data
		this.parts.loopButton.render()
	}

	public render(): void {
		this.clearChildren()
		if (this.track) {
			const thumbnail = new ElemJS(imageStore.get(this.track.thumbnail.src)!)
			thumbnail.element.width = this.track.thumbnail.width
			thumbnail.element.height = this.track.thumbnail.height
			thumbnail.element.style.width = this.track.thumbnail.width / this.track.thumbnail.height * this.thumbnailDisplayHeight + "px"
			this.child(
				ejs`div`!.child(
					ejs`div.thumbnail`!.child(
						thumbnail
					)
				)
			).child(
				ejs`div.player-status`!.child(
					ejs`div.song-title.one-line`!.text(this.track.title)
				).child(
					this.parts.time
				).child(
					this.parts.controls
				)
			)
		} else if (this.trackSet) {
			this.child(new ElemJS("div").class("song-title", "nothing-playing").text("Nothing playing"))
		} else {
			this.child(new ElemJS("div").class("song-title", "nothing-playing").text("Connecting..."))
		}
	}
}

export class PlayerTime extends ElemJS<HTMLDivElement> {
	public animation: Animation | null = null
	public interval: NodeJS.Timeout | null = null
	public state = {
		playing: false,
		trackStartTime: 0,
		pausedAt: 0,
		maxTime: 0,
		live: false
	}

	public constructor() {
		super("div")
		this.class("progress")
		this.child(new ElemJS("div").class("progressbar"))
		this.child(new ElemJS("div"))
		this.child(new ElemJS("div"))
		this.render()
	}

	public update(data: PlayerTime["state"]): void {
		Object.assign(this.state, data)
		this.render()
	}

	/** Get the current play time in ms. */
	public getTime(): number {
		if (!this.state.playing && this.state.pausedAt) {
			return this.state.pausedAt - this.state.trackStartTime
		} else {
			return Date.now() - this.state.trackStartTime + serverTimeDiff
		}
	}

	public getMSRemaining(): number {
		return Math.max(0, this.state.maxTime * 1000 - this.getTime())
	}

	public getTransform(): `scaleX(${number})` {
		if (this.state.maxTime === 0 || this.state.live) {
			if (this.state.playing) return "scaleX(1)"
			else return "scaleX(0)"
		} else {
			const fraction = (this.getTime() / 1000) / this.state.maxTime
			return `scaleX(${fraction})`
		}
	}

	public render(): void {
		if (this.animation) this.animation.cancel()
		if (this.interval) clearInterval(this.interval)
		this.renderCurrentTime()
		this.children[2].text(this.state.live ? "LIVE" : prettySeconds(this.state.maxTime))
		this.children[0].element.style.transform = this.getTransform()
		if (this.state.trackStartTime === 0) {
			this.children[0].element.style.transform = "scaleX(0)"
		} else if (this.state.playing) {
			if (this.getMSRemaining()) {
				this.animation = this.children[0].element.animate([
					{ transform: this.getTransform(), easing: "linear" },
					{ transform: "scaleX(1)" }
				], this.getMSRemaining())
				this.animation.addEventListener("finish", () => {
					this.children[0].element.style.transform = "scaleX(1)"
					if (this.interval) clearInterval(this.interval)
					this.renderCurrentTime()
				})
			}
			this.interval = setInterval(() => {
				this.renderCurrentTime()
			}, 1000)
		}
	}

	public renderCurrentTime(): void {
		let time: number | undefined
		if (this.state.trackStartTime === 0) time = 0
		else time = this.getTime()

		if (time < 0) time = 0
		if (!this.state.live && time > this.state.maxTime * 1000) time = this.state.maxTime * 1000
		this.children[1].text(prettySeconds(Math.floor(time / 1000)))
	}
}

abstract class SideControl extends ElemJS<HTMLButtonElement> {
	public disabled = false

	public constructor(public sideControls: SideControls<HTMLElement>, name: string, image: string) {
		super("button")
		this.class("control")
		this.child(new ElemJS("img").class("icon").attribute("src", `/images/${image}.svg`))
		this.child(new ElemJS("span").class("name").text(name))
	}

	public render(): void {
		this.element.disabled = this.disabled
		this.element.style.filter = `grayscale(${+this.disabled})`
		this.element.style.cursor = this.disabled ? "auto" : "pointer"
	}
}

class AddTrackControl extends SideControl {
	public disabled = true

	public constructor(sideControls: SideControls<HTMLElement>) {
		super(sideControls, "Add track", "add-shaped")
		// this.element.addEventListener("click", event => this.onClick(event))
	}

	public onClick(): void {
		document.write("lol")
	}
}

class TrackInfoControl extends SideControl {
	public disabled = true

	public constructor(sideControls: SideControls<HTMLElement>) {
		super(sideControls, "Track information", "information-shaped")
	}

	public render(): void {
		// this.disabled = !this.sideControls.session.state
		super.render()
	}
}

class ClearQueueControl extends SideControl {
	public constructor(sideControls: SideControls<HTMLElement>) {
		super(sideControls, "Clear queue", "remove-shaped")
		this.element.addEventListener("click", () => this.onClick())
	}

	public onClick(): void {
		this.sideControls.session.send({
			op: opcodes.CLEAR_QUEUE,
			d: null
		})
	}

	public render(): void {
		this.disabled = !this.sideControls.session.state
		super.render()
	}
}

class ListenInBrowserControl extends SideControl {
	public started = false
	public disabled = true

	public constructor(sideControls: SideControls<HTMLElement>) {
		super(sideControls, "Listen in browser", "headphones-shaped")
		this.element.addEventListener("click", () => this.onClick())
	}

	public onClick(): void {
		if (!this.sideControls.session.state) return
		const track = this.sideControls.session.state.tracks[0]
		this.sideControls.session.listenManager.boot(track, () => this.sideControls.session.player.parts.time.getTime())
		this.started = true
		this.render()
	}

	public render(): void {
		this.disabled = !this.sideControls.session.state || this.started
		super.render()
	}
}

export class SideControls<E extends HTMLElement> extends ElemJS<E> {
	public mainLoaded = false
	public parts = {
		listen: new ListenInBrowserControl(this),
		add: new AddTrackControl(this),
		info: new TrackInfoControl(this),
		clear: new ClearQueueControl(this)
	}
	public partsList: Array<SideControls<E>["parts"][keyof SideControls<E>["parts"]]>

	public constructor(container: E, public session: Session) {
		super(container)

		this.child(this.parts.listen)
		this.child(this.parts.add)
		this.child(this.parts.info)
		this.child(this.parts.clear)
		this.partsList = Object.values(this.parts)
		this.render()
	}

	public render(): void {
		if (!this.mainLoaded) {
			this.element.style.visibility = "hidden"
		} else {
			this.element.style.visibility = "visible"
		}
		this.partsList.forEach(part => part.render())
	}
}

export class VoiceInfo<E extends HTMLElement> extends ElemJS<E> {
	public oldMembers: Array<string> = []
	public members: Array<string> = []
	public memberStore = new Map<string, VoiceMember>()

	public constructor(container: E) {
		super(container)
		this.render()
	}

	public setMembers(members: WebQueueMembers): void {
		members.forEach(member => {
			if (!this.memberStore.has(member.id)) {
				this.memberStore.set(member.id, new VoiceMember(member))
			}
		})
		this.oldMembers = this.members
		this.members = members.map(m => m.id)
		this.members.forEach(id => {
			if (!this.oldMembers.includes(id)) this.memberStore.get(id)!.isNew = true
		})
		this.oldMembers.forEach(id => {
			if (!this.members.includes(id)) {
				this.memberStore.get(id)!.leave().then(() => {
					this.memberStore.delete(id)
				})
			}
		})
		this.render()
	}

	public render(): void {
		this.clearChildren()
		if (this.members.length) {
			let visibility = "hidden"
			this.memberStore.forEach(member => {
				if (member.parts.avatar.element.complete) {
					visibility = "visible"
				}
			})
			this.element.style.visibility = visibility
			let newAmanda = false
			this.memberStore.forEach(member => {
				if (member.isNew && member.props.isAmanda) {
					newAmanda = true
					member.join(this).then(() => {
						this.memberStore.forEach(member2 => {
							member2.join(this)
						})
					})
				}
			})
			if (!newAmanda) {
				this.memberStore.forEach(member => {
					member.join(this)
				})
			}
		} else {
			this.element.style.visibility = "hidden"
		}
	}
}

export class VoiceMember extends ElemJS<HTMLDivElement> {
	public avatarSize = 40
	public parts = {
		avatar: this.getAvatar(),
		name: this.getName()
	}
	public isNew = true
	public leaving = false

	public constructor(public props: UnpackArray<WebQueueMembers>) {
		super("div")
	}

	public join(voiceInfo: VoiceInfo<HTMLElement>): Promise<void> {
		if (this.isNew) {
			this.isNew = false
			if (this.parts.avatar.element.complete) {
				this.addSelf(voiceInfo)
				this.animateJoin()
				return Promise.resolve()
			} else {
				return new Promise(resolve => {
					this.parts.avatar.element.addEventListener("load", () => {
						this.addSelf(voiceInfo)
						this.animateJoin()
						resolve(void 0)
					})
				})
			}
		} else {
			this.addSelf(voiceInfo)
			return Promise.resolve()
		}
	}

	public addSelf(voiceInfo: VoiceInfo<HTMLElement>): void {
		voiceInfo.child(this.parts.avatar, this.props.isAmanda ? 0 : -1)
		voiceInfo.child(this.parts.name, this.props.isAmanda ? 1 : -1)
		voiceInfo.element.style.visibility = "visible"
	}

	public leave(): Promise<Array<void>> {
		this.leaving = true
		return this.animateLeave()
	}

	public animateJoin(): void {
		this.parts.avatar.element.animate([
			{ left: "-12px", filter: "brightness(2.5)", opacity: 0, easing: "ease-out" },
			{ left: "0px", filter: "brightness(1)", opacity: 1 }
		], 200)
	}

	public animateLeave(): Promise<Array<void>> {
		return Promise.all(Object.values(this.parts).map(part =>
			new Promise<void>(resolve => {
				part.element.animate([
					{ opacity: 1 },
					{ opacity: 0 }
				], 200).addEventListener("finish", () => {
					part.element.remove()
					resolve(void 0)
				})
			})
		))
	}

	public getAvatar(): AnonImage {
		return new AnonImage(`https://cdn.discordapp.com/avatars/${this.props.id}/${this.props.avatar}${this.props.avatar.startsWith("a_") ? ".gif" : ".png"}`).class("avatar").direct("width", this.avatarSize).direct("height", this.avatarSize)
	}

	public getName(): ElemJS<HTMLDivElement> {
		const name = new ElemJS<HTMLDivElement>("div").class("name")
		if (this.props.isAmanda) name.child(new ElemJS<HTMLImageElement>("img").direct("src", "/images/notes.svg"))
		name.child(new ElemJS("span").text(this.props.tag))
		return name
	}
}
