// @ts-check

const path = require("path")

const passthrough = require("../../passthrough")
const { reloader } = passthrough

const { addTemporaryListener } = require("./eventutils")

const fs = require("fs")
for (const file of [...fs.readdirSync(__dirname), ...fs.readdirSync(`${__dirname}/classes`)].filter(f => f.endsWith(".js") && !f.endsWith(".test.js") && f !== "index.js")) {
	addTemporaryListener(reloader.reloadEvent, file, path.basename(__filename), () => {
		setImmediate(() => { // event is emitted synchronously before decache, so wait for next event loop
			reloader.resync("./modules/utilities/index.js")
		})
	}, "once")
}

const { random: arrayRandom, shuffle: arrayShuffle } = require("./arrayutils")

const utils = {
	arrayRandom,
	arrayShuffle,
	AsyncValueCache: require("./classes/AsyncValueCache"),
	BetterTimeout: require("./classes/BetterTimeout"),
	JIMPStorage: require("./classes/JIMPStorage"),
	...require("./cachemanager"),
	coinsManager: require("./coinsmanager"),
	...require("./discordutils"),
	...require("./eventutils"),
	...require("./langutils"),
	...require("./pagination"),
	...require("./shardinfo"),
	editLavalinkNodes: require("./lavalinkutils"),
	sql: require("./sql"),
	...require("./text"),
	...require("./time"),
	waifu: require("./waifu")
}

module.exports = utils
