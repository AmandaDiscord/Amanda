const Discord = require("discord.js");
const path = require("path");

require("../types.js");

let lastAttemptedLogins = [];

/**
 * @param {PassthroughType} passthrough
 */
module.exports = function(passthrough) {
	let { client, config, commands, reloadEvent, reloader, reactionMenus, queueManager } = passthrough;
	let prefixes = [];
	let statusPrefix = "&";
	let starting = true;
	if (client.readyAt != null) starting = false;

	let utils = require("./utilities.js")(passthrough);
	reloader.useSync("./modules/utilities.js", utils);

	utils.addTemporaryListener(client, "message", path.basename(__filename), manageMessage);
	if (!starting) manageReady();
	else utils.addTemporaryListener(client, "ready", path.basename(__filename), manageReady);
	utils.addTemporaryListener(client, "messageReactionAdd", path.basename(__filename), reactionEvent);
	utils.addTemporaryListener(client, "messageUpdate", path.basename(__filename), (oldMessage, data) => {
		if (data.constructor.name == "Message") manageMessage(data);
		else if (data.content) {
			let channel = client.channels.get(data.channel_id);
			let message = new Discord.Message(channel, data, client);
			manageMessage(message);
		}
	});
	utils.addTemporaryListener(client, "disconnect", path.basename(__filename), (reason) => {
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
			if (reason.code == 10008) return;
			if (reason.code == 50013) return;
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
		let prefix = prefixes.find(p => msg.content.startsWith(p));
		if (!prefix) return;
		let cmdTxt = msg.content.substring(prefix.length).split(" ")[0];
		let suffix = msg.content.substring(cmdTxt.length + prefix.length + 1);
		let cmd = Object.values(commands).find(c => c.aliases.includes(cmdTxt));
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
				let embed = new Discord.RichEmbed()
				.setDescription(msgTxt)
				.setColor("dd2d2d")
				msg.channel.send({embed});
				// Report to #amanda-error-log
				let reportChannel = client.channels.get("512869106089852949");
				if (reportChannel) {
					embed.setTitle("Command error occurred.");
					let details = [
						["User", msg.author.tag],
						["User ID", msg.author.id],
						["Bot", msg.author.bot ? "Yes" : "No"]
					];
					if (msg.guild) {
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
		} else {
			if (msg.content.startsWith(`<@${client.user.id}>`) || msg.content.startsWith(`<@!${client.user.id}>`)) {
				let username = msg.guild ? msg.guild.me.displayName : client.user.username;
				let chat = msg.cleanContent.replace(new RegExp('@' + username + ',?'), '').trim();
				if (!chat) return;
				msg.channel.sendTyping();
				let owner = await client.fetchUser("320067006521147393");
				if (chat.toLowerCase().startsWith("say")) return;
				try {
					require("request-promise")(`http://ask.pannous.com/api?input=${encodeURIComponent(chat)}`).then(async res => {
						let data = JSON.parse(res);
						if (!data.sp("output.0.actions")) return msg.channel.send("Terribly sorry but my Ai isn't working as of recently (◕︵◕)\nHopefully, the issue gets resolved soon. Until then, why not try some of my other features?");
						let text = data.output[0].actions.say.text.replace(/Jeannie/gi, client.user.username).replace(/Master/gi, msg.member ? msg.member.displayName : msg.author.username).replace(/Pannous/gi, owner.username);
						if (text.length >= 2000) text = text.slice(0, 1999)+"…";
						if (chat.toLowerCase().includes("ip") && text.match(/(\d{1,3}\.){3}\d{1,3}/)) return msg.channel.send("no");
						if (text == "IE=edge,chrome=1 (Answers.com)" && data.sp("output.0.actions.source.url")) text = "I believe you can find the answer here: "+data.output[0].actions.source.url;
						if (["sex", "fuck", "cock"].find(word => text.toLowerCase().includes(word))) return msg.channel.send(`I think I misunderstood what you said. My response was a bit unprofessional. Let's talk about something else`);
						msg.channel.send(text);
					});
				} catch (error) { msg.channel.send(error); };
			} else return;
		}
	}

	async function manageReady() {
		utils.sql.all("SELECT * FROM AccountPrefixes WHERE userID = ?", [client.user.id]).then(result => {
			prefixes = result.map(r => r.prefix);
			statusPrefix = result.find(r => r.status).prefix;
			console.log("Loaded "+prefixes.length+" prefixes");
			if (starting) client.emit("prefixes", prefixes)
		});
		if (starting) {
			console.log(`Successfully logged in as ${client.user.username}`);
			process.title = client.user.username;
			utils.sql.all("SELECT * FROM RestartNotify WHERE botID = ?", [client.user.id]).then(result => {
				result.forEach(row => {
					let channel = client.channels.get(row.channelID);
					if (!channel) {
						let user = client.users.get(row.mentionID);
						if (!user) console.log(`Could not notify ${row.mentionID}`);
						else user.send("Restarted! Uptime: "+process.uptime().humanize("sec"));
					} else channel.send("<@"+row.mentionID+"> Restarted! Uptime: "+process.uptime().humanize("sec"));
				});
				utils.sql.all("DELETE FROM RestartNotify WHERE botID = ?", [client.user.id]);
			});
			update();
			client.setInterval(update, 300000);
		}
	}

	/**
	 * @param {Array<any>} actions
	 */
	Discord.Message.prototype.reactionMenu = function(actions) {
		let message = this;
		return new ReactionMenu(message, actions);
	}

	class ReactionMenu {
		/**
		 * @param {Discord.Message} message
		 * @param {Array<any>} actions
		 */
		constructor(message, actions) {
			this.message = message;
			this.actions = actions;
			reactionMenus[this.message.id] = this;
			this.promise = this.react();
		}
		async react() {
			for (let a of this.actions) {
				a.messageReaction = await this.message.react(a.emoji).catch(new Function());
			}
		}
		destroy(remove) {
			delete reactionMenus[this.message.id];
			if (remove) {
				if (this.message.channel.type == "text") {
					this.message.clearReactions().catch(new Function());
				} else if (this.message.channel.type == "dm") {
					this.actions.forEach(a => {
						if (a.messageReaction) a.messageReaction.remove().catch(new Function());
					});
				}
			}
		}
	}

	/**
	 * @param {Discord.MessageReaction} messageReaction
	 * @param {Discord.User} user
	 */
	function reactionEvent(messageReaction, user) {
		let id = messageReaction.messageID;
		let emoji = messageReaction.emoji;
		if (user.id == client.user.id) return;
		let menu = reactionMenus[id];
		if (!menu) return;
		let msg = menu.message;
		let action = menu.actions.find(a => a.emoji == emoji || (a.emoji.name == emoji.name && a.emoji.id == emoji.id));
		if (!action) return;
		if ((action.allowedUsers && !action.allowedUsers.includes(user.id)) || (action.deniedUsers && action.deniedUsers.includes(user.id))) {
			if (action.remove == "user") messageReaction.remove(user);
			return;
		}
		switch (action.actionType) {
		case "reply":
			msg.channel.send(user.mention+" "+action.actionData);
			break;
		case "edit":
			msg.edit(action.actionData);
			break;
		case "js":
			action.actionData(msg, emoji, user, messageReaction, reactionMenus);
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
			messageReaction.remove(user);
			break;
		case "bot":
			messageReaction.remove();
			break;
		case "all":
			msg.clearReactions();
			break;
		case "message":
			menu.destroy(true);
			msg.delete();
			break;
		}
	}

	const presences = {
		yearly: [
			['alone', 'PLAYING'], ['in a box', 'PLAYING'], ['with fire 🔥', 'PLAYING'], ['dead', 'PLAYING'],
			['anime', 'WATCHING'], ['Netflix', 'WATCHING'], ['YouTube', 'WATCHING'], ['bots take over the world', 'WATCHING'], ['endless space go by', 'WATCHING'], ['cute cat videos', 'WATCHING'],
			['music', 'LISTENING'], ['Spotify', 'LISTENING'],
			['Netflix for ∞ hours', 'STREAMING']
		],
		newYears: [
			["with sparklers", "PLAYING"],
			["a fireworks show", "WATCHING"], ["Times Square", "WATCHING"], ["the countdown", "WATCHING"],
			["The Final Countdown", "LISTENING"],
			["fire snakes", "STREAMING"]
		],
		halloween: [
			["Silent Hill", "PLAYING"],
			["scary movies", "WATCHING"], ["Halloween decor being hung", "WATCHING"],
			["Thriller by M.J.", "LISTENING"], ["the screams of many", "LISTENING"],
			["Halloween on Netflix", "STREAMING"]
		],
		thanksgiving: [
			["in the leaves", "PLAYING"],
			["people give thanks", "LISTENING"],
			["my family eat a feast", "WATCHING"]
		],
		christmas: [
			["in the snow", "PLAYING"],
			["Christmas carols", "LISTENING"],
			["The Night before Christmas", "WATCHING"], ["snow fall", "WATCHING"],
			["Christmas movies", "STREAMING"]
		]
	};

	function update() {
		let now = new Date().toJSON();
		let choice;
		if (now.includes("-10-09")) choice = [["happy age++, Cadence <3", "STREAMING"]]
		else if (now.includes("-10-")) choice = presences.halloween;
		else if (now.includes("-11-22")) choice = presences.thanksgiving;
		else if (now.includes("-12-25")) choice = [["with wrapping paper", "PLAYING"], ["presents being unwrapped", "WATCHING"]];
		else if (now.includes("-12-31")) choice = presences.newYears;
		else if (now.includes("-12-")) choice = presences.christmas;
		else if (now.includes("-01-01")) choice = presences.newYears;
		else if (now.includes("-01-16")) choice = [["at my owner's bday party", "PLAYING"]];
		else if (now.includes("-07-04")) choice = [["with fireworks 💥", "PLAYING"]];
		else choice = presences.yearly;
		const [name, type] = choice[Math.floor(Math.random() * choice.length)];
		client.user.setActivity(`${name} | ${statusPrefix}help`, { type, url: 'https://www.twitch.tv/papiophidian/' });
	};

}
