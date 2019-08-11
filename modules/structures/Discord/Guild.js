const Discord = require("discord.js");

const QueueManager = require("../../managers/Discord/Queues");
const Structures = require("../");
const { Amanda, GuildMember } = Structures;

class Guild extends Discord.Guild {
	/**
	 * @param {Amanda} client
	 * @param {any} data
	 */
	constructor(client, data) {
		super(client, data);
	}
	get queue() {
		return QueueManager.storage.get(this.id);
	}
	/**
	 * @param {Structures.Message} message Message Object
	 * @param {String} string String to search members by
	 * @param {Boolean} [self=false] If the function should return the `message` author's member Object
	 * @returns {Promise<GuildMember>}
	 */
	findMember(message, string, self = false) {
		return new Promise(async resolve => {
			let permissions;
			if (message.channel instanceof Discord.TextChannel) permissions = message.channel.permissionsFor(this.me);
			string = string.toLowerCase();
			if (/<@!?(\d+)>/.exec(string)) string = /<@!?(\d+)>/.exec(string)[1];
			/** @type {Array<(member: GuildMember) => Boolean>} */
			let matchFunctions = [];
			matchFunctions = matchFunctions.concat([
				member => member.id.includes(string),
				member => member.user.tag.toLowerCase() == string,
				member => member.user.username.toLowerCase() == string,
				member => member.displayName.toLowerCase() == string,
				member => member.user.username.toLowerCase().includes(string),
				member => member.displayName.toLowerCase().includes(string)
			]);
			if (!string) {
				if (self) return resolve(message.member);
				else return resolve(null);
			} else {
				if (this.members.get(string)) return resolve(this.members.get(string));
				let list = [];
				matchFunctions.forEach(i => this.members.filter(m => i(m)).forEach(mem => { if (!list.includes(mem) && list.length < 10) list.push(mem) }));
				if (list.length == 1) return resolve(list[0]);
				if (list.length == 0) return resolve(null);
				let embed = new Discord.MessageEmbed().setTitle("Member selection").setDescription(list.map((item, i) => `${i+1}. ${item.user.tag}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor("36393E");
				let content;
				if (!permissions.has("EMBED_LINKS")) content = `${embed.title}\n${embed.description}\n${embed.footer.text}`;
				else content = embed;
				let selectmessage = await message.channel.send(content);
				let collector = message.channel.createMessageCollector((m => m.author.id == message.author.id), {maxMatches: 1, time: 60000});
				return await collector.next.then(newmessage => {
					let index = parseInt(newmessage.content);
					if (!index || !list[index-1]) return resolve(null);
					selectmessage.delete();
					newmessage.delete().catch(new Function());
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
	}
}

Discord.Structures.extend("Guild", () => { return Guild; });
module.exports = Guild;