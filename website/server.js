// @ts-check

const fs = require("fs")
const {Pinski} = require("pinski")
const {setInstance} = require("pinski/plugins")
const Snow = require("snowtransfer")
const mysql = require("mysql2/promise")
const config = require("../config")
const dba = require("discord-bot-analytics")
const Reloader = require("@amanda/reloader")
const path = require("path")
const CacheRequester = require("../modules/managers/CacheRequester")
require("dnscache")({ enable: true })

// Passthrough

const passthrough = require("./passthrough")
passthrough.config = config
passthrough.cache = new CacheRequester()

// Reloader

const reloader = new Reloader(true, path.join(__dirname, "../"))
passthrough.reloader = reloader

// Snow

const snow = new Snow(config.bot_token, { disableEveryone: true })
passthrough.snow = snow

// DB

const db = mysql.createPool({
	host: config.mysql_domain,
	user: "amanda",
	password: config.mysql_password,
	database: "money",
	connectionLimit: 5
})
passthrough.db = db

// Utils

reloader.watch(["./website/modules/utilities.js"])

// IPC (which requires utils)

const IPC = require("./modules/ipcserver.js")
const ipc = new IPC("website", config.website_ipc_bind, 6544)
passthrough.ipc = ipc
reloader.watch(["./modules/ipc/ipcreplier.js"])
reloader.watchAndLoad(["./website/modules/ipcserverreplier.js"])

const analytics = new dba(config.chewey_api_key, null)
passthrough.analytics = analytics

const server = new Pinski({
	relativeRoot: __dirname,
	filesDir: "html",
	port: 10400
})
setInstance(server)

Object.assign(passthrough, server.getExports())

;(async () => {
	await Promise.all([
		db.query("SET NAMES 'utf8mb4'"),
		db.query("SET CHARACTER SET utf8mb4")
	])

	server.addSassDir("sass")
	server.addRoute("/main.css", "sass/main.sass", "sass")

	server.addPugDir("pug", ["pug/includes"])
	server.addRoute("/", "pug/home.pug", "pug")

	server.startServer()

	server.enableWS()
	passthrough.wss = server.wss

	server.addAPIDir("api")

	const files = await fs.promises.readdir("modules/services")
	reloader.watchAndLoad(files.map(f => `./website/modules/services/${f}`))

	require("./modules/stdin.js")
})()
