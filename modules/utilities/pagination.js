// @ts-check

const Discord = require("thunderstorm")
const ReactionMenu = require("@amanda/reactionmenu")
const { contentify, createMessageCollector } = require("./discordutils")
const { shuffle: arrayShuffle } = require("./arrayutils")
const { constants } = require("../../passthrough")

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
		for (let j = 0; j < rows.length; j++) {
			if (thisLength < rows[j][i].length) thisLength = rows[j][i].length
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
 * @param {Discord.Message["channel"]} channel
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
 * @param {Discord.Message["channel"]} channel
 * @param {number} pageCount
 * @param {(page: number) => any} callback
 */
async function paginate(channel, pageCount, callback) {
	let page = 0
	const msg = await channel.send(await callback(page))
	if (pageCount > 1) {
		let reactionMenuExpires
		/* const reactionMenu = new ReactionMenu(msg, [
			{ emoji: "bn_ba:328062456905728002", remove: "user", actionType: "js", actionData: () => {
				page--
				if (page < 0) page = pageCount - 1
				msg.edit(callback(page))
				makeTimeout()
			} },
			{ emoji: "bn_fo:328724374465282049", remove: "user", actionType: "js", actionData: () => {
				page++
				if (page >= pageCount) page = 0
				msg.edit(callback(page))
				makeTimeout()
			} }
		])*/
		// eslint-disable-next-line no-inner-declarations
		function makeTimeout() {
			clearTimeout(reactionMenuExpires)
			reactionMenuExpires = setTimeout(() => {
				// reactionMenu.destroy(true)
			}, 10 * 60 * 1000)
		}
		makeTimeout()
	}
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
		arrayShuffle(items)
	}
	if (!startString && !shuffle) items = items.slice() // make copy of array for consistent behaviour
	return items
}

/**
 * @param {Discord.Message["channel"]} channel
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
		createMessageCollector({ channelID: channel.id, userIDs: [authorID] }, async (newmessage) => {
			// Collector got a message
			let index = Number(newmessage.content)
			// Is index a number?
			if (isNaN(index)) throw new Error()
			index--
			// Is index in bounds?
			if (index < 0 || index >= items.length) throw new Error() // just head off to the catch
			// Edit to success
			embed.setDescription(`» ${items[index]}`)
			embed.setFooter("")
			selectmessage.edit(await contentify(selectmessage.channel, embed))
			return res(index)
		}, async () => {
			// Collector failed, show the failure message and return null
			embed.setTitle(failedTitle)
			embed.setDescription("")
			embed.setFooter("")
			selectmessage.edit(await contentify(selectmessage.channel, embed))
			return null
		})
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
