/** @type {import("node-fetch")["default"]} */
const fetch = require("node-fetch")
const WebSocket = require("ws")
const { EventEmitter } = require("events")

const baseAPIURL = "https://listen.moe/api"
const baseJPOPGatewayURL = "wss://listen.moe/gateway_v2"
const baseKPOPGatewayURL = "wss://listen.moe/kpop/gateway_v2"

const headers = {
	"Content-Type": "application/json",
	"Accept": "application/vnd.listen.v4+json"
}

const OP_CODES = {
	/**
	 * Receive
	 */
	WELCOME: 0,
	/**
	 * Receive
	 */
	RECEIVE_PLAYBACK_INFO: 1,
	/**
	 * Send
	 */
	HEARTBEAT: 9,
	/**
	 * Receive
	 */
	HEARTBEAT_ACK: 10
}

const STREAM_URLS = {
	JPOP: {
		vorbis: "https://listen.moe/stream",
		opus: "https://listen.moe/opus",
		mp3: "https://listen.moe/fallback"
	},
	KPOP: {
		vorbis: "https://listen.moe/kpop/stream",
		opus: "https://listen.moe/kpop/opus",
		mp3: "https://listen.moe/kpop/fallback"
	}
}

const internalEvents = {
	"TRACK_UPDATE_REQUEST": "trackUpdateRequest",
	"TRACK_UPDATE": "trackUpdate",
	"QUEUE_UPDATE": "queueUpdate",
	"NOTIFICATION": "notification"
}

const Constants = {
	baseAPIURL,
	baseJPOPGatewayURL,
	baseKPOPGatewayURL,
	OP_CODES,
	STREAM_URLS
}

class ListenMoe extends EventEmitter {
	/**
	 * @param {string} wsURL
	 * @param {string} [username]
	 * @param {string} [password]
	 */
	constructor(wsURL, username, password) {
		super()
		this.username = username
		this.password = password
		this.jwt = ""
		this.jwtExpires = 1000 * 60 * 2
		this.jwtExpireTimeout = null
		this.wsURL = wsURL
		this.heartbeatInterval = 0
		this.heartbeatTimeout = null
		this.lastACKAt = 0
		this.lastHeartbeatSend = 0
		this.latency = 0
		this.ws = null

		this.lastTrack = {
			title: "Unknown listen.moe track",
			id: 0,
			duration: 0
		}
		this.lastTrackStartedAt = 0

		this._connect()
	}
	static get Constants() {
		return Constants
	}
	get Constants() {
		return Constants
	}
	async login() {
		if (!this.username || !this.password) throw new Error("No credentials")
		const payload = {
			"username": this.username,
			"password": this.password
		}
		const data = await this._request("/login", payload, "POST")
		if (data.token) {
			this.jwt = data.token
			if (this.jwtExpireTimeout) clearTimeout(this.jwtExpireTimeout)
			this.jwtExpireTimeout = setTimeout(() => this.jwt = "", this.jwtExpires)
		}
	}
	getSongList() {
		return this._request("/songs")
	}
	/**
	 * @param {string} username
	 */
	getSongs(username = this.username) {
		return this._request(`/songs/${username}/songs`)
	}
	/**
	 * @param {string} id
	 */
	addFavoriteSong(id) {
		return this._request(`/favorites/${id}`, undefined, "POST")
	}
	/**
	 * @param {string} id
	 */
	deleteFavoriteSong(id) {
		return this._request(`/favorites/${id}`, undefined, "DELETE")
	}
	/**
	 * @param {string} username
	 */
	getFavoriteSongs(username = this.username) {
		return this._request(`/favorites/${username}`)
	}
	/**
	 * @param {string} id
	 * @param {Array<string>} tags
	 */
	addFavoriteSongTags(id, tags) {
		const payload = {
			"tags": tags
		}
		return this._request(`/favorites/${id}/tags`, payload, "PUT")
	}
	/**
	 * @param {string} id
	 */
	addRequestSong(id) {
		return this._request(`/requests/${id}`, undefined, "POST")
	}
	/**
	 * @param {string} id
	 */
	removeRequestSong(id) {
		return this._request(`/requests/${id}`, undefined, "DELETE")
	}
	getAllArtists() {
		return this._request("/artists")
	}
	/**
	 * @param {string} id
	 */
	getArtist(id) {
		return this._request(`/artists/${id}`)
	}
	/**
	 * @param {string} username
	 */
	getUser(username = this.username) {
		return this._request(`/users/${username}`)
	}
	/**
	 * @param {string} bio
	 */
	updateSelfBiography(bio) {
		const payload = {
			"bio": bio
		}
		return this._request(`/users/${this.username}`, payload, "PATCH")
	}
	/**
	 * @param {string} username
	 */
	getUserRoles(username = this.username) {
		return this._request(`/users/${username}/roles`)
	}
	getAllPosts() {
		return this._request("/posts")
	}
	/**
	 * @param {string} slug
	 */
	getPost(slug) {
		return this._request(`/posts/${slug}`)
	}
	/**
	 * @param {string} id
	 * @param {string} comment
	 */
	postComment(id, comment) {
		const payload = {
			parentId: 0,
			comment: comment
		}
		return this._request(`/posts/${id}/comments`, payload, "POST")
	}
	/**
	 * @param {string} id
	 */
	getComments(id) {
		return this._request(`/posts/${id}/comments`)
	}
	/**
	 * @param {string} username
	 */
	getFeed(username = this.username) {
		return this._request(`/users/${username}/feed`)
	}
	deleteFeed(id) {
		return this._request(`/feeds/${id}`, undefined, "DELETE")
	}
	getFeedComments(id) {
		return this._request(`/feeds/${id}/comments`)
	}
	/**
	 * @param {string} id
	 * @param {string} comment
	 */
	postFeedComment(id, comment) {
		const payload = {
			parentId: 0,
			comment: comment
		}
		return this._request(`/feeds/${id}/comments`, payload, "POST")
	}
	/**
	 * @private
	 */
	_heartbeat() {
		this.lastHeartbeatSend = Date.now()
		return this._send({ op: OP_CODES.HEARTBEAT, d: { message: "owo?" } })
	}
	/**
	 * @private
	 */
	_onWSMessage(raw) {
		let data
		try {
			data = JSON.parse(raw)
		} catch {
			this.emit("error", new Error(`Could not parse message: ${raw}`))
			return
		}
		this.emit("raw", data)

		switch (data.op) {
		case OP_CODES.WELCOME:
			this.heartbeatInterval = data.d.heartbeat
			this._heartbeat()
			this.heartbeatTimeout = setInterval(() => {
				if (this.lastACKAt <= Date.now() - (this.heartbeatInterval + 5000)) {
					this.emit("error", new Error(`Websocket has not received a heartbeat ACK within ${this.heartbeatInterval + 5000}ms.`))
					this._disconnect()
					setTimeout(() => this._connect(), 5000)
				} else {
					this._heartbeat()
				}
			}, this.heartbeatInterval)
			break

		case OP_CODES.RECEIVE_PLAYBACK_INFO:
			if (internalEvents[data.t]) this.emit(internalEvents[data.t], data.d)
			else this.emit("unknown", data)
			if (data.t === "TRACK_UPDATE") {
				this.lastTrack = data.d.song
				this.lastTrackStartedAt = Date.now()
			}
			break

		case OP_CODES.HEARTBEAT_ACK:
			this.lastACKAt = Date.now()
			this.latency = this.lastACKAt - this.lastHeartbeatSend
			break

		default:
			this.emit("unknown", data)
			break
		}
	}
	/**
	 * @private
	 */
	_disconnect() {
		if (this.ws) {
			this.ws.close(1000, "Disconnected by user")
			this.ws.removeAllListeners()
		}
		this.ws = null
		this._reset()
	}
	/**
	 * @private
	 */
	_reset() {
		if (this.heartbeatTimeout) clearInterval(this.heartbeatTimeout)
		this.heartbeatTimeout = null
		this.heartbeatInterval = 0
		this.lastACKAt = 0
		this.lastHeartbeatSend = 0
	}
	/**
	 * @private
	 */
	_connect() {
		if (this.ws) this._disconnect()
		this.ws = new WebSocket(this.wsURL)

		this.ws.on("message", (data) => this._onWSMessage(data))
		this.ws.on("close", (code, reason) => this._onWSClose(code, reason))
		this.ws.on("error", (error) => this.emit("error", error))
	}
	/**
	 * @private
	 */
	_onWSClose(code, reason) {
		let shouldReconnect = false

		if ((code === 1000 && reason !== "Disconnected by user") || code !== 1000) shouldReconnect = true


		if (shouldReconnect) this._connect()
		else this._disconnect()

		this.emit("disconnected", shouldReconnect)
	}
	/**
	 * @private
	 */
	_send(data) {
		return this.ws.send(JSON.stringify(data), (err) => {
			if (err) this.emit("error", err)
		})
	}
	/**
	 * @param {string} path
	 * @param {Object.<string, string>} [body]
	 * @param {"GET" | "POST" | "PATCH" | "DELETE" | "PUT"} [method]
	 * @param {Object.<string, string>}
	 * @private
	 */
	async _request(path, body, method = "GET", extraHeaders = undefined) {
		if (!this.jwt && path != "/login") await this.login()
		const thisHeaders = require("thunderstorm").Util.cloneObject(headers)
		if (extraHeaders) Object.assign(thisHeaders, extraHeaders)
		if (this.jwt && !thisHeaders["Authorization"]) thisHeaders["Authorization"] = `Bearer ${this.jwt}`
		const payload = {
			"method": method,
			"headers": thisHeaders
		}
		if (body) payload["body"] = JSON.stringify(body)
		const data = await fetch(`${baseAPIURL}${path}`, payload)

		const bod = await data.json()

		if (![200, 204].includes(data.status)) throw new Error(`Status ${data.status}: ${bod.message}`)
		return bod
	}
}

module.exports = ListenMoe
