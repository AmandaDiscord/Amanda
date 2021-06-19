// @ts-check

const path = require("path")

const passthrough = require("../../passthrough")
const { sync } = passthrough

/** @type {typeof import("./classes/AsyncValueCache")} */
const AsyncValueCache = sync.require("./classes/AsyncValueCache")
/** @type {typeof import("./classes/BetterTimeout")} */
const BetterTimeout = sync.require("./classes/BetterTimeout")
/** @type {typeof import("./classes/BitmapCache")} */
const BitmapCache = sync.require("./classes/BitmapCache")
/** @type {typeof import("./classes/ImageCache")} */
const ImageCache = sync.require("./classes/ImageCache")
/** @type {typeof import("./classes/FontCache")} */
const FontCache = sync.require("./classes/FontCache")

/** @type {import("./jimpstores")} */
const jimpStores = sync.require("./jimpstores")
/** @type {import("./coinsmanager")} */
const coinsManager = sync.require("./coinsmanager")
/** @type  {import("./lavalinkutils")} */
const editLavalinkNodes = sync.require("./lavalinkutils")
/** @type {import("./sql")} */
const sql = sync.require("./sql")
/** @type {import("./orm")} */
const orm = sync.require("./orm")
/** @type {import("./cachemanager")} */
const cacheManager = sync.require("./cachemanager")
/** @type {import("./arrayutils")} */
const array = sync.require("./arrayutils")
/** @type {import("./discordutils")} */
const discordUtils = sync.require("./discordutils")
/** @type {import("./langutils")} */
const langUtils = sync.require("./langutils")
/** @type {import("./pagination")} */
const pagination = sync.require("./pagination")
/** @type {import("./clusterinfo")} */
const clusterInfo = sync.require("./clusterinfo")
/** @type {import("./text")} */
const text = sync.require("./text")
/** @type {import("./time")} */
const time = sync.require("./time")

sync.addTemporaryListener(sync.events, "any", (filename) => {
	const unsyncable = ["./arrayutils.js", "./cachemanager.js", "./text.js", "./time.js", "./discordutils.js", "./langutils.js", "./clusterinfo.js", "./pagination.js"]
	const found = unsyncable.find(file => {
		const joined = path.join(__dirname, file)
		return filename === joined
	})
	if (found) {
		console.log("Resyncing utils")
		sync.resync(__filename)
	}
}, "on")


const utils = {
	arrayRandom: array.random,
	arrayShuffle: array.shuffle,
	AsyncValueCache: AsyncValueCache,
	BetterTimeout: BetterTimeout,
	BitmapCache: BitmapCache,
	ImageCache: ImageCache,
	FontCache: FontCache,
	/** @type {import("../../typings").Merge<jimpStores, {}>} */
	jimpStores: jimpStores,
	/** @type {import("../../typings").Merge<coinsManager, {}>} */
	coinsManager: coinsManager,
	/** @type {import("../../typings").Merge<editLavalinkNodes, {}>} */
	editLavalinkNodes: editLavalinkNodes,
	/** @type {import("../../typings").Merge<sql, {}>} */
	sql: sql,
	/** @type {import("../../typings").Merge<orm, {}>} */
	orm: orm
}

/**
 * @type {import("../../typings").Merge<utils, cacheManager> & text & time & discordUtils & langUtils & clusterInfo & pagination}
 */
module.exports = Object.assign(utils, cacheManager, text, time, discordUtils, langUtils, clusterInfo, pagination)
