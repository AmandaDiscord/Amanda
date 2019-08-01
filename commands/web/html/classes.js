var ex = ex || []
ex.push({
	name: "classes",
	dependencies: []
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
	constructor(container) {
		super(container)
	}
	addItem(data, position) {
		let e = new QueueItem(data)
		this.child(e, position)
	}
	shift() {
		let removed = this.children.shift()
		if (removed) this.element.removeChild(removed.element)
	}
	replaceItems(data) {
		this.clearChildren()
		data.forEach(item => this.addItem(item))
	}
}

class QueueItem extends ElemJS {
	constructor(data) {
		super("div")
		this.data = {}
		this.updateData(data)
	}
	updateData(data) {
		Object.assign(this.data, data)
		this.render()
	}
	render() {
		this.text(this.data.title)
	}
}

class Player extends ElemJS {
	constructor(container, session) {
		super(container)
		this.song = null
		this.songSet = false
		this.parts = {
			controls:
				ejs`div.controls`.child(
					ejs`img`
					.direct("src", "https://discordapp.com/assets/de8fa839a61b39d17febf16f22fd8159.svg")
					.direct("onclick", () => session.togglePlayback())
				).child(
					ejs`img`
					.direct("src", "https://discordapp.com/assets/4e5dd162acac96c5af80b8f9e67c4bf1.svg")
					.direct("onclick", () => session.skip())
				).child(
					ejs`img`
					.direct("src", "https://discordapp.com/assets/76bb3e920ff642a218226a6c8a4cbc07.svg")
					.direct("onclick", () => session.stop())
				),
			time:
				new PlayerTime()
		}
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
	render() {
		this.clearChildren()
		if (this.song) {
			let thumbnail = ejs`img`
			Object.assign(thumbnail.element, this.song.thumbnail)
			this.child(
				ejs`div`.child(
					ejs`div.thumbnail`.child(
						thumbnail
					)
				)
			).child(
				ejs`div.player-status`.child(
					ejs`div.song-title`.text(this.song.title)
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
		this.state = {playing: false, time: 0, maxTime: 0}
		this.child(new ElemJS("div").class("progressbar"))
		this.child(new ElemJS("div"))
		this.child(new ElemJS("div"))
		this.render()
	}
	update(data) {
		Object.assign(this.state, data)
		this.render()
	}
	getMSRemaining() {
		return Math.max(0, this.state.maxTime*1000 - this.state.time)
	}
	getTransform() {
		if (this.state.time == 0 && this.state.maxTime == 0) {
			if (this.playing) return `scaleX(1)`
			else return `scaleX(0)`
		} else {
			let fraction = (this.state.time/1000) / this.state.maxTime
			return `scaleX(${fraction})`
		}
	}
	render() {
		if (this.animation) this.animation.cancel()
		if (this.interval) clearInterval(this.interval)
		this.renderCurrentTime()
		this.children[2].text(prettySeconds(this.state.maxTime))
		this.children[0].element.style.transform = this.getTransform()
		if (this.state.playing) {
			this.animation = this.children[0].element.animate([
				{transform: this.getTransform(), easing: "linear"},
				{transform: "scaleX(1)"}
			], this.getMSRemaining())
			this.animation.addEventListener("finish", () => {
				console.log("animation finish")
				this.children[0].element.style.transform = "scaleX(1)"
				if (this.interval) clearInterval(this.interval)
				this.state.time = this.state.maxTime * 1000
				this.renderCurrentTime()
			})
			this.interval = setInterval(() => {
				this.state.time += 1000
				this.renderCurrentTime()
			}, 1000)
		}
	}

	renderCurrentTime() {
		this.children[1].text(prettySeconds(Math.floor(this.state.time/1000)))
	}
}