// @ts-check

const fs = require("fs")
const pinski = require("pinski")
const Snow = require("snowtransfer")
const mysql = require("mysql2/promise")
const config = require("../config")
const dba = require("discord-bot-analytics")
const Reloader = require("../modules/hotreload")
require("dnscache")({ enable: true })

// Passthrough

const passthrough = require("./passthrough")
passthrough.config = config

// Reloader

const reloader = new Reloader()
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

reloader.setupWatch(["./website/modules/utilities.js"])

// IPC (which requires utils)

const IPC = require("./modules/ipcserver.js")
const ipc = new IPC("website", config.website_ipc_bind, 6544)
passthrough.ipc = ipc
reloader.setupWatch(["./modules/ipc/ipcreplier.js"])
reloader.watchAndLoad(["./website/modules/ipcserverreplier.js"])

const analytics = new dba(config.chewey_api_key, null)
passthrough.analytics = analytics

const server = pinski({
	pageHandlers: [
		{ web: "/", local: "pug/home.pug", type: "pug" },
		{ web: "/main.css", local: "sass/main.sass", type: "sass" },
		{ web: "/animation_demo.css", local: "sass/animation_demo.sass", type: "sass" },
		{ web: "/animation_demo", local: "web/pug/animation_demo.pug", type: "pug" }
	],
	pugDir: "pug",
	pugIncludeDirs: ["pug/includes"],
	sassDir: "sass",
	apiDir: "api",
	relativeRoot: __dirname,
	filesDir: "html",
	httpPort: 10400,
	httpsPort: null,
	ws: true
})

Object.assign(passthrough, server)

;(async () => {
	await Promise.all([
		db.query("SET NAMES 'utf8mb4'"),
		db.query("SET CHARACTER SET utf8mb4")
	])
	server.loadAPI()

	const files = await fs.promises.readdir("modules/services")
	reloader.watchAndLoad(files.map(f => `./website/modules/services/${f}`))

	require("./modules/stdin.js")
})()
