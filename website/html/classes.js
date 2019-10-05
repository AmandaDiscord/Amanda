var ex = ex || []
ex.push({
	name: "classes",
	dependencies: ["imagestore"]
})

class ElemJS {
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
	constructor(container, session) {
		super(container)
		this.session = session
		this.addingCount = 0
		this.isFirstAdd = true
	}
	addItem(data, position) {
		let e = new QueueItem(data, this)
		this.child(e, position)
		e.animateAdd()
	}
	removeIndex(index) {
		let removed = this.children.splice(index, 1)[0]
		if (removed) removed.animateRemove()
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
		;["play", "remove"].forEach(icon => {
			let child = new ElemJS("img").direct("src", `/images/${icon}.svg`).direct("onclick", () => this[icon]())
			this.parts.controls.child(child)
		})

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
			op: opcodes.REQUEST_QUEUE_REMOVE,
			d: {index: index+1} // +1 because backend queue starts with currently playing
		})
	}
	disable() {
		this.class("disabled")
		this.parts.controls.children.forEach(button => button.direct("onclick", null))
	}
	animateAdd() {
		if (this.adding) return
		this.adding = true
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
			], 400).addEventListener("finish", () => {
				this.adding = false
				this.queue.addingCount--
				Object.entries(values).forEach(entry => {
					this.element.style[entry[0]] = ""
				})
			})
		}, this.queue.addingCount*70+20*this.queue.isFirstAdd)
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

class Player extends ElemJS {
	constructor(container, session) {
		super(container)
		this.song = null
		this.thumbnailDisplayHeight = 94
		this.attributes = {}
		this.songSet = false
		this.parts = {
			controls: ejs`div.controls`,
			time: new PlayerTime()
		}
		;["playpause", "skip", "stop"].forEach(icon => {
			this.parts.controls.child(new ElemJS("img").direct("src", `/images/${icon}.svg`).direct("onclick", () => session[icon]()))
		})
		this.parts.controls.child(this.parts.autoButton = new ElemJS("img").direct("src", "/images/auto_inactive.svg").direct("onclick", () => {
			this.updateAttributes({auto: !this.attributes.auto})
			session.requestAttributesChange(this.attributes)
		}))
		this.render()
	}
	setSong(song) {
		this.songSet = true
		this.song = song
		this.render()
	}
	updateData(data) {
		this.songSet = true
		Object.assign(this.song, data)
		this.render()
	}
	updateTime(data) {
		this.parts.time.update(data)
	}
	updateAttributes(data) {
		this.attributes = data
		this.parts.autoButton.direct("src", `/images/auto_${this.attributes.auto ? "active" : "inactive"}.svg`)
	}
	render() {
		this.clearChildren()
		if (this.song) {
			let thumbnail = new ElemJS(imageStore.get(this.song.thumbnail.src))
			thumbnail.element.width = this.song.thumbnail.width
			thumbnail.element.height = this.song.thumbnail.height
			thumbnail.element.style.width = this.song.thumbnail.width/this.song.thumbnail.height*this.thumbnailDisplayHeight+"px"
			this.child(
				ejs`div`.child(
					ejs`div.thumbnail`.child(
						thumbnail
					)
				)
			).child(
				ejs`div.player-status`.child(
					ejs`div.song-title.one-line`.text(this.song.title)
				).child(
					this.parts.time
				).child(
					this.parts.controls
				)
			)
		} else {
			if (this.songSet) {
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
		this.state = {playing: false, songStartTime: 0, maxTime: 0, live: false}
		this.child(new ElemJS("div").class("progressbar"))
		this.child(new ElemJS("div"))
		this.child(new ElemJS("div"))
		this.render()
	}
	update(data) {
		Object.assign(this.state, data)
		this.render()
	}
	getTime() {
		return Date.now() - this.state.songStartTime
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
		if (this.state.songStartTime == 0) {
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
		if (this.state.songStartTime == 0) time = 0
		else time = this.getTime()
		if (!this.state.live && time > this.state.maxTime*1000) time = this.state.maxTime*1000
		this.children[1].text(prettySeconds(Math.floor(time/1000)))
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
			this.element.style.visibility = "visible"
			this.memberStore.forEach(member => {
				member.join(this)
			})
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
		voiceInfo.child(this.parts.avatar, this.props.isAmanda ? 0 : -1)
		voiceInfo.child(this.parts.name, this.props.isAmanda ? 1 : -1)
		this.animateJoin()
	}
	leave() {
		this.leaving = true
		return this.animateLeave()
	}
	animateJoin() {
		if (this.isNew) {
			this.parts.avatar.element.animate([
				{left: "-12px", filter: "brightness(2.5)", opacity: 0, easing: "ease-out"},
				{left: "0px", filter: "brightness(1)", opacity: 1}
			], 200)
			this.isNew = false
		}
	}
	animateLeave() {
		return Promise.all(Object.values(this.parts).map(part =>
			new Promise(resolve => {
				part.element.animate([
					{opacity: 1},
					{opacity: 0}
				], 200).addEventListener("finish", () => {
					part.element.remove()
					resolve()
				})
			})
		))
	}
	getAvatar() {
		return new ElemJS("img").class("avatar").direct("src", this.props.avatar).direct("width", this.avatarSize).direct("height", this.avatarSize)
	}
	getName() {
		let name = new ElemJS("div").class("name")
		if (this.props.isAmanda) name.child(new ElemJS("img").direct("src", "/images/notes.svg"))
		name.child(new ElemJS("span").text(this.props.name))
		return name
	}
}
