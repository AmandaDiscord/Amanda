// @ts-check

const Discord = require("discord.js")
const passthrough = require("../passthrough")

const { config, reloader, commands } = passthrough

const utils = require("../modules/utilities")
reloader.sync("./modules/utilities/index.js", utils)

commands.assign([
	{
		usage: "None",
		description: "See Amanda's to-do list",
		aliases: ["todo", "trello", "tasks"],
		category: "meta",
		example: "&todo",
		process(msg, suffix) {
			msg.channel.send(`Trello board: ${config.website_protocol}://${config.website_domain}/to/todo`)
		}
	}
])

/* eslint no-multiple-empty-lines: "off", no-irregular-whitespace: "off" */

/*


	        /----\
	    /--/      \--\
	/--/              \--\
	|                    |
	| This tombstone is  |
	| dedicated to the   |
	| retired todo list. |
	|                    |
	|     2019-2020      |
	|                    |
	|   Rest In Peace    |
	|                    |
	|__∩⁔_⁔~⁔__⁔~~∩__⁔_~_|
	======================



/**
 * @param {string[]} words
 /
function extractTags(words, enableRemove = false) {
	/** @type {string[]} /
	const addTags = []
	/** @type {string[]} /
	const removeTags = []
	/** @type {string[]} /
	const filteredWords = []
	words.forEach(word => {
		if (word.startsWith("+") && word.length >= 2) addTags.push(word.slice(1))
		else if (enableRemove && word.startsWith("-") && word.length >= 2) removeTags.push(word.slice(1))
		else if (word.trim().length !== 0) filteredWords.push(word.trim())
	})
	return {
		addTags,
		removeTags,
		name: filteredWords.join(" ").trim()
	}
}

function buildItemStrings(items, tags) {
	let largestID = 0
	items.forEach(item => {
		item.tags = tags.filter(tag => tag.id === item.id).map(tag => tag.tag)
		if (item.id > largestID) largestID = item.id
	})
	const largestIDLength = ("" + largestID).length
	const itemStrings = items.map(item => {
		item.id = `${item.id}`
		let result = "`" + "​ ".repeat(largestIDLength - item.id.length) + item.id + "` " // SC: ZWSP
		if (item.complete) result += "🔸"
		else result += "▪"
		result += ` **${item.name}**`
		if (item.tags.length) {
			result += " ("
			result += item.tags.join(", ")
			result += ")"
		}
		return result
	})
	return itemStrings
}

/**
 * @param {Discord.TextChannel|Discord.DMChannel} channel
 * @param {string[]} itemStrings
 /
function paginateResults(channel, itemStrings) {
	if (itemStrings.length === 0) return channel.send("No matches.")
	const pages = utils.createPages(itemStrings, 2000, 15, 5)
	const embed = new Discord.MessageEmbed().setTitle("Todo list").setColor(0x36393f)
	utils.paginate(channel, pages.length, page => {
		embed.setDescription(pages[page])
		if (pages.length > 1) embed.setFooter(`Page ${page + 1} of ${pages.length}`)
		return embed
	})
}

/**
 * @param {Discord.Message} msg
 * @returns {Promise<boolean>}
 /
async function checkAdmin(msg) {
	const result = await utils.sql.hasPermission(msg.author, "eval")
	if (result) return true
	msg.channel.send("The todo list is only for tracking Amanda. Sorry, only Amanda's owners can edit it.")
	return false
}

commands.assign({
	"todo": {
		aliases: ["todo"],
		category: "admin",
		description: "See Amanda's to-do list",
		usage: "[list|tag|tags|add|remove|complete|incomplete]",
		async process(msg, suffix) {
			const words = suffix.split(" ")
			const subcommand = words.shift()
			if (subcommand === "add") {
				const allowed = await checkAdmin(msg)
				if (!allowed) return
				const { addTags: tags, name } = extractTags(words, false)
				if (name.trim().length === 0) return msg.channel.send(`Usage: &todo ${subcommand} something really cool +tag +anothertag`)
				const connection = await utils.getConnection()
				await utils.sql.all("INSERT INTO Todo (name, complete) VALUES (?, 0)", name, connection)
				const id = (await utils.sql.get("SELECT last_insert_id() AS id", [], connection)).id
				connection.release()
				tags.forEach(tag => {
					utils.sql.all("INSERT INTO TodoTags (id, tag) VALUES (?, ?)", [id, tag])
				})
				msg.react("✅")
			} else if (subcommand === "delete" || subcommand === "remove") {
				const allowed = await checkAdmin(msg)
				if (!allowed) return
				const idString = words.shift()
				const id = +idString
				if (!idString || isNaN(id)) return msg.channel.send(`Usage: &todo ${subcommand} <id>`)
				utils.sql.all("DELETE FROM Todo WHERE id = ?", id)
				utils.sql.all("DELETE FROM TodoTags WHERE id = ?", id)
				msg.react("✅")
			} else if (subcommand === "tag") {
				const filter = words.join(" ").trim()
				if (!filter) return msg.channel.send(`Usage: &todo ${subcommand} <tag> [anothertag...]`)
				const tagMatch = Array(words.length).fill("tag = ?").join(" OR ")
				/** @type {any[]} /
				const params = words
				params.push(words.length)
				const items = await utils.sql.all(
					"SELECT id, name, complete"
					+ " FROM ("
						+ "SELECT id, name, complete, count(tag) AS count"
						+ " FROM Todo"
						+ " INNER JOIN TodoTags USING (id)"
						+ ` WHERE ${tagMatch}`
						+ " GROUP BY id)"
					+ " AS t"
					+ " WHERE count = ?"
					, params)
				const tags = await utils.sql.all("SELECT id, tag FROM TodoTags")
				const itemStrings = buildItemStrings(items, tags)
				paginateResults(msg.channel, itemStrings)
			} else if (subcommand === "tags") {
				const tags = (await utils.sql.all("SELECT DISTINCT tag FROM TodoTags")).map(row => row.tag)
				msg.channel.send(`All tags: ${tags.join(", ")}`)
			} else if (subcommand === "complete") {
				const allowed = await checkAdmin(msg)
				if (!allowed) return
				const idString = words.shift()
				const id = +idString
				if (!idString || isNaN(id)) return msg.channel.send(`Usage: &todo ${subcommand} <id>`)
				utils.sql.all("UPDATE Todo SET complete = 1 WHERE id = ?", id)
				msg.react("✅")
			} else if (subcommand === "incomplete" || subcommand === "uncomplete" || subcommand === "revoke") {
				const allowed = await await checkAdmin(msg)
				if (!allowed) return
				const idString = words.shift()
				const id = +idString
				if (!idString || isNaN(id)) return msg.channel.send(`Usage: &todo ${subcommand} <id>`)
				utils.sql.all("UPDATE Todo SET complete = 0 WHERE id = ?", id)
				msg.react("✅")
			} else if (subcommand === "view" || subcommand === "list" || !subcommand) {
				const filter = words.join(" ").trim()
				let items
				if (filter) items = await utils.sql.all("SELECT id, name, complete FROM Todo WHERE name LIKE ?", `%${filter}%`)
				else items = await utils.sql.all("SELECT id, name, complete FROM Todo")
				const tags = await utils.sql.all("SELECT id, tag FROM TodoTags")
				const itemStrings = buildItemStrings(items, tags)
				paginateResults(msg.channel, itemStrings)
			} else return msg.channel.send("Invalid subcommand. Options are: list, tag, tags, add, remove, complete, incomplete")
		}
	}
})
*/
