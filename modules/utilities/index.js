// @ts-check

const path = require("path")

const passthrough = require("../../passthrough")
const { reloader } = passthrough

const { addTemporaryListener } = require("./eventutils")

const loadBlacklist = [".test.js", "index.js"]

const fs = require("fs")
for (const file of [...fs.readdirSync(__dirname), ...fs.readdirSync(`${__dirname}/classes`)].filter(f => f.endsWith(".js") && !loadBlacklist.find(entry => f.endsWith(entry)))) {
	addTemporaryListener(reloader.reloadEvent, file, path.basename(__filename), () => {
		setImmediate(() => { // event is emitted synchronously before decache, so wait for next event loop
			reloader.resync("./modules/utilities/index.js")
		})
	}, "once")
}

const { random: arrayRandom, shuffle: arrayShuffle } = require("./arrayutils")

const utils = { // I really hate that we have to nest an import then destructure it to get typings. So much.
	arrayRandom,
	arrayShuffle,
	AsyncValueCache: require("./classes/AsyncValueCache"),
	BetterTimeout: require("./classes/BetterTimeout"),
	BitmapCache: require("./classes/BitmapCache"),
	ImageCache: require("./classes/ImageCache"),
	FontCache: require("./classes/FontCache"),
	jimpStores: {
		...require("./jimpstores")
	},
	...require("./cachemanager"),
	coinsManager: {
		...require("./coinsmanager")
	},
	...require("./discordutils"),
	...require("./eventutils"),
	...require("./langutils"),
	...require("./pagination"),
	...require("./shardinfo"),
	editLavalinkNodes: {
		...require("./lavalinkutils")
	},
	sql: {
		...require("./sql")
	},
	orm: {
		...require("./orm")
	},
	...require("./text"),
	...require("./time")
}

module.exports = utils
