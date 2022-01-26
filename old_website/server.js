// @ts-check

const fs = require("fs")
const {Pinski} = require("pinski")
const {setInstance} = require("pinski/plugins")
const Snow = require("snowtransfer")
const Postgres = require("pg")
const config = require("../config")
const dba = require("discord-bot-analytics")
const Sync = require("heatsync")
require("dnscache")({ enable: true })

// Passthrough

const passthrough = require("./passthrough")
passthrough.config = config

// Reloader
const sync = new Sync()
passthrough.sync = sync

// Snow

const snow = new Snow.SnowTransfer(config.bot_token, { disableEveryone: true })
passthrough.snow = snow

// DB

const pool = new Postgres.Pool({
	host: config.sql_domain,
	user: "amanda",
	password: config.sql_password,
	database: "main",
	max: 2
})

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
	const db = await pool.connect()
	passthrough.db = db

	// IPC (which requires utils)

	const IPC = require("./modules/ipcserver.js")
	const ipc = new IPC("website", config.website_ipc_bind, 6544)
	passthrough.ipc = ipc
	sync.require(["./modules/ipcserverreplier.js"])

	passthrough.clientID = "405208699313848330"

	server.addSassDir("sass")
	server.addRoute("/main.css", "sass/main.sass", "sass")

	server.addPugDir("pug", ["pug/includes"])
	server.addRoute("/", "pug/home.pug", "pug")

	server.startServer()

	server.enableWS()
	passthrough.wss = server.wss

	server.addAPIDir("api")

	const files = await fs.promises.readdir("modules/services")
	sync.require(files.map(f => `./modules/services/${f}`))

	require("./modules/stdin.js")
})()
