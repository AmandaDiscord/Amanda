const Discord = require("discord.js");

const Structures = require("../");
const { Message, User, TextChannel } = Structures;

class Amanda extends Discord.Client {
	/**
	 * @param {Discord.ClientOptions} [options]
	 */
	constructor(options) {
		super(options);

		/** @type {Structures.UserStore} */
		this.users;

		/** @type {Structures.GuildStore} */
		this.guilds;
	}
	/**
	 * @param {Message} message Message Object
	 * @param {String} string String to search users by
	 * @param {Boolean} [self=false] If the function should return the `message` author's user Object
	 * @returns {Promise<User>}
	 */
	findUser(message, string, self = false) {
		return new Promise(async resolve => {
			let permissions;
			if (message.channel instanceof TextChannel) permissions = message.channel.permissionsFor(this.user);
			string = string.toLowerCase();
			if (/<@!?(\d+)>/.exec(string)) string = /<@!?(\d+)>/.exec(string)[1];
			/** @type {Array<(user: User) => boolean>} */
			let matchFunctions = [];
			matchFunctions = matchFunctions.concat([
				user => user.id.includes(string),
				user => user.tag.toLowerCase() == string,
				user => user.username.toLowerCase() == string,
				user => user.username.toLowerCase().includes(string)
			]);
			if (!string) {
				if (self) return resolve(message.author);
				else return resolve(null);
			} else {
				if (this.users.get(string)) resolve(this.users.get(string));
				let list = [];
				matchFunctions.forEach(i => this.users.filter(u => i(u)).forEach(us => { if (!list.includes(us) && list.length < 10) list.push(us) }));
				if (list.length == 1) return resolve(list[0]);
				if (list.length == 0) return resolve(null);
				let embed = new Discord.MessageEmbed().setTitle("User selection").setDescription(list.map((item, i) => `${i+1}. ${item.tag}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor("36393E");
				let content;
				if (permissions && !permissions.has("EMBED_LINKS")) content = `${embed.title}\n${embed.description}\n${embed.footer.text}`;
				else content = embed;
				let selectmessage = await message.channel.send(content);
				let collector = message.channel.createMessageCollector((m => m.author.id == message.author.id), {maxMatches: 1, time: 60000});
				return await collector.next.then(newmessage => {
					let index = parseInt(newmessage.content);
					if (!index || !list[index-1]) return resolve(null);
					selectmessage.delete();
					if (message.channel.type != "dm") newmessage.delete().catch(new Function());
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
	}
}

module.exports = Amanda;