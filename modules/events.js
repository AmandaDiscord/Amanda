//@ts-check

const Discord = require("discord.js");
const path = require("path");
const {PlayerManager} = require("discord.js-lavalink");

const passthrough = require("../passthrough")
let {client, config, commands, reloadEvent, reloader} = passthrough;

let lastAttemptedLogins = [];

let prefixes = [];
let statusPrefix = "&";
let starting = true;
if (client.readyAt != null) starting = false;

let lavalinknodes = [
	{host: "amanda.discord-bots.ga", port: 10402, password: config.lavalink_password}
];

let utils = require("./utilities.js");
reloader.useSync("./modules/utilities.js", utils);

utils.addTemporaryListener(client, "message", path.basename(__filename), manageMessage);
if (!starting) manageReady();
else utils.addTemporaryListener(client, "ready", path.basename(__filename), manageReady);
utils.addTemporaryListener(client, "messageReactionAdd", path.basename(__filename), reactionEvent);
utils.addTemporaryListener(client, "messageUpdate", path.basename(__filename), data => {
	if (data && data.id && data.channel_id && data.content && data.author && data.member) {
		const channel = client.channels.get(data.channel_id)
		if (channel instanceof Discord.TextChannel || channel instanceof Discord.DMChannel) {
			const message = new Discord.Message(client, data, channel)
			manageMessage(message)
		}
	}
})
utils.addTemporaryListener(client, "shardDisconnected", path.basename(__filename), (reason) => {
	if (reason) console.log(`Disconnected with ${reason.code} at ${reason.path}.`);
	if (lastAttemptedLogins.length) console.log(`Previous disconnection was ${Math.floor(Date.now()-lastAttemptedLogins.slice(-1)[0]/1000)} seconds ago.`);
	lastAttemptedLogins.push(Date.now());
	new Promise(resolve => {
		if (lastAttemptedLogins.length >= 3) {
			let oldest = lastAttemptedLogins.shift();
			let timePassed = Date.now()-oldest;
			let timeout = 30000;
			if (timePassed < timeout) return setTimeout(() => resolve(), timeout - timePassed);
		}
		return resolve()
	}).then(() => {
		client.login(config.bot_token);
	});
});
utils.addTemporaryListener(client, "error", path.basename(__filename), reason => {
	if (reason) console.error(reason);
});
utils.addTemporaryListener(process, "unhandledRejection", path.basename(__filename), reason => {
	if (reason && reason.code) {
		if ([10003, 10008, 50001, 50013].includes(reason.code)) return;
	}
	if (reason) console.error(reason);
	else console.log("There was an error but no reason");
});
utils.addTemporaryListener(client, "guildMemberUpdate", path.basename(__filename), async (oldMember, newMember) => {
	if (newMember.guild.id != "475599038536744960") return;
	if (!oldMember.roles.get("475599593879371796") && newMember.roles.get("475599593879371796")) {
		let row = await utils.sql.get("SELECT * FROM Premium WHERE userID =?", newMember.id);
		if (!row) await utils.sql.all("INSERT INTO Premium (userID, state) VALUES (?, ?)", [newMember.id, 1]);
		else return;
	}
	else return;
});

/**
 * @param {Discord.Message} msg
 */
async function manageMessage(msg) {
	if (msg.author.bot) return;
	if (msg.content == `<@${client.user.id}>`.replace(" ", "") || msg.content == `<@!${client.user.id}>`.replace(" ", "")) return msg.channel.send(`Hey there! My prefix is \`${statusPrefix}\` or \`@${client.user.tag}\`. Try using \`${statusPrefix}help\` for a complete list of my commands.`);
	let prefix = prefixes.find(p => msg.content.startsWith(p));
	if (!prefix) return;
	if (msg.guild) await msg.guild.members.fetch(client.user)
	let cmdTxt = msg.content.substring(prefix.length).split(" ")[0];
	let suffix = msg.content.substring(cmdTxt.length + prefix.length + 1);
	let cmd = commands.find(c => c.aliases.includes(cmdTxt));
	if (cmd) {
		try {
			await cmd.process(msg, suffix);
		} catch (e) {
			if (e && e.code) {
				if (e.code == 10008) return;
				if (e.code == 50013) return;
			}
			// Report to original channel
			let msgTxt = `command ${cmdTxt} failed <:rip:401656884525793291>\n`+(await utils.stringify(e));
			let embed = new Discord.MessageEmbed()
			.setDescription(msgTxt)
			.setColor("dd2d2d")
			if (await utils.hasPermission(msg.author, "eval")) msg.channel.send(embed);
			else msg.channel.send(`There was an error with the command ${cmdTxt} <:rip:401656884525793291>. The developers have been notified. If you use this command again and you see this message, please allow a reasonable time frame for this to be fixed`);
			// Report to #amanda-error-log
			let reportChannel = client.channels.get("512869106089852949");
			if (reportChannel instanceof Discord.TextChannel) {
				embed.setTitle("Command error occurred.");
				let details = [
					["User", msg.author.tag],
					["User ID", msg.author.id],
					["Bot", msg.author.bot ? "Yes" : "No"]
				];
				if (msg.channel instanceof Discord.TextChannel) {
					details = details.concat([
						["Guild", msg.guild.name],
						["Guild ID", msg.guild.id],
						["Channel", "#"+msg.channel.name],
						["Channel ID", msg.channel.id]
					]);
				} else {
					details = details.concat([
						["DM", "Yes"]
					]);
				}
				let maxLength = details.reduce((p, c) => Math.max(p, c[0].length), 0);
				let detailsString = details.map(row =>
					"`"+row[0]+" ​".repeat(maxLength-row[0].length)+"` "+row[1] //SC: space + zwsp, wide space
				).join("\n");
				embed.addField("Details", detailsString);
				embed.addField("Message content", "```\n"+msg.content.replace(/`/g, "ˋ")+"```"); //SC: IPA modifier grave U+02CB
				reportChannel.send(embed);
			}
		}
	} else return;
}

async function manageReady() {
	utils.sql.all("SELECT * FROM AccountPrefixes WHERE userID = ?", [client.user.id]).then(result => {
		prefixes = result.map(r => r.prefix);
		statusPrefix = result.find(r => r.status).prefix;
		console.log("Loaded "+prefixes.length+" prefixes: "+prefixes.join(" "));
		if (starting) client.emit("prefixes", prefixes, statusPrefix)
	});
	if (starting) {
		console.log(`Successfully logged in as ${client.user.username}`);
		process.title = client.user.username;
		lavalinknodes.forEach(node => node.resumeKey = client.user.id)
		client.lavalink = new PlayerManager(this, lavalinknodes, {
			user: client.user.id,
			shards: 1
		});
		client.lavalink.on("ready", () => {
			console.log("Lavalink ready")
		})
		client.lavalink.on("error", (self, error) => {
			console.error("Failed to initialise Lavalink: "+error.message)
		})
		utils.sql.all("SELECT * FROM RestartNotify WHERE botID = ?", [client.user.id]).then(result => {
			result.forEach(row => {
				let channel = client.channels.get(row.channelID);
				if (channel instanceof Discord.TextChannel) {
					channel.send("<@"+row.mentionID+"> Restarted! Uptime: "+utils.shortTime(process.uptime(), "sec"));
				} else {
					let user = client.users.get(row.mentionID);
					if (!user) console.log(`Could not notify ${row.mentionID}`);
					else user.send("Restarted! Uptime: "+utils.shortTime(process.uptime(), "sec"));
				}
			});
			utils.sql.all("DELETE FROM RestartNotify WHERE botID = ?", [client.user.id]);
		});
	}
}

/**
 * @param {object} data
 * @property {string} data.user_id
 * @param {Discord.Channel} channel
 * @param {Discord.User} user
 */
function reactionEvent(data, channel, user) {
	/*
	data
		user_id: snowflake
		channel_id: snowflake
		message_id: snowflake
		emoji
			id: snowflake?
			name: string
	*/
	// Set up vars
	let emoji = data.emoji
	let menu = passthrough.reactionMenus.get(data.message_id)
	// Quick conditions
	if (user.id == client.user.id) return;
	if (!menu) return;
	// We now have a menu
	let msg = menu.message;
	let action = menu.actions.find(a => utils.fixEmoji(a.emoji) == utils.fixEmoji(emoji))
	// Make sure the emoji is actually an action
	if (!action) return;
	// Make sure the user is allowed
	if ((action.allowedUsers && !action.allowedUsers.includes(user.id)) || (action.deniedUsers && action.deniedUsers.includes(user.id))) {
		utils.removeUncachedReaction(channel.id, data.message_id, data.emoji, user.id)
		return;
	}
	// Actually do stuff
	switch (action.actionType) {
	case "reply":
		msg.channel.send(user.toString()+" "+action.actionData);
		break;
	case "edit":
		msg.edit(action.actionData);
		break;
	case "js":
		action.actionData(msg, emoji, user);
		break;
	}
	switch (action.ignore) {
	case "that":
		menu.actions.find(a => a.emoji == emoji).actionType = "none";
		break;
	case "thatTotal":
		menu.actions = menu.actions.filter(a => a.emoji != emoji);
		break;
	case "all":
		menu.actions.forEach(a => a.actionType = "none");
		break;
	case "total":
		menu.destroy(true);
		break;
	}
	switch (action.remove) {
	case "user":
		utils.removeUncachedReaction(channel.id, data.message_id, data.emoji, user.id)
		break;
	case "bot":
		utils.removeUncachedReaction(channel.id, data.message_id, data.emoji)
		break;
	case "all":
		msg.reactions.clear();
		break;
	case "message":
		menu.destroy(true);
		msg.delete();
		break;
	}
}
