let Canvas = require("canvas-prebuilt");
let util = require("util");
let fs = require("fs");
let crypto = require("crypto");
let request = require("request");
const rp = require("request-promise");
let responses = ["That's not strange at all...", "W-What? Why?", "I find it strange that you tried to do that...", "Ok then...", "Come on... Don't make yourself look like an idiot...", "Why even try?", "Oh...", "You are so weird...", "<:NotLikeCat:411364955493761044>"];

module.exports = function(passthrough) {
	let { Discord, client, utils } = passthrough;

	let commands = {

		"ship": {
			usage: "<mention 1> <mention 2>",
			description: "Ships two people",
			aliases: ["ship"],
			category: "interaction",
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				suffix = suffix.replace(/ +/g, " ");
				let args = suffix.split(" ");
				if (args.length != 2) return msg.channel.send(`You need to provide two users as arguments`);
				let mem1 = msg.guild.findMember(msg, args[0]);
				let mem2 = msg.guild.findMember(msg, args[1]);
				if (mem1 == null) return msg.channel.send(`The first member provided was not found`);
				if (mem2 == null) return msg.channel.send(`The second member provided was not found`);
				if (mem1.id == mem2.id) return msg.channel.send(`You can't ship someone with themselves, silly`);
				msg.channel.sendTyping();
				let canvas = new Canvas(300, 100);
				let ctx = canvas.getContext("2d");
				Promise.all([
					new Promise(resolve => request(mem1.user.displayAvatarURL, {encoding: null}, (e, r, b) => resolve(b))),
					new Promise(resolve => request(mem2.user.displayAvatarURL, {encoding: null}, (e, r, b) => resolve(b))),
					util.promisify(fs.readFile)("./images/emojis/heart.png", { encoding: null }),
					util.promisify(fs.readFile)("./images/300x100.png", { encoding: null })
				]).then(async ([avatar1, avatar2, emoji, template]) => {
					let templateI = new Canvas.Image();
					templateI.src = template;
					ctx.drawImage(templateI, 0, 0, 300, 100);
					let avatarI = new Canvas.Image();
					avatarI.src = avatar1;
					ctx.drawImage(avatarI, 0, 0, 100, 100);
					let emojiI = new Canvas.Image();
					emojiI.src = emoji;
					ctx.drawImage(emojiI, 110, 10, 80, 80);
					let avatarII = new Canvas.Image();
					avatarII.src = avatar2;
					ctx.drawImage(avatarII, 200, 0, 100, 100);
					let buffer = canvas.toBuffer();
					let strings = [mem1.id, mem2.id].sort((a,b) => parseInt(a)-parseInt(b)).join(" ");
					let percentage = undefined;

					/* Custom Percentages */
					if (strings == "320067006521147393 405208699313848330") percentage = 100;
					else if (strings == "158750488563679232 185938944460980224") percentage = 99999999999;
					else if (strings == "439373663905513473 458823707175944194") percentage = 88888;

					else {
						let hash = crypto.createHash("sha256").update(strings).digest("hex").slice(0, 6);
						percentage = parseInt("0x"+hash)%101;
					}
					msg.channel.send(`Aww. I'd rate ${mem1.displayName} and ${mem2.displayName} being together a ${percentage}%`,{files: [buffer]});
				});
			}
		},

		"waifu": {
			usage: "<user>",
			description: "Gets the waifu information about yourself or a user",
			aliases: ["waifu"],
			category: "interaction",
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				let member = msg.guild.findMember(msg, suffix, true);
				if (!member) return msg.channel.send(`Couldn't find that user`);
				let info = await utils.waifu.get(member.id);
				let embed = new Discord.RichEmbed()
					.setAuthor(member.displayTag, member.user.smallAvatarURL)
					.addField(`Price:`, info.price)
					.addField(`Claimed by:`, info.claimer ? info.claimer.tag : "(nobody)")
					.addField(`Waifu:`, info.waifu ? info.waifu.tag : "(nobody)")
					.addField("Gifts", info.gifts.received.emojis || "(none)")
					.setColor("36393E")
				msg.channel.send({embed});
			}
		},

		"claim": {
			usage: "<amount> <user>",
			description: "Claims someone as a waifu. Requires Discoins",
			aliases: ["claim"],
			category: "interaction",
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				let args = suffix.split(" ");
				let usertxt = args.slice(1).join(" ");
				if (!args[0]) return msg.channel.send(`You need to provide an amount to claim the user with`);
				if (!usertxt) return msg.channel.send(`${msg.author.username}, you need to provide a member you would like to claim`);
				let member = msg.guild.findMember(msg, usertxt);
				if (!member) return msg.channel.send(`Couldn't find that user`);
				if (member.id == msg.author.id) return msg.channel.send("You can't claim yourself, silly");
				let [memberInfo, myInfo, money] = await Promise.all([
					utils.waifu.get(member.user.id),
					utils.waifu.get(msg.author.id),
					utils.coinsManager.get(msg.author.id)
				]);
				let claim = 0;
				if (args[0] == "all") {
					if (!money) return msg.channel.send(`${msg.author.username}, you don't have any <a:Discoin:422523472128901140> to claim someone with!`);
					claim = money;
				} else {
					claim = Math.floor(parseInt(args[0]));
					if (isNaN(claim)) return msg.channel.send(`${msg.author.username}, that is not a valid amount to claim someone with`);
					if (claim < 1) return msg.channel.send(`${msg.author.username}, you cannot claim someone for less than 1 <a:Discoin:422523472128901140>`);
					if (claim > money) return msg.channel.send(`${msg.author.username}, you don't have enough <a:Discoin:422523472128901140> to make that transaction`);
				}
				if (memberInfo.price > claim) return msg.channel.send(`${msg.author.username}, you don't have enough <a:Discoin:422523472128901140> to make that transaction. You need ${memberInfo.price}`);
				if (memberInfo.claimer && memberInfo.claimer.id == msg.author.id) return msg.channel.send(`${msg.author.username}, you can't claim your waifu twice over, silly. You can \`&gift <amount>\` into them, however`);
				await utils.waifu.bind(msg.author.id, member.id, claim);
				let faces = ["°˖✧◝(⁰▿⁰)◜✧˖°", "(⋈◍＞◡＜◍)。✧♡", "♡〜٩( ╹▿╹ )۶〜♡", "( ´͈ ॢꇴ `͈ॢ)･*♡", "❤⃛῍̻̩✧(´͈ ૢᐜ `͈ૢ)"];
				let face = faces[Math.floor(Math.random() * faces.length)];
				member.user.send(`${String(msg.member)} has claimed you for ${claim} <a:Discoin:422523472128901140> ${face}`).catch(() => msg.channel.send(`I tried to DM that member but they may have DMs disabled from me`));
				let embed = new Discord.RichEmbed()
					.setDescription(`${String(msg.member)} has claimed ${String(member)} for ${claim} <a:Discoin:422523472128901140>`)
					.setColor("36393E")
				msg.channel.send({embed});
			}
		},

		"divorce": {
			usage: "<reason>",
			description: "Divorces a user",
			aliases: ["divorce"],
			category: "interaction",
			process: async function(msg, suffix) {
				let info = await utils.waifu.get(msg.author.id);
				if (!info.waifu) return msg.channel.send(`${msg.author.username}, you don't even have a waifu to divorce, silly`);
				let faces = ["( ≧Д≦)", "●︿●", "(  ❛︵❛.)", "╥﹏╥", "(っ◞‸◟c)"];
				let face = faces[Math.floor(Math.random() * faces.length)];
				await utils.waifu.unbind(msg.author.id);
				msg.channel.send(`${msg.author.tag} has filed for a divorce from ${info.waifu.tag} with ${suffix ? `reason: ${suffix}` : "no reason specified"}`);
				info.waifu.send(`${msg.author.tag} has filed for a divorce from you with ${suffix ? `reason: ${suffix}` : "no reason specified"} ${face}`).catch(() => msg.channel.send(`I tried to DM ${info.waifu.tag} about the divorce but they may have DMs disabled from me`));
			}
		},

		"gift": {
			usage: "<amount>",
			description: "Gifts an amount of Discoins towards your waifu's price",
			aliases: ["gift"],
			category: "interaction",
			process: async function(msg, suffix) {
				if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
				let args = suffix.split(" ");
				let waifu = await utils.waifu.get(msg.author.id, { basic: true });
				let money = await utils.coinsManager.get(msg.author.id);
				if (!waifu) return msg.channel.send(`${msg.author.username}, you don't even have a waifu to gift Discoins to, silly`);
				if (!waifu.waifuID == null) return msg.channel.send(`${msg.author.username}, you don't even have a waifu to gift Discoins to, silly`);
				if (!args[0]) return msg.channel.send(`${msg.author.username}, you didn't provide a gift amount`);
				let gift;
				if (args[0] == "all") {
					if (money == 0) return msg.channel.send(`${msg.author.username}, you don't have any <a:Discoin:422523472128901140> to gift!`);
					gift = money;
				} else {
					if (isNaN(args[0])) return msg.channel.send(`${msg.author.username}, that is not a valid amount to gift`);
					gift = Math.floor(parseInt(args[0]));
					if (gift < 1) return msg.channel.send(`${msg.author.username}, you cannot gift less than 1`);
					if (gift > money) return msg.channel.send(`${msg.author.username}, you don't have enough <a:Discoin:422523472128901140> to make that transaction`);
				}
				await utils.waifu.transact(msg.author.id, gift);
				await utils.coinsManager.award(msg.author.id, -gift);
				let user = await client.fetchUser(waifu.waifuID);
				msg.channel.send(`${msg.author.username} has gifted ${gift} Discoins towards ${user.tag}'s price`);
			}
		},

		"waifuleaderboard": {
			usage: "none",
			description: "Displays the leaderboard of the top waifus",
			aliases: ["waifuleaderboard", "waifulb"],
			category: "interaction",
			process: async function(msg, suffix) {
				let all = await utils.waifu.all;
				let users = [];
				for (let row of all) {
					for (let key of ["userID", "waifuID"]) {
						if (!users.includes(row[key])) users.push(row[key]);
					}
				}
				let userObjectMap = new Map();
				await Promise.all(users.map(async userID => {
					let userObject = await client.fetchUser(userID);
					userObjectMap.set(userID, userObject);
				}));
				let embed = new Discord.RichEmbed()
					.setTitle("Waifu leaderboard")
					.setDescription(
						all.map((row, index) =>
							`${index+1}. ${userObjectMap.get(row.userID).tag} claimed ${userObjectMap.get(row.waifuID).tag} for ${row.price} <a:Discoin:422523472128901140>`
						).join("\n")
					)
					.setColor("F8E71C")
				msg.channel.send(embed);
			}
		},

		"bean": {
			usage: "<user>",
			description: "Beans a user",
			aliases: ["bean"],
			category: "interaction",
			process: function(msg, suffix) {
				if (msg.channel.type !== "text") return msg.channel.send("You can't bean someone in DMs, silly");
				if (!suffix) return msg.channel.send(`You have to tell me someone to bean!`);
				let member;
				member = msg.guild.findMember(msg, suffix, true);
				if (member == null) return msg.channel.send(`Couldn't find that user`);
				if (member.id == client.user.id) return msg.channel.send(`No u`);
				if (member.id == msg.author.id) return msg.channel.send(`You can't bean yourself, silly`);
				msg.channel.send(`**${member.user.tag}** has been banned!`);
			}
		}
	};

	let interactionSources = [
		{
			name: "hug", // Command object key and text filler
			description: "Hugs someone", // Command description
			verb: "hugs", // x "verbed" @y in the command response
			shortcut: "nekos.life", // nekos.life: use the command name as the endpoint
			amanda: name => `**Hugs ${name} back** :heart:`, // Response when used on the bot itself
			traaOverride: true // don't set this true for newly added types
		},{
			name: "nom",
			description: "Noms someone",
			verb: "nommed",
			shortcut: "durl", // Dynamic URL: call the function "url" and use its response as the GIF URL. Not async.
			url: () => `https://raw.githubusercontent.com/bitsnake/resources/master/Bot/Interactions/nom/nom${Math.floor(Math.random() * (10 - 1) + 1)}.gif`,
			amanda: () => "owie"
		},{
			name: "kiss",
			description: "Kisses someone",
			verb: "kissed",
			shortcut: "nekos.life",
			amanda: name => `**Kisses ${name} back** :heart:`,
			traaOverride: true
		},{
			name: "cuddle",
			description: "Cuddles someone",
			verb: "cuddles",
			shortcut: "nekos.life",
			amanda: name => `**Cuddles ${name} back** :heart:`,
			traaOverride: true
		},{
			name: "poke",
			description: "Pokes someone",
			verb: "poked",
			shortcut: "nekos.life",
			amanda: () => `Don't poke me ; ^ ;`
		},{
			name: "slap",
			description: "Slaps someone",
			verb: "slapped",
			shortcut: "nekos.life",
			amanda: name => `**Slaps ${name} back** That hurt me ; ^ ;`
		},{
			name: "boop",
			description: "Boops someone",
			verb: "booped",
			shortcut: "durl",
			url: () => `https://raw.githubusercontent.com/bitsnake/resources/master/Bot/Interactions/boop/boop${Math.floor(Math.random() * (10 - 1) + 1)}.gif`,
			amanda: () => `Dun boop me ; ^ ;`
		},{
			name: "pat",
			description: "Pats someone",
			verb: "patted",
			shortcut: "nekos.life",
			amanda: () => `≥ w ≤`,
			traaOverride: true
		}
	];

	for (let source of interactionSources) {
		let newCommand = {
			usage: "<user>",
			description: source.description,
			aliases: [source.name],
			category: "interaction",
			process: (msg, suffix) => doInteraction(msg, suffix, source)
		}
		commands[source.name] = newCommand;
	}

	const attempts = [
		(type, g1, g2) => utils.sql.all("select url, GenderGifCharacters.gifid, count(GenderGifCharacters.gifid) as count from GenderGifs inner join GenderGifCharacters on GenderGifs.gifid = GenderGifCharacters.gifid where type = ? and (((gender like ? or gender = '*') and importance = 0) or ((gender like ? or gender = '*') and importance = 1)) group by GenderGifCharacters.gifid having count(GenderGifCharacters.gifid) >= 2", [type, g1, g2]),
		(type, g1, g2) => utils.sql.all("select url, GenderGifCharacters.gifid, count(GenderGifCharacters.gifid) as count from GenderGifs inner join GenderGifCharacters on GenderGifs.gifid = GenderGifCharacters.gifid where type = ? and (((gender like ? or gender = '*') and importance = 0) or ((gender like ? or gender = '*') and importance = 1)) group by GenderGifCharacters.gifid having count(GenderGifCharacters.gifid) >= 2", [type, g2, g1]),
		(type, g1, g2) => utils.sql.all("select url, GenderGifCharacters.gifid from GenderGifs inner join GenderGifCharacters on GenderGifs.gifid = GenderGifCharacters.gifid where type = ? and (gender like ? or gender = '*')", [type, (g2 == "_" ? g1 : g2)])
	];

	const genderMap = new Map([
		["474711440607936512", "f"],
		["474711506551046155", "m"],
		["474711526247366667", "n"]
	]);

	async function doInteraction(msg, suffix, source) {
		if (msg.channel.type !== "text") return msg.channel.send(`Why would you want to ${source.name} someone in DMs?`);
		if (!suffix) return msg.channel.send(`You have to tell me who you wanna ${source.name}!`);
		let member = msg.guild.findMember(msg, suffix);
		if (member == null) return msg.channel.send("Couldn't find that user");
		if (member.user.id == msg.author.id) return msg.channel.send(responses[Math.floor(Math.random() * responses.length)]);
		if (member.user.id == client.user.id) return msg.channel.send(source.amanda(msg.author.username));
		let fetch;
		let description = "";
		if (source.traaOverride) {
			let g1 = msg.member.roles.map(r => genderMap.get(r.id)).find(r => r) || "_";
			let g2 = member.roles.map(r => genderMap.get(r.id)).find(r => r) || "_";
			//console.log(msg.member.user.username, g1, member.user.username, g2);
			if (g1 != "_" || g2 != "_") {
				let found = false;
				let i = 0;
				while (!found && i < attempts.length) {
					let rows = await attempts[i](source.name, g1, g2);
					if (rows.length) {
						fetch = Promise.resolve(rows.shuffle()[0].url);
						found = true;
					}
					i++;
				}
			}
		}
		if (!fetch) {
			if (source.fetch) {
				fetch = source.fetch();
			} else {
				if (source.shortcut == "nekos.life") {
					source.footer = "Powered by nekos.life";
					fetch = new Promise((resolve, reject) => {
						rp(`https://nekos.life/api/v2/img/${source.name}`).then(body => {
							let data = JSON.parse(body);
							resolve(data.url);
						}).catch(reject);
					});
				} else if (source.shortcut == "durl") {
					fetch = Promise.resolve(source.url());
				} else {
					fetch = Promise.reject("Shortcut didn't match a function.");
				}
			}
		}
		fetch.then(url => {
			let embed = new Discord.RichEmbed()
			.setDescription(`${msg.author.username} ${source.verb} <@${member.user.id}>`)
			.setImage(url)
			.setColor("36393E")
			if (source.footer) embed.setFooter(source.footer)
			msg.channel.send(embed);
		}).catch(error => {
			msg.channel.send("There was an error: ```\n"+error+"```")
		});
	}

	return commands;
}
