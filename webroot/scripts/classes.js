// @ts-check

import {imageStore} from "./imagestore.js"
import {q, prettySeconds, opcodes} from "./utilities.js"
import {SoundCloudWrapper} from "./wrappers/SoundCloudWrapper.js"

// From HTML
// @ts-ignore
let serverTimeDiff = _serverTimeDiff

class ElemJS {
	/**
	 * @param {string | HTMLElement} type
	 */
	constructor(type) {
		if (type instanceof HTMLElement) this.bind(type)
		else this.bind(document.createElement(type))
		this.children = [];
	}
	bind(element) {
		this.element = element
		this.element.js = this
		return this
	}
	class() {
		for (let name of arguments) if (name) this.element.classList.add(name);
		return this;
	}
	direct(name, value) {
		if (name) this.element[name] = value;
		return this;
	}
	attribute(name, value) {
		if (name) this.element.setAttribute(name, value);
		return this;
	}
	style(name, value) {
		if (name) this.element.style[name] = value;
		return this;
	}
	id(name) {
		if (name) this.element.id = name;
		return this;
	}
	text(name) {
		this.element.innerText = name;
		return this;
	}
	html(name) {
		this.element.innerHTML = name;
		return this;
	}
	child(toAdd, position) {
		if (typeof(toAdd) == "object") {
			toAdd.parent = this;
			if (typeof(position) == "number" && position >= 0) {
				this.element.insertBefore(toAdd.element, this.element.children[position]);
				this.children.splice(position, 0, toAdd);
			} else {
				this.element.appendChild(toAdd.element);
				this.children.push(toAdd);
			}
		}
		return this;
	}
	clearChildren() {
		this.children.length = 0;
		while (this.element.lastChild) this.element.removeChild(this.element.lastChild);
	}
}

class AnonImage extends ElemJS {
	/** @param {string} url */
	constructor(url) {
		super("img")
		this.direct("crossOrigin", "anonymous")
		this.direct("src", url)
	}
}

/** @param {TemplateStringsArray} string */
function ejs(string) {
	let indentHistory = new Map()
	let lines = string[0].split("\n")
	lines.forEach(line => {
		let indent = line.match(/^\s*/)[0].length
		line = line.replace(/^\s*/, "")
		let r = /[.#]?[\w-]+/g
		let element
		let next
		do {
			next = r.exec(line)
			if (next) {
				next = next[0]
				if (next.startsWith("#")) element.id(next.slice(1))
				else if (next.startsWith(".")) element.class(next.slice(1))
				else element = new ElemJS(next)
			}
		} while (next)
		indentHistory.set(indent, element)
		if (indent > 0) indentHistory.get(indent-1).child(element)
	})
	return indentHistory.get(0)
}

class Queue extends ElemJS {
	/**
	 *
	 * @param {string | HTMLElement} container
	 * @param {import("./player").Session} session
	 */
	constructor(container, session) {
		super(container)
		/** @type {import("./player").Session} */
		this.session = session
		this.addingCount = 0
		this.animateMax = 12
		this.isFirstAdd = true
	}
	addItem(data, position) {
		let shouldAnimate = this.addingCount < this.animateMax
		let e = new QueueItem(data, this)
		if (shouldAnimate) {
			this.child(e, position)
			e.animateAdd()
		} else {
			setTimeout(() => {
				this.child(e, position)
			}, 1300)
		}
	}
	removeIndex(index) {
		let removed = this.children.splice(index, 1)[0]
		if (removed) removed.animateRemove()
	}
	removeAllTracks() {
		// queue does not include now playing, so clear the queue by removing all
		if (this.children.length <= this.animateMax) {
			for (const item of this.children) {
				item.animateRemove()
			}
			this.children.length = 0
		} else {
			this.clearChildren()
		}
	}
	shift() {
		let removed = this.children.shift()
		//if (removed) this.element.removeChild(removed.element)
		if (removed) removed.animateShift()
	}
	replaceItems(data) {
		this.clearChildren()
		data.forEach(item => this.addItem(item))
	}
}

class QueueItem extends ElemJS {
	/**
	 * @param {Queue} queue
	 */
	constructor(data, queue) {
		super("div")
		this.class("queue-item")

		this.queue = queue
		this.adding = false
		this.removing = false

		this.parts = {
			title: ejs`div.song-title`,
			length: ejs`div.song-length`,
			controls: ejs`div.song-management`
		}

		this.data = {}
		this.updateData(data)
	}
	updateData(data) {
		Object.assign(this.data, data)
		this.render()
		this.preloadThumbnail()
	}
	render() {
		this.clearChildren()
		this.parts.title.text(this.data.title)
		this.parts.length.text(prettySeconds(this.data.length))
		this.child(this.parts.title)
		this.child(this.parts.length)
		this.child(this.parts.controls)
	}
	preloadThumbnail() {
		if (this.data.thumbnail && this.data.thumbnail.src) {
			imageStore.add(this.data.thumbnail.src)
		}
	}
	remove() {
		let index = this.queue.children.indexOf(this)
		this.disable()
		this.queue.session.send({
			op: opcodes.TRACK_REMOVE,
			d: {index: index}
		})
	}
	disable() {
		this.class("disabled")
		this.parts.controls.children.forEach(button => button.direct("onclick", null))
	}
	animateAdd() {
		if (this.adding) return
		const addOffsetPerItem = 70
		const animationTime = 400
		const addOffsetForFirst = 200

		this.adding = true
		// backup animation check, but this should always pass
		let shouldAnimate = this.queue.addingCount < this.queue.animateMax
		if (shouldAnimate) {
			// this is where the count is actually increased
			this.queue.addingCount++

			let style = window.getComputedStyle(this.element)
			let props = ["height", "paddingTop", "paddingBottom", "marginBottom"]

			let values = {}
			props.forEach(key => {
				values[key] = "0px"
			})
			values.opacity = 0
			values.marginBottom = "-10px"
			values.easing = "ease"

			let endValues = {}
			props.forEach(key => {
				endValues[key] = style[key]
			})
			if (this.element.children[2].getBoundingClientRect().height < 1)
				endValues.height = parseInt(endValues.height)+24+"px"
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
			}, this.queue.addingCount*addOffsetPerItem+(+this.queue.isFirstAdd*addOffsetForFirst))
		} else {
			this.element.style.display = "none"
			setTimeout(() => {
				this.element.style.display = ""
			}, this.queue.addingCount*addOffsetPerItem+(+this.queue.isFirstAdd*addOffsetForFirst+animationTime))
		}
	}
	animateRemove() {
		if (this.removing) return
		this.removing = true

		this.disable()

		let style = window.getComputedStyle(this.element)
		let props = ["height", "paddingTop", "paddingBottom", "marginBottom"]

		let values = {}
		props.forEach(key => {
			values[key] = style[key]
		})
		values.easing = "ease"
		values.opacity = 1

		let endValues = {}
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
	animateShift() {
		if (this.shifting) return
		this.shifting = true

		let height = Math.floor(this.element.getBoundingClientRect().height)+20

		this.queue.element.animate([
			{top: "0px", easing: "ease-out"},
			{top: -height+"px"}
		], 400).addEventListener("finish", () => {
			this.element.remove()
		})
		this.element.animate([
			{opacity: 1}, {opacity: 0}
		], 200).addEventListener("finish", () => {
			this.element.style.opacity = 0
		})
	}
}

class AttributeButton extends ElemJS {
	/**
	 * @param {Player} player
	 * @param {string} propertyName
	 */
	constructor(player, propertyName) {
		super("img")
		this.player = player
		this.propertyName = propertyName

		this.direct("onclick", () => {
			this.player.attributes[propertyName] = !this.player.attributes[propertyName]
			this.player.session.requestAttributesChange({[propertyName]: this.player.attributes[propertyName]}) // this actually toggles
			this.render()
		})

		this.render()
	}

	render() {
		this.direct("src", `/images/${this.propertyName}_${this.player.attributes[this.propertyName] ? "active" : "inactive"}.svg`)
	}
}

class Player extends ElemJS {
	/**
	 * @param {string | HTMLElement} container
	 * @param {import("./player").Session} session
	 */
	constructor(container, session) {
		super(container)
		/** @type {import("./player").Session} */
		this.session = session

		this.track = null
		this.thumbnailDisplayHeight = 94
		this.attributes = {}
		this.trackSet = false
		this.parts = {
			controls: ejs`div.controls`,
			time: new PlayerTime()
		}
		;["togglePlayback", "skip", "stop"].forEach(icon => {
			this.parts.controls.child(new AnonImage(`/images/${icon}.svg`).direct("onclick", () => this.session[icon]()))
		})
		this.parts.controls.child(this.parts.loopButton = new AttributeButton(this, "loop"))
		this.parts.controls.child(this.parts.autoButton = new AttributeButton(this, "auto"))
		this.render()
	}
	setTrack(track) {
		this.trackSet = true
		this.track = track
		this.render()
	}
	updateData(data) {
		this.trackSet = true
		Object.assign(this.track, data)
		this.render()
	}
	updateTime(data) {
		this.parts.time.update(data)
	}
	updateAttributes(data) {
		this.attributes = data
		this.parts.autoButton.render()
		this.parts.loopButton.render()
	}
	render() {
		this.clearChildren()
		if (this.track) {
			let thumbnail = new ElemJS(imageStore.get(this.track.thumbnail.src))
			thumbnail.element.width = this.track.thumbnail.width
			thumbnail.element.height = this.track.thumbnail.height
			thumbnail.element.style.width = this.track.thumbnail.width/this.track.thumbnail.height*this.thumbnailDisplayHeight+"px"
			this.child(
				ejs`div`.child(
					ejs`div.thumbnail`.child(
						thumbnail
					)
				)
			).child(
				ejs`div.player-status`.child(
					ejs`div.song-title.one-line`.text(this.track.title)
				).child(
					this.parts.time
				).child(
					this.parts.controls
				)
			)
		} else {
			if (this.trackSet) {
				this.child(new ElemJS("div").class("song-title", "nothing-playing").text("Nothing playing"))
			} else {
				this.child(new ElemJS("div").class("song-title", "nothing-playing").text("Connecting..."))
			}
		}
	}
}

class PlayerTime extends ElemJS {
	constructor() {
		super("div")
		this.class("progress")
		this.animation = null
		this.interval = null
		this.state = {playing: false, trackStartTime: 0, pausedAt: 0, maxTime: 0, live: false}
		this.child(new ElemJS("div").class("progressbar"))
		this.child(new ElemJS("div"))
		this.child(new ElemJS("div"))
		this.render()
	}
	update(data) {
		Object.assign(this.state, data)
		this.render()
	}
	/**
	 * Get the current play time in ms.
	 */
	getTime() {
		if (!this.state.playing && this.state.pausedAt) {
			return this.state.pausedAt - this.state.trackStartTime
		} else {
			return Date.now() - this.state.trackStartTime + serverTimeDiff
		}
	}
	getMSRemaining() {
		return Math.max(0, this.state.maxTime*1000 - this.getTime())
	}
	getTransform() {
		if (this.state.maxTime == 0 || this.state.live) {
			if (this.state.playing) return `scaleX(1)`
			else return `scaleX(0)`
		} else {
			let fraction = (this.getTime()/1000) / this.state.maxTime
			return `scaleX(${fraction})`
		}
	}
	render() {
		if (this.animation) this.animation.cancel()
		if (this.interval) clearInterval(this.interval)
		this.renderCurrentTime()
		this.children[2].text(this.state.live ? "LIVE" : prettySeconds(this.state.maxTime))
		this.children[0].element.style.transform = this.getTransform()
		if (this.state.trackStartTime == 0) {
			this.children[0].element.style.transform = "scaleX(0)"
		} else if (this.state.playing) {
			if (this.getMSRemaining()) {
				this.animation = this.children[0].element.animate([
					{transform: this.getTransform(), easing: "linear"},
					{transform: "scaleX(1)"}
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
	renderCurrentTime() {
		let time
		if (this.state.trackStartTime == 0) time = 0
		else time = this.getTime()
		if (time < 0) time = 0
		if (!this.state.live && time > this.state.maxTime*1000) time = this.state.maxTime*1000
		this.children[1].text(prettySeconds(Math.floor(time/1000)))
	}
}

class SideControl extends ElemJS {
	/**
	 * @param {SideControls} sideControls
	 */
	constructor(sideControls, name, image) {
		super("button")
		this.disabled = false
		this.sideControls = sideControls
		this.class("control")
		this.child(new ElemJS("img").class("icon").attribute("src", `/images/${image}.svg`))
		this.child(new ElemJS("span").class("name").text(name))
	}

	render() {
		this.element.disabled = this.disabled
		this.element.style.filter = `grayscale(${+this.disabled})`
		this.element.style.cursor = this.disabled ? "auto" : "pointer"
	}
}

class AddTrackControl extends SideControl {
	constructor(sideControls) {
		super(sideControls, "Add track", "add-shaped")
		this.disabled = true
		// this.element.addEventListener("click", event => this.onClick(event))
	}

	onClick(event) {
		document.write("lol")
	}
}

class TrackInfoControl extends SideControl {
	constructor(sideControls) {
		super(sideControls, "Track information", "information-shaped")
	}

	render() {
		// this.disabled = !this.sideControls.session.state
		this.disabled = true // because it's not implemented.
		super.render()
	}
}

class ClearQueueControl extends SideControl {
	constructor(sideControls) {
		super(sideControls, "Clear queue", "remove-shaped")
		this.element.addEventListener("click", event => this.onClick())
		this.disabled = true
	}

	onClick() {
		this.sideControls.session.send({
			op: opcodes.CLEAR_QUEUE,
			d: null
		})
	}

	render() {
		this.disabled = !this.sideControls.session.state
		super.render()
	}
}

class ListenInBrowserControl extends SideControl {
	constructor(sideControls) {
		super(sideControls, "Listen in browser", "headphones-shaped")
		this.element.addEventListener("click", event => this.onClick())
		this.disabled = true
		this.started = false
	}

	onClick() {
		if (!this.sideControls.session.state) return
		const track = this.sideControls.session.state.tracks[0]
		this.sideControls.session.listenManager.boot(track, () => this.sideControls.session.player.parts.time.getTime())
		this.started = true
		this.render()
	}

	render() {
		this.disabled = !this.sideControls.session.state || this.started
		super.render()
	}
}

class SideControls extends ElemJS {
	/**
	 * @param {import("./player").Session} session
	 */
	constructor(container, session) {
		super(container)
		this.session = session
		this.mainLoaded = false
		/** @type {{[x: string]: SideControl}} */
		this.parts = {}
		this.child(this.parts.listen = new ListenInBrowserControl(this))
		this.child(this.parts.add = new AddTrackControl(this))
		this.child(this.parts.info = new TrackInfoControl(this))
		this.child(this.parts.clear = new ClearQueueControl(this))
		this.partsList = Object.values(this.parts)
		this.render()
	}

	render() {
		if (!this.mainLoaded) {
			this.element.style.visibility = "hidden"
		} else {
			this.element.style.visibility = "visible"
		}
		this.partsList.forEach(part => part.render())
	}
}

class VoiceInfo extends ElemJS {
	constructor(container) {
		super(container)
		this.oldMembers = []
		this.members = []
		this.memberStore = new Map()
		this.render()
	}
	setMembers(members) {
		members.forEach(member => {
			if (!this.memberStore.has(member.id)) {
				this.memberStore.set(member.id, new VoiceMember(member))
			}
		})
		this.oldMembers = this.members
		this.members = members.map(m => m.id)
		this.members.forEach(id => {
			if (!this.oldMembers.includes(id)) this.memberStore.get(id).isNew = true
		})
		this.oldMembers.forEach(id => {
			if (!this.members.includes(id)) this.memberStore.get(id).leave().then(() => {
				this.memberStore.delete(id)
			})
		})
		this.render()
	}
	render() {
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
						this.memberStore.forEach(member => {
							member.join(this)
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

class VoiceMember extends ElemJS {
	constructor(props) {
		super("div")
		this.props = props
		this.avatarSize = 40
		this.parts = {
			avatar: this.getAvatar(),
			name: this.getName()
		}
		this.isNew = false
		this.leaving = false
	}
	join(voiceInfo) {
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
	addSelf(voiceInfo) {
		voiceInfo.child(this.parts.avatar, this.props.isAmanda ? 0 : -1)
		voiceInfo.child(this.parts.name, this.props.isAmanda ? 1 : -1)
		voiceInfo.element.style.visibility = "visible"
	}
	leave() {
		this.leaving = true
		return this.animateLeave()
	}
	animateJoin() {
		this.parts.avatar.element.animate([
			{left: "-12px", filter: "brightness(2.5)", opacity: 0, easing: "ease-out"},
			{left: "0px", filter: "brightness(1)", opacity: 1}
		], 200)
	}
	animateLeave() {
		return Promise.all(Object.values(this.parts).map(part =>
			new Promise(resolve => {
				part.element.animate([
					{opacity: 1},
					{opacity: 0}
				], 200).addEventListener("finish", () => {
					part.element.remove()
					resolve(void 0)
				})
			})
		))
	}
	getAvatar() {
		return new AnonImage(`https://cdn.discordapp.com/avatars/${this.props.id}/${this.props.avatar}${this.props.avatar.startsWith("a_") ? ".gif" : ".png"}`).class("avatar").direct("width", this.avatarSize).direct("height", this.avatarSize)
	}
	getName() {
		let name = new ElemJS("div").class("name")
		if (this.props.isAmanda) name.child(new ElemJS("img").direct("src", "/images/notes.svg"))
		name.child(new ElemJS("span").text(this.props.tag))
		return name
	}
}

export {
	Player,
	PlayerTime,
	Queue,
	QueueItem,
	VoiceInfo,
	VoiceMember,
	SideControls
}
