const Discord = require("discord.js");

// Discord Prototypes
// Client Prototypes
Object.defineProperties(Discord.Client.prototype, {
	findUser: {
		/**
		 * @param {Discord.Message} msg
		 * @param {String} usertxt
		 * @param {Boolean} self
		 * @returns {Promise<(Discord.User|null)>}
		 */
		value: function(msg, usertxt, self = false) {
			return new Promise(async resolve => {
				let permissions;
				if (msg.channel.type != "dm") permissions = msg.channel.permissionsFor(this.user);
				usertxt = usertxt.toLowerCase();
				if (/<@!?(\d+)>/.exec(usertxt)) usertxt = /<@!?(\d+)>/.exec(usertxt)[1];
				let matchFunctions = [];
				matchFunctions = matchFunctions.concat([
					user => user.id.includes(usertxt),
					user => user.tag.toLowerCase() == usertxt,
					user => user.username.toLowerCase() == usertxt,
					user => user.username.toLowerCase().includes(usertxt)
				]);
				if (!usertxt) {
					if (self) return resolve(msg.author);
					else return resolve(null);
				} else {
					if (this.users.get(usertxt)) resolve(this.users.get(usertxt));
					let list = [];
					matchFunctions.forEach(i => this.users.filter(u => i(u)).forEach(us => { if (!list.includes(us) && list.length < 10) list.push(us) }));
					if (list.length == 1) return resolve(list[0]);
					if (list.length == 0) return resolve(null);
					let embed = new Discord.RichEmbed().setTitle("User selection").setDescription(list.map((item, i) => `${i+1}. ${item.tag}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor("36393E");
					let content;
					if (permissions && !permissions.has("EMBED_LINKS")) content = `${embed.title}\n${embed.description}\n${embed.footer.text}`;
					else content = embed;
					let selectmessage = await msg.channel.send(content);
					let collector = msg.channel.createMessageCollector((m => m.author.id == msg.author.id), {maxMatches: 1, time: 60000});
					return await collector.next.then(newmessage => {
						let index = parseInt(newmessage.content);
						if (!index || !list[index-1]) return resolve(null);
						selectmessage.delete();
						if (msg.channel.type != "dm") newmessage.delete();
						return resolve(list[index-1]);
					}).catch(() => {
						let content;
						embed.setTitle("User selection cancelled").setDescription("").setFooter("");
						if (permissions && !permissions.has("EMBED_LINKS")) content = `${embed.title}\n${embed.description}\n${embed.footer.text}`;
						else content = embed;
						selectmessage.edit(content);
						return resolve(null);
					});
				}
			});
		},
		configurable: true
	},
	parseEmoji: {
		value: function(emoji) {
			let type, e;
			e = Discord.Util.parseEmoji(emoji);
			if (e == null) return null;
			if (e.id == undefined) return null;
			if (e.animated) type = "gif";
			else type = "png";
			return { animated: e.animated, name: e.name, id: e.id, url: `https://cdn.discordapp.com/emojis/${e.id}.${type}` };
		},
		configurable: true
	}
});


// Guild Prototypes
Object.defineProperties(Discord.Guild.prototype, {
	findMember: {
		/**
		 * @param {Discord.Message} msg
		 * @param {String} usertxt
		 * @param {Boolean} self
		 * @returns {Promise<(Discord.GuildMember|null)>}
		 */
		value: function(msg, usertxt, self = false) {
			return new Promise(async resolve => {
				let permissions = msg.channel.permissionsFor(this.me);
				usertxt = usertxt.toLowerCase();
				if (/<@!?(\d+)>/.exec(usertxt)) usertxt = /<@!?(\d+)>/.exec(usertxt)[1];
				let matchFunctions = [];
				matchFunctions = matchFunctions.concat([
					member => member.id.includes(usertxt),
					member => member.user.tag.toLowerCase() == usertxt,
					member => member.user.username.toLowerCase() == usertxt,
					member => member.displayName.toLowerCase() == usertxt,
					member => member.user.username.toLowerCase().includes(usertxt),
					member => member.displayName.toLowerCase().includes(usertxt)
				]);
				if (!usertxt) {
					if (self) return resolve(msg.member);
					else return resolve(null);
				} else {
					if (this.members.get(usertxt)) return resolve(this.members.get(usertxt));
					let list = [];
					matchFunctions.forEach(i => this.members.filter(m => i(m)).forEach(mem => { if (!list.includes(mem) && list.length < 10) list.push(mem) }));
					if (list.length == 1) return resolve(list[0]);
					if (list.length == 0) return resolve(null);
					let embed = new Discord.RichEmbed().setTitle("Member selection").setDescription(list.map((item, i) => `${i+1}. ${item.user.tag}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor("36393E");
					let content;
					if (!permissions.has("EMBED_LINKS")) content = `${embed.title}\n${embed.description}\n${embed.footer.text}`;
					else content = embed;
					let selectmessage = await msg.channel.send(content);
					let collector = msg.channel.createMessageCollector((m => m.author.id == msg.author.id), {maxMatches: 1, time: 60000});
					return await collector.next.then(newmessage => {
						let index = parseInt(newmessage.content);
						if (!index || !list[index-1]) return resolve(null);
						selectmessage.delete();
						newmessage.delete();
						return resolve(list[index-1]);
					}).catch(() => {
						let content;
						embed.setTitle("Member selection cancelled").setDescription("").setFooter("");
						if (permissions && !permissions.has("EMBED_LINKS")) content = `${embed.title}\n${embed.description}\n${embed.footer.text}`;
						else content = embed;
						selectmessage.edit(content);
						resolve(null);
					});
				}
			});
		},
		configurable: true
	}
});


// Channel Prototypes
Object.defineProperties(Discord.Channel.prototype, {
	sendTyping: {
		value: function() {
			if (this.startTyping) return this.client.rest.methods.sendTyping(this.id);
			else return Promise.reject(new TypeError("Channel is not a text channel, cannot sendTyping"));
		},
		configurable: true
	},
	sendNopeMessage: {
		value: function() {
			return new Promise(async (resolve, reject) => {
				let nope = [["No.", 300], ["Nice try.", 1000], ["How about no?", 1550], [`Don't even try it.`, 3000]];
				let [no, time] = nope[Math.floor(Math.random() * nope.length)];
				try {
					await this.sendTyping();
					setTimeout(() => { resolve(this.send(no)); }, time);
				} catch (reason) {
					reject(reason);
				}
			});
		},
		configurable: true
	}
});


// User Prototypes
Object.defineProperties(Discord.User.prototype, {
	smallAvatarURL: {
		get: function() {
			if (this.avatar) return `https://cdn.discordapp.com/avatars/${this.id}/${this.avatar}.png?size=32`;
			else return `https://cdn.discordapp.com/embed/avatars/${this.discriminator % 5}.png`;
		},
		configurable: true
	},
	presenceEmoji: {
		get: getPresenceEmoji,
		configurable: true
	},
	presencePrefix: {
		get: getPresencePrefix,
		configurable: true
	},
	sizedAvatarURL: {
		value: function(size = 128, preferredFormat = "png") {
			if (this.avatar) return `https://cdn.discordapp.com/avatars/${this.id}/${this.avatar}.${preferredFormat}?size=${size}`;
			else return this.displayAvatarURL;
		},
		configurable: true
	}
});


// GuildMember Prototypes
Object.defineProperties(Discord.GuildMember.prototype, {
	presenceEmoji: {
		get: getPresenceEmoji,
		configurable: true
	},
	presencePrefix: {
		get: getPresencePrefix,
		configurable: true
	},
	displayTag: {
		get: function() { return this.nickname ? `${this.user.tag} (${this.nickname})` : this.user.tag },
		configurable: true
	}
});
function getPresenceEmoji () {
	let presences = {
		playing: {
			online: "<:online_playing:606662982608486403>",
			idle: "<:idle_playing:606662982226804767>",
			dnd: "<:dnd_playing:606662982197444634>",
			offline: "<:invisible:606662982558154774>"
		},
		regular: {
			online: "<:online:606664341298872324>",
			idle: "<:idle:606664341353267221>",
			dnd: "<:dnd:606664341269381163>",
			offline: "<:invisible:606662982558154774>"
		}
	};
	if (this.presence.game) return presences.playing[this.presence.status];
	else return presences.regular[this.presence.status];
}
function getPresencePrefix() {
	if (this.presence.game == null) return null;
	let prefixes = ["Playing", "Streaming", "Listening to", "Watching"];
	return prefixes[this.presence.game.type];
}


// Non Discord Prototypes
Object.defineProperties(Array.prototype, {
	random: {
		value: function() {
			return this[Math.floor(Math.random()*this.length)];
		},
		configurable: true
	},
	shuffle: {
		value: function() {
			let old = [...this];
			let output = [];
			while (old.length) {
				let random = old.splice(Math.floor(Math.random()*old.length), 1)[0];
				output.push(random);
			}
			return output;
		},
		configurable: true
	}
});

Object.defineProperties(Number.prototype, {
	humanize: {
		value: function(format) {
			let msec;
			if (!format) throw new RangeError("No Input was provided");
			if (format.toLowerCase() == "ms") msec = Math.floor(this);
			else if (format.toLowerCase() == "sec") msec = Math.floor(this * 1000);
			else throw new TypeError("Invalid format provided");
			if (isNaN(msec)) throw new TypeError("Input provided is NaN");
			let days = Math.floor(msec / 1000 / 60 / 60 / 24);
			msec -= days * 1000 * 60 * 60 * 24;
			let hours = Math.floor(msec / 1000 / 60 / 60);
			msec -= hours * 1000 * 60 * 60;
			let mins = Math.floor(msec / 1000 / 60);
			msec -= mins * 1000 * 60;
			let secs = Math.floor(msec / 1000);
			let timestr = "";
			if (days > 0) timestr += days + "d ";
			if (hours > 0) timestr += hours + "h ";
			if (mins > 0) timestr += mins + "m ";
			if (secs > 0) timestr += secs + "s";
			return timestr;
		},
		configurable: true
	}
});