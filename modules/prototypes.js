const Discord = require("discord.js");

// Discord Prototypes
// Client Prototypes

/**
 * @param {Discord.Message} msg
 * @param {String} usertxt
 * @param {Boolean} self
 * @returns {Promise<(Discord.User|null)>}
 */
Discord.Client.prototype.findUser = async function(msg, usertxt, self = false) {
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
		if (self) return msg.author;
		else return null;
	} else {
		if (this.users.get(usertxt)) return this.users.get(usertxt);
		let list = [];
		matchFunctions.forEach(i => this.users.filter(u => i(u)).forEach(us => { if (!list.includes(us) && list.length < 10) list.push(us) }));
		if (list.length == 1) return list[0];
		if (list.length == 0) return null;
		let embed = new Discord.RichEmbed().setTitle("User selection").setDescription(list.map((item, i) => `${i+1}. ${item.tag}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor("36393E");
		let selectmessage = await msg.channel.send(embed);
		let collector = msg.channel.createMessageCollector((m => m.author.id == msg.author.id), {maxMatches: 1, time: 60000});
		return await collector.next.then(newmessage => {
			let index = parseInt(newmessage.content);
			if (!index || !list[index-1]) return null;
			selectmessage.delete();
			newmessage.delete();
			return list[index-1];
		}).catch(() => {
			selectmessage.edit(embed.setTitle("User selection cancelled").setDescription("").setFooter(""));
			return null;
		});
	}
}
/**
 * @param {String} emoji
 */
Discord.Client.prototype.parseEmoji = function(emoji) {
	let type, e;
	e = Discord.Util.parseEmoji(emoji);
	if (e == null) return null;
	if (e.id == undefined) return null;
	if (e.animated) type = "gif";
	else type = "png";
	return { animated: e.animated, name: e.name, id: e.id, url: `https://cdn.discordapp.com/emojis/${e.id}.${type}` };
}


// Guild Prototypes
/**
 * @param {Discord.Message} msg
 * @param {String} usertxt
 * @param {Boolean} self
 * @returns {Promise<(Discord.GuildMember|null)>}
 */
Discord.Guild.prototype.findMember = async function(msg, usertxt, self = false) {
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
		if (self) return msg.member;
		else return null;
	} else {
		if (this.members.get(usertxt)) return this.members.get(usertxt);
		let list = [];
		matchFunctions.forEach(i => this.members.filter(m => i(m)).forEach(mem => { if (!list.includes(mem) && list.length < 10) list.push(mem) }));
		if (list.length == 1) return list[0];
		if (list.length == 0) return null;
		let embed = new Discord.RichEmbed().setTitle("Member selection").setDescription(list.map((item, i) => `${i+1}. ${item.user.tag}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor("36393E");
		let selectmessage = await msg.channel.send(embed);
		let collector = msg.channel.createMessageCollector((m => m.author.id == msg.author.id), {maxMatches: 1, time: 60000});
		return await collector.next.then(newmessage => {
			let index = parseInt(newmessage.content);
			if (!index || !list[index-1]) return null;
			selectmessage.delete();
			newmessage.delete();
			return list[index-1];
		}).catch(() => {
			selectmessage.edit(embed.setTitle("Member selection cancelled").setDescription("").setFooter(""));
			return null;
		});
	}
}


// Channel Prototypes

/**
 * @returns {Promise<void>}
 */
Discord.Channel.prototype.sendTyping = function() {
	if (this.startTyping) return this.client.rest.methods.sendTyping(this.id);
	else return Promise.reject(new TypeError("Channel is not a text channel, cannot sendTyping"));
}
/**
 * @returns {Promise<Discord.Message>}
 */
Discord.Channel.prototype.sendNopeMessage = function() {
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
}


// User Prototypes
Discord.User.prototype.__defineGetter__('smallAvatarURL', function() {
	if (this.avatar) return `https://cdn.discordapp.com/avatars/${this.id}/${this.avatar}.png?size=32`;
	else return `https://cdn.discordapp.com/embed/avatars/${this.discriminator % 5}.png`;
});
Discord.User.prototype.sizedAvatarURL = function(size = 128, preferredFormat = "png") {
	if (this.avatar) return `https://cdn.discordapp.com/avatars/${this.id}/${this.avatar}.${preferredFormat}?size=${size}`;
	else return this.displayAvatarURL;
}
Discord.User.prototype.__defineGetter__("presenceEmoji", function() {
	let presences = {
		online: "<:online:453823508200554508>",
		idle: "<:idle:453823508028456971>",
		dnd: "<:dnd:453823507864748044>",
		offline: "<:invisible:453827513995755520>"
	};
	return presences[this.presence.status];
});
Discord.User.prototype.__defineGetter__("presencePrefix", function() {
	if (this.presence.game == null) return null;
	let prefixes = ["Playing", "Streaming", "Listening to", "Watching"];
	return prefixes[this.presence.game.type];
});


// GuildMember Prototypes
Discord.GuildMember.prototype.__defineGetter__("presenceEmoji", function() {
	let presences = {
		online: "<:online:453823508200554508>",
		idle: "<:idle:453823508028456971>",
		dnd: "<:dnd:453823507864748044>",
		offline: "<:invisible:453827513995755520>"
	};
	return presences[this.presence.status];
});
Discord.GuildMember.prototype.__defineGetter__("presencePrefix", function() {
	if (this.presence.game == null) return null;
	let prefixes = ["Playing", "Streaming", "Listening to", "Watching"];
	return prefixes[this.presence.game.type];
});
Discord.GuildMember.prototype.__defineGetter__("displayTag", function() {
	return this.nickname ? `${this.user.tag} (${this.nickname})` : this.user.tag;
});



// Non Discord Prototypes
Array.prototype.random = function() {
	return this[Math.floor(Math.random()*this.length)];
}

/**
 * @returns {Array<any>}
 */
Array.prototype.shuffle = function() {
	let old = [...this];
	let output = [];
	while (old.length) {
		let random = old.splice(Math.floor(Math.random()*old.length), 1)[0];
		output.push(random);
	}
	return output;
}

/**
 * @param {String} format
 * @returns {String}
 */
Number.prototype.humanize = function(format) {
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
}