// @ts-check

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
	cacheManager: cacheManager.cacheManager,
	/** @type {import("../../typings").Merge<coinsManager, {}>} */
	coinsManager: coinsManager,
	contentify: discordUtils.contentify,
	createMessageCollector: discordUtils.createMessageCollector,
	emojiURL: discordUtils.emojiURL,
	getAvatarJimp: discordUtils.getAvatarJimp,
	getPrefixes: discordUtils.getPrefixes,
	rateLimiter: discordUtils.rateLimiter,
	resolveWebhookMessageAuthor: discordUtils.resolveWebhookMessageAuthor,
	userFlagEmojis: discordUtils.userFlagEmojis,
	getLang: langUtils.getLang,
	replace: langUtils.replace,
	compactRows: pagination.compactRows,
	createPages: pagination.createPages,
	createPagination: pagination.createPagination,
	makeSelection: pagination.makeSelection,
	paginate: pagination.paginate,
	playlistSection: pagination.playlistSection,
	tableifyRows: pagination.tableifyRows,
	getOwnStats: clusterInfo.getOwnStats,
	/** @type {import("../../typings").Merge<editLavalinkNodes, {}>} */
	editLavalinkNodes: editLavalinkNodes,
	/** @type {import("../../typings").Merge<sql, {}>} */
	sql: sql,
	/** @type {import("../../typings").Merge<orm, {}>} */
	orm: orm,
	numberComma: text.numberComma,
	parseNumber: text.parseNumber,
	progressBar: text.progressBar,
	stringify: text.stringify,
	getSixTime: time.getSixTime,
	parseDuration: time.parseDuration,
	shortTime: time.shortTime,
	upcomingDate: time.upcomingDate
}

module.exports = utils
