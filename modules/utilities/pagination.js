// @ts-check

const Discord = require("thunderstorm")
const InteractionMenu = require("@amanda/interactionmenu")

const passthrough = require("../../passthrough")
const { sync, constants } = passthrough

/** @type {import("./discordutils")} */
const discordUtil = sync.require("./discordutils")
const contentify = discordUtil.contentify
const createMessageCollector = discordUtil.createMessageCollector

/** @type {import("./arrayutils")} */
const array = sync.require("./arrayutils")

/**
 * @param {string[]} rows
 * @param {number} maxLength
 * @param {number} itemsPerPage
 * @param {number} itemsPerPageTolerance
 */
function createPages(rows, maxLength, itemsPerPage, itemsPerPageTolerance) {
	const pages = []
	let currentPage = []
	let currentPageLength = 0
	const currentPageMaxLength = maxLength
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]
		if ((currentPage.length >= itemsPerPage && rows.length - i > itemsPerPageTolerance) || currentPageLength + row.length + 1 > currentPageMaxLength) {
			pages.push(currentPage)
			currentPage = []
			currentPageLength = 0
		}
		currentPage.push(row)
		currentPageLength += row.length + 1
	}
	pages.push(currentPage)
	return pages
}

/**
 * @param {string[][]} rows
 * @param {any[]} align
 * @param {(currentLine?: number) => string} surround
 * @param {string} spacer
 * @returns {string[]}
 */
function tableifyRows(rows, align, surround = () => "", spacer = " ") { // SC: en space
	/** @type {string[]} */
	const output = []
	const maxLength = []
	for (let i = 0; i < rows[0].length; i++) {
		let thisLength = 0
		for (const row of rows) {
			if (thisLength < row[i].length) thisLength = row[i].length
		}
		maxLength.push(thisLength)
	}
	for (let i = 0; i < rows.length; i++) {
		let line = ""
		for (let j = 0; j < rows[0].length; j++) {
			if (align[j] == "left" || align[j] == "right") {
				line += surround(i)
				if (align[j] == "left") {
					const pad = " ​"
					const padding = pad.repeat(maxLength[j] - rows[i][j].length)
					line += rows[i][j] + padding
				} else if (align[j] == "right") {
					const pad = "​ "
					const padding = pad.repeat(maxLength[j] - rows[i][j].length)
					line += padding + rows[i][j]
				}
				line += surround(i)
			} else {
				line += rows[i][j]
			}
			if (j < rows[0].length - 1) line += spacer
		}
		output.push(line)
	}
	return output
}

/**
 * @param {import("thunderstorm/src/structures/interfaces/TextBasedChannel")} channel
 * @param {string[]} title
 * @param {string[][]} rows
 */
function createPagination(channel, title, rows, align, maxLength) {
	let alignedRows = tableifyRows([title].concat(rows), align, () => "`")
	const formattedTitle = alignedRows[0].replace(/`.+?`/g, sub => `__**\`${sub}\`**__`)
	alignedRows = alignedRows.slice(1)
	const pages = createPages(alignedRows, maxLength - formattedTitle.length - 1, 16, 4)
	paginate(channel, pages.length, page => {
		// @ts-ignore
		return contentify(channel,
			new Discord.MessageEmbed()
				.setTitle("Viewing all playlists")
				.setColor(constants.standard_embed_color)
				.setDescription(`${formattedTitle}\n${pages[page].join("\n")}`)
				.setFooter(`Page ${page + 1} of ${pages.length}`)
		)
	})
}

/**
 * @param {import("thunderstorm/src/structures/interfaces/TextBasedChannel")} channel
 * @param {number} pageCount
 * @param {(page?: number) => Discord.MessageEditOptions | Promise<Discord.MessageEditOptions>} callback
 */
async function paginate(channel, pageCount, callback) {
	let page = 0
	if (pageCount > 1) {
		let menuExpires
		const menu = new InteractionMenu(channel, [
			{ emoji: { id: "328062456905728002", name: "bn_ba" }, style: "SECONDARY", actionType: "js", actionData: async (message) => {
				page--
				if (page < 0) page = pageCount - 1
				message.edit(Object.assign({}, await callback(page), { components: message.components }))
				makeTimeout()
			} },
			{ emoji: { id: "328724374465282049", name: "bn_fo" }, style: "SECONDARY", actionType: "js", actionData: async (message) => {
				page++
				if (page >= pageCount) page = 0
				message.edit(Object.assign({}, await callback(page), { components: message.components }))
				makeTimeout()
			} }
		])
		menu.create(await callback(page))
		// eslint-disable-next-line no-inner-declarations
		function makeTimeout() {
			clearTimeout(menuExpires)
			menuExpires = setTimeout(() => {
				menu.destroy(true)
			}, 10 * 60 * 1000)
		}
		makeTimeout()
	} else channel.send(await callback(0))
}

/**
 * @param {Array<string>} rows
 * @param {number} [maxLength=2000]
 * @param {number} [joinLength=1]
 * @param {string} [endString="…"]
 */
function removeEnd(rows, maxLength = 2000, joinLength = 1, endString = "…") {
	let currentLength = 0
	const maxItems = 20
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]
		if (i >= maxItems || currentLength + row.length + joinLength + endString.length > maxLength) {
			return rows.slice(0, i).concat([endString])
		}
		currentLength += row.length + joinLength
	}
	return rows
}

/**
 * @param {Array<string>} rows
 * @param {number} [maxLength=2000]
 * @param {number} [joinLength=1]
 * @param {string} [middleString="…"]
 */
function removeMiddle(rows, maxLength = 2000, joinLength = 1, middleString = "…") {
	let currentLength = 0
	let currentItems = 0
	const maxItems = 20
	/**
	 * Holds items for the left and right sides.
	 * Items should flow into the left faster than the right.
	 * At the end, the sides will be combined into the final list.
	 */
	const reconstruction = new Map([
		["left", []],
		["right", []]
	])
	let leftOffset = 0
	let rightOffset = 0
	function getNextDirection() {
		return rightOffset * 3 > leftOffset ? "left" : "right"
	}
	while (currentItems < rows.length) {
		const direction = getNextDirection()
		let row
		if (direction == "left") row = rows[leftOffset++]
		else row = rows[rows.length - 1 - rightOffset++]
		if (currentItems >= maxItems || currentLength + row.length + joinLength + middleString.length > maxLength) {
			return reconstruction.get("left").concat([middleString], reconstruction.get("right").reverse())
		}
		reconstruction.get(direction).push(row)
		currentLength += row.length + joinLength
		currentItems++
	}
	return reconstruction.get("left").concat(reconstruction.get("right").reverse())
}

/**
 * @param {T[]} items
 * @param {string} startString One-based index
 * @param {string} endString One-based index
 * @param {boolean} shuffle Shuffle the result before returning
 * @returns {T[]}
 * @template T
 */
function playlistSection(items, startString, endString, shuffle) {
	let from = startString == "-" ? 1 : (Number(startString) || 1)
	let to = endString == "-" ? items.length : (Number(endString) || from || items.length) // idk how to fix this
	from = Math.max(from, 1)
	to = Math.min(items.length, to)
	if (startString) items = items.slice(from - 1, to)
	if (shuffle) {
		array.shuffle(items)
	}
	if (!startString && !shuffle) items = items.slice() // make copy of array for consistent behaviour
	return items
}

/**
 * @param {import("thunderstorm/src/structures/interfaces/TextBasedChannel")} channel
 * @param {string} authorID
 * @param {string} title
 * @param {string} failedTitle
 * @param {string[]} items
 * @param {Discord.MessageEmbed} [embed=undefined]
 * @returns {Promise<number|null>} The zero-based index that was selected, or null if invalid response.
 */
function makeSelection(channel, authorID, title, failedTitle, items, embed = undefined) {
	// eslint-disable-next-line no-async-promise-executor
	return new Promise(async (res) => {
		// Set up embed
		if (!embed) embed = new Discord.MessageEmbed()
		embed.setTitle(title)
		embed.setDescription(items.join("\n"))
		embed.setColor(constants.standard_embed_color)
		embed.setFooter(`Type a number from 1-${items.length} to select that item`)
		// Send embed
		const selectmessage = await channel.send(await contentify(channel, embed))
		// Make collector
		async function cb(newmessage) {
			// Collector got a message
			let index = Number(newmessage.content)
			// Is index a number?
			if (isNaN(index)) return onFail()
			index--
			// Is index in bounds?
			if (index < 0 || index >= items.length) return onFail()
			// Edit to success
			embed.setDescription(`» ${items[index]}`)
			embed.setFooter("")
			selectmessage.edit(await contentify(selectmessage.channel, embed))
			return res(index)
		}
		async function onFail() {
			// Collector failed, show the failure message and return null
			embed.setTitle(failedTitle)
			embed.setDescription("")
			embed.setFooter("")
			selectmessage.edit(await contentify(selectmessage.channel, embed))
			return res(null)
		}
		createMessageCollector({ channelID: channel.id, userIDs: [authorID] }, cb, onFail)
	})
}

module.exports.createPages = createPages
module.exports.tableifyRows = tableifyRows
module.exports.createPagination = createPagination
module.exports.paginate = paginate
module.exports.makeSelection = makeSelection
module.exports.playlistSection = playlistSection
module.exports.compactRows = {
	removeEnd,
	removeMiddle
}
