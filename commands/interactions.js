let Canvas = require("canvas-prebuilt");
let util = require("util");
let fs = require("fs");
let crypto = require("crypto");
let request = require("request");
let responses = ["That's not strange at all...", "W-What? Why?", "I find it strange that you tried to do that...", "Ok then...", "Come on... Don't make yourself look like an idiot...", "Why even try?", "Oh...", "You are so weird...", "<:NotLikeCat:411364955493761044>"];
let router = require("../router.js");
let interaction_info = {
	"hug": {
		"description": "Hugs someone",
		"arguments": "<user>",
		"aliases": ["hug"],
		"category": ["interaction"]
	},
	"kiss": {
		"description": "Kisses someone",
		"arguments": "<user>",
		"aliases": ["kiss"],
		"category": ["interaction"]
	},
	"cuddle": {
		"description": "Cuddles someone",
		"arguments": "<user>",
		"aliases": ["cuddle"],
		"category": ["interaction"]
	},
	"poke": {
		"description": "Pokes someone",
		"arguments": "<user>",
		"aliases": ["poke"],
		"category": ["interaction"]
	},
	"slap": {
		"description": "Slaps someone",
		"arguments": "<user>",
		"aliases": ["slap"],
		"category": ["interaction"]
	},
	"boop": {
		"description": "Boops someone",
		"arguments": "<user>",
		"aliases": ["boop"],
		"category": ["interaction"]
	},
	"pat": {
		"description": "Pats someone",
		"arguments": "<user>",
		"aliases": ["pat"],
		"category": ["interaction"]
	},
	"nom": {
		"description": "Noms someone",
		"arguments": "<user>",
		"aliases": ["nom"],
		"category": ["interaction"]
	},
	"ship": {
		"description": "Ships two people",
		"arguments": "<mention 1> <mention 2>",
		"aliases": ["ship"],
		"category": ["interaction"]
	},
	"bean": {
		"description": "Beans a user",
		"arguments": "<user>",
		"aliases": ["bean"],
		"category": ["interaction"]
	}
}

router.emit("help", interaction_info);
router.on("command", file_interaction);
router.once(__filename, () => {
	router.removeListener("command", file_interaction);
});
async function file_interaction(passthrough) {
	let { Discord, client, utils, msg, cmd, suffix } = passthrough;

	if (cmd == "hug") {
		if (msg.channel.type !== "text") return msg.channel.send("Why would you want to hug someone in DMs?");
		if (!suffix) return msg.channel.send(`You have to tell me who you wanna hug`);
		let member = msg.guild.findMember(msg, suffix);
		if (member == null) return msg.channel.send("Couldn't find that user");
		if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to hug`);
		if (member.user.id == msg.author.id) return msg.channel.send(responses[Math.floor(Math.random() * responses.length)]);
		if (member.user.id == client.user.id) return msg.channel.send(`**Hugs ${msg.author.username} back** :heart:`);
		request("https://nekos.life/api/v2/img/hug", function(err, res, body) {
			if (err) return msg.channel.send("Error... Api returned nothing");
			let data;
			try {
				data = JSON.parse(body);
			} catch (error) {
				return msg.channel.send(`There was an error:\n${error}`);
			}
			let embed = new Discord.RichEmbed()
				.setDescription(`${msg.author.username} hugged <@${member.user.id}>`)
				.setImage(data.url)
				.setColor("36393E")
				.setFooter("Powered by nekos.life")
			return msg.channel.send({embed});
		});
	}


	else if (cmd == "kiss") {
		if (msg.channel.type !== "text") return msg.channel.send("Why would you want to kiss someone in DMs?");
		if (!suffix) return msg.channel.send(`You have to tell me who you wanna kiss`);
		let member = msg.guild.findMember(msg, suffix);
		if (member == null) return msg.channel.send("Couldn't find that user");
		if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to kiss`);
		if (member.user.id == msg.author.id) return msg.channel.send(responses[Math.floor(Math.random() * responses.length)]);
		if (member.user.id == client.user.id) return msg.channel.send(`**Kisses ${msg.author.username} back** :heart:`);
		request("https://nekos.life/api/v2/img/kiss", function(err, res, body) {
			if (err) return msg.channel.send("Error... Api returned nothing");
			let data;
			try {
				data = JSON.parse(body);
			} catch (error) {
				return msg.channel.send(`There was an error:\n${error}`);
			}
			let embed = new Discord.RichEmbed()
				.setDescription(`${msg.author.username} kissed <@${member.user.id}>`)
				.setImage(data.url)
				.setColor("36393E")
				.setFooter("Powered by nekos.life")
			return msg.channel.send({embed});
		});
	}


	else if (cmd == "cuddle") {
		if (msg.channel.type !== "text") return msg.channel.send("Why would you want to cuddle someone in DMs?");
		if (!suffix) return msg.channel.send(`You have to tell me who you wanna cuddle`);
		let member = msg.guild.findMember(msg, suffix);
		if (member == null) return msg.channel.send("Couldn't find that user");
		if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to cuddle`);
		if (member.user.id == msg.author.id) return msg.channel.send(responses[Math.floor(Math.random() * responses.length)]);
		if (member.user.id == client.user.id) return msg.channel.send(`**Cuddles ${msg.author.username} back** :heart:`);
		request("https://nekos.life/api/v2/img/cuddle", function(err, res, body) {
			if (err) return msg.channel.send("Error... Api returned nothing");
			let data;
			try {
				data = JSON.parse(body);
			} catch (error) {
				return msg.channel.send(`There was an error:\n${error}`);
			}
			let embed = new Discord.RichEmbed()
				.setDescription(`${msg.author.username} cuddled <@${member.user.id}>`)
				.setImage(data.url)
				.setColor("36393E")
				.setFooter("Powered by nekos.life")
			return msg.channel.send({embed});
		});
	}


	else if (cmd == "poke") {
		if (msg.channel.type !== "text") return msg.channel.send("Why would you want to poke someone in DMs?");
		if (!suffix) return msg.channel.send(`You have to tell me who you wanna poke`);
		let member = msg.guild.findMember(msg, suffix);
		if (member == null) return msg.channel.send("Couldn't find that user");
		if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to poke`);
		if (member.user.id == msg.author.id) return msg.channel.send(responses[Math.floor(Math.random() * responses.length)]);
		if (member.user.id == client.user.id) return msg.channel.send(`Don't poke me ; ^ ;`);
		request("https://nekos.life/api/v2/img/poke", function(err, res, body) {
			if (err) return msg.channel.send("Error... Api returned nothing");
			let data;
			try {
				data = JSON.parse(body);
			} catch (error) {
				return msg.channel.send(`There was an error:\n${error}`);
			}
			let embed = new Discord.RichEmbed()
				.setDescription(`${msg.author.username} poked <@${member.user.id}>`)
				.setImage(data.url)
				.setColor("36393E")
				.setFooter("Powered by nekos.life")
			return msg.channel.send({embed});
		});
	}

	else if (cmd == "slap") {
		if (msg.channel.type !== "text") return msg.channel.send("Why would you want to slap someone in DMs?");
		if (!suffix) return msg.channel.send(`You have to tell me who you wanna slap`);
		let member = msg.guild.findMember(msg, suffix);
		if (member == null) return msg.channel.send("Couldn't find that user");
		if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to slap`);
		if (member.user.id == msg.author.id) return msg.channel.send(responses[Math.floor(Math.random() * responses.length)]);
		if (member.user.id == client.user.id) return msg.channel.send(`**Slaps ${msg.author.username} back** That hurt me\n; ^ ;`);
		request("https://nekos.life/api/v2/img/slap", function(err, res, body) {
			if (err) return msg.channel.send("Error... Api returned nothing");
			let data;
			try {
				data = JSON.parse(body);
			} catch (error) {
				return msg.channel.send(`There was an error:\n${error}`);
			}
			let embed = new Discord.RichEmbed()
				.setDescription(`${msg.author.username} slapped <@${member.user.id}>`)
				.setImage(data.url)
				.setColor("36393E")
				.setFooter("Powered by nekos.life")
			return msg.channel.send({embed});
		});
	}


	else if (cmd == "boop") {
		if (msg.channel.type !== "text") return msg.channel.send("Why would you want to boop someone in DMs?");
		if (!suffix) return msg.channel.send(`You have to tell me who you wanna boop`);
		let member = msg.guild.findMember(msg, suffix);
		if (member == null) return msg.channel.send("Couldn't find that user");
		if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to boop`);
		if (member.user.id == msg.author.id) return msg.channel.send(responses[Math.floor(Math.random() * responses.length)]);
		if (member.user.id == client.user.id) return msg.channel.send(`Dun boop me ; ^ ;`);
		request("http://api.shodanbot.com/interactions/boop", function(err, res, body) {
			if (err) return msg.channel.send("Error... Api returned nothing");
			let data;
			try {
				data = JSON.parse(body);
			} catch (error) {
				return msg.channel.send(`There was an error:\n${error}`);
			}
			let embed = new Discord.RichEmbed()
				.setDescription(`${msg.author.username} booped <@${member.user.id}>`)
				.setImage(data.img)
				.setColor("36393E")
			return msg.channel.send({embed});
		});
	}

	
	else if (cmd == "pat") {
		if (msg.channel.type !== "text") return msg.channel.send("Why would you want to pat someone in DMs?");
		if (!suffix) return msg.channel.send(`You have to tell me who you wanna pat`);
		let member = msg.guild.findMember(msg, suffix);
		if (member == null) return msg.channel.send("Couldn't find that user");
		if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to pat`);
		if (member.user.id == msg.author.id) return msg.channel.send(responses[Math.floor(Math.random() * responses.length)]);
		if (member.user.id == client.user.id) return msg.channel.send(`≥ w ≤`);
		request("https://nekos.life/api/v2/img/pat", function(err, res, body) {
			if (err) return msg.channel.send("Error... Api returned nothing");
			let data;
			try {
				data = JSON.parse(body);
			} catch (error) {
				return msg.channel.send(`There was an error:\n${error}`);
			}
			let embed = new Discord.RichEmbed()
				.setDescription(`${msg.author.username} patted <@${member.user.id}>`)
				.setImage(data.url)
				.setColor("36393E")
				.setFooter("Powered by nekos.life")
			return msg.channel.send({embed});
		});
	}


	else if (cmd == "nom") {
		if (msg.channel.type !== "text") return msg.channel.send("Why would you want to nom someone in DMs?");
		if (!suffix) return msg.channel.send(`You have to tell me who you wanna nom`);
		let member = msg.guild.findMember(msg, suffix);
		if (member == null) return msg.channel.send("Couldn't find that user");
		if (!suffix) return msg.channel.send(`${msg.author.username}, you need to provide someone to nom`);
		if (member.user.id == msg.author.id) return msg.channel.send(responses[Math.floor(Math.random() * responses.length)]);
		if (member.user.id == client.user.id) return msg.channel.send(`owie`);
		request("http://api.shodanbot.com/interactions/nom", function(err, res, body) {
			if (err) return msg.channel.send("Error... Api returned nothing");
			let data;
			try {
				data = JSON.parse(body);
			} catch (error) {
				return msg.channel.send(`There was an error:\n${error}`);
			}
			let embed = new Discord.RichEmbed()
				.setDescription(`${msg.author.username} nommed <@${member.user.id}>`)
				.setImage(data.img)
				.setColor("36393E")
			return msg.channel.send({embed});
		});
	}


	else if (cmd == "ship") {
		if (msg.channel.type == "dm") return msg.channel.send(`You cannot use this command in DMs`);
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
		]).then(([avatar1, avatar2, emoji, template]) => {
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
			return msg.channel.send(`Aww. I'd rate ${mem1.user.tag} and ${mem2.user.tag} being together a ${percentage}%`,{files: [buffer]});
		});
	}


	else if (cmd == "bean") {
		if (msg.channel.type !== "text") return msg.channel.send("You can't bean someone in DMs, silly");
		if (!suffix) return msg.channel.send(`You have to tell me someone to bean!`);
		let member;
		member = msg.guild.findMember(msg, suffix, true);
		if (member == null) return msg.channel.send(`Couldn't find that user`);
		if (member.id == client.user.id) return msg.channel.send(`No u`);
		if (member.id == msg.author.id) return msg.channel.send(`You can't bean yourself, silly`);
		return msg.channel.send(`**${member.user.tag}** has been banned!`);
	}
}