const pinski = require("pinski")
const pj = require("path").join

module.exports = function(passthrough) {
	let { config, client, reloadEvent, reloader, commands } = passthrough
	
	const extra = require("./extra.js")(passthrough)
	const apiPassthrough = Object.assign({extra}, passthrough)

	const server = pinski({
		pageHandlers: [
			{web: "/", local: "commands/web/pug/home.pug", type: "pug"},
			{web: "/main.css", local: "commands/web/sass/main.sass", type: "sass"},
			{web: "/animation_demo.css", local: "commands/web/sass/animation_demo.sass", type: "sass"},
			{web: "/animation_demo", local: "commands/web/pug/animation_demo.pug", type: "pug"}
		],
		pugDir: "commands/web/pug",
		pugIncludeDirs: ["commands/web/pug/includes"],
		sassDir: "commands/web/sass",
		apiDir: "commands/web/api",
		apiPassthrough,
		relativeRoot: pj(__dirname, "../.."),
		filesDir: "commands/web/html",
		httpPort: 10400,
		httpsPort: null,
		ws: true
	})
}