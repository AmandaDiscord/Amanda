// @ts-check

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
