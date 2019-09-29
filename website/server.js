//@ts-check

const pinski = require("pinski")
const Snow = require("snowtransfer")
const mysql = require("mysql2/promise")
const config = require("../config")
require("dnscache")({enable: true})

const snow = new Snow(config.bot_token, {disableEveryone: true})
snow.requestHandler.on("requestError", console.error)

const passthrough = require("./passthrough")
passthrough.config = config
passthrough.snow = snow

const db = mysql.createPool({
	host: config.mysql_domain,
	user: "amanda",
	password: config.mysql_password,
	database: "money",
	connectionLimit: 5
})
passthrough.db = db

const server = pinski({
	pageHandlers: [
		{web: "/", local: "pug/home.pug", type: "pug"},
		{web: "/main.css", local: "sass/main.sass", type: "sass"},
		{web: "/animation_demo.css", local: "sass/animation_demo.sass", type: "sass"},
		{web: "/animation_demo", local: "web/pug/animation_demo.pug", type: "pug"}
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
})()
