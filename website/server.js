const pinski = require("pinski")
const pj = require("path").join

require("dnscache")({enable: true})

//const extra = require("./extra.js")(passthrough)
//const apiPassthrough = Object.assign({extra}, passthrough)

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
	//apiPassthrough,
	relativeRoot: __dirname,
	filesDir: "html",
	httpPort: 10400,
	httpsPort: null,
	ws: true
})
