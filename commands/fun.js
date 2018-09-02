let games = {};
let letters = ["a", "b", "c", "d"];
let entities = require("entities");
let request = require("request");
let https = require("https");
let rp = require("request-promise");
let router = require("../router.js");
let fun_info = {
	"randnumber": {
		"description": "Generates a random number from a given data range.",
		"arguments": "<min #> <max #>",
		"aliases": ["randnumber", "randnum", "rn"],
		"category": ["fun"]
	},
	"chucknorris": {
		"description": "Gives a random Chuck Norris joke",
		"arguments": "none",
		"aliases": ["chucknorris", "norris", "cn"],
		"category": ["fun"]
	},
	"yomamma": {
		"description": "Gets a random yo mamma joke",
		"arguments": "none",
		"aliases": ["yomamma", "yomama", "ym"],
		"category": ["fun"]
	},
	"yesno": {
		"description": "Says yes or no about something",
		"arguments": "<question>",
		"aliases": ["yesno", "yn"],
		"category": ["fun"]
	},
	"8ball": {
		"description": "Asks the 8ball a question",
		"arguments": "<question>",
		"aliases": ["8ball", "ball"],
		"category": ["fun"]
	},
	"rate": {
		"description": "Rates something",
		"arguments": "<Thing to rate>",
		"aliases": ["rate"],
		"category": ["fun"]
	},
	"trivia": {
		"description": "A game of trivia using OpenTDB or Open Trivia Data Base",
		"arguments": "<play / categories>",
		"aliases": ["trivia", "t"],
		"category": ["fun"]
	},
	"cat": {
		"description": "Returns an image of a cute cat",
		"arguments": "none",
		"aliases": ["cat"],
		"category": ["fun", "images"]
	},
	"dog": {
		"description": "Returns an image of a cute doggo",
		"arguments": "none",
		"aliases": ["dog", "doggo"],
		"category": ["fun", "images"]
	},
	"space": {
		"description": "Returns an image of space",
		"arguments": "none",
		"aliases": ["space"],
		"category": ["fun", "images"]
	},
	"meme": {
		"description": "Returns a meme",
		"arguments": "none",
		"aliases": ["meme"],
		"category": ["fun", "images"]
	},
	"snake": {
		"description": "Returns an image of a snek",
		"arguments": "none",
		"aliases": ["snake", "snek"],
		"category": ["fun", "images"]
	},
	"bird": {
		"description": "Returns an image of a bird",
		"arguments": "none",
		"aliases": ["bird", "birb"],
		"category": ["fun", "images"]
	},
	"neko": {
		"description": "Returns an image of a neko (ฅ’ω’ฅ)",
		"arguments": "none",
		"aliases": ["neko"],
		"category": ["fun", "images"]
	}
}

router.emit("help", fun_info);
router.on("command", file_fun);
router.once(__filename, () => {
	router.removeListener("command", file_fun);
});
async function file_fun(passthrough) {
	let { Discord, client, utils, msg, cmd, suffix } = passthrough;

	if (cmd == "randnumber" || cmd == "randnum" || cmd == "rn") {
		let args = suffix.split(' ');
		let min = Math.floor(parseInt(args[0]));
		let max = Math.floor(parseInt(args[1]));
		if (!min) return msg.channel.send("Please provide a minimum number and a maximum number");
		if (!max) return msg.channel.send("Please provide a maximum number");
		if (isNaN(min)) return msg.channel.send(`${msg.author.username}, the minimum value you provided is not a number`);
		if (isNaN(max)) return msg.channel.send(`${msg.author.username}, the maximum value you provided is not a number`);
		return msg.channel.send(`${Math.floor(Math.random() * (max - min) + min)}, ${msg.author.username}`)
	}


	else if (cmd == "chucknorris" || cmd == "norris" || cmd == "cn") {
		request("http://api.icndb.com/jokes/random", function(err, res, body) {
			if (err) return msg.channel.send(`Error: The API didn't return anything`);
			let data;
			try {
				data = JSON.parse(body);
			} catch (reason) { return msg.channel.send(`There was an error parsing the data:\n${reason}`); }
			return msg.channel.send(entities.decodeHTML(data.value.joke));
		});
	}


	else if (cmd == "yomamma" || cmd == "yomama" || cmd == "ym") {
		request("http://api.yomomma.info/", function(err, res, body) {
			if (err) return msg.channel.send(`Error: The API didn't return anything`);
			let data;
			try {
				data = JSON.parse(body);
			} catch(reason) { return msg.channel.send(`There was an error parsing the data:\n${reason}`); }
			return msg.channel.send(data.joke);
		});
	}


	else if (cmd == "yesno" || cmd == "yn") {
		let array = ["yes", "no"];
		let choice = array[Math.floor(Math.random() * array.length)];
		if (!suffix) return msg.channel.send(`${msg.author.username}, you didn't ask a question`);
		return msg.channel.send(`I'd have to say ${choice}, ${msg.author.username}`);
	}


	else if (cmd == "8ball" || cmd == "ball") {
		let array = ["The stars have fortold.", "The prophecy has told true.", "Absolutely", "Answer Unclear Ask Later", "Cannot Foretell Now", "Can't Say Now", "Chances Aren't Good", "Consult Me Later", "Don't Bet On It", "Focus And Ask Again", "Indications Say Yes", "Looks Like Yes", "No", "No Doubt About It", "Positively", "Prospect Good", "So It Shall Be", "The Stars Say No", "Unlikely", "Very Likely", "Yes", "You Can Count On It", "As I See It Yes", "Ask Again Later", "Better Not Tell You Now", "Cannot Predict Now", "Concentrate and Ask Again", "Don't Count On It", "It Is Certain", "It Is Decidedly So", "Most Likely", "My Reply Is No", "My Sources Say No", "Outlook Good", "Outlook Not So Good", "Reply Hazy Try Again", "Signs Point to Yes", "Very Doubtful", "Without A Doubt", "Yes", "Yes - Definitely", "You May Rely On It", "Ask Me If I Care", "Dumb Question Ask Another", "Forget About It", "Not A Chance", "Obviously", "Well Maybe", "What Do You Think?", "Whatever"];
		let choice = array[Math.floor(Math.random() * array.length)];
		if (!suffix) return msg.channel.send(`${msg.author.username}, you didn't ask the 8ball a question`);
		return msg.channel.send(`${choice}, ${msg.author.username}`);
	}


	else if (cmd == "rate") {
		let randNum = Math.floor(Math.random() * (100 - 1) + 1);
		let esuffix;
		if (suffix.match(/(\W|^)you(\W|$)/i)) esuffix = suffix.replace(/(?:\W|^)(you)(?:\W|$)/ig, "me ");
		else if (suffix.match(/(\W|^)me(\W|$)/i)) esuffix = suffix.replace(/(?:\W|^)(me)(?:\W|$)/ig, "you ");
		else esuffix = suffix;
		return msg.channel.send(`<:SuperThink:400184748649218058> I'd rate ${esuffix} a(n) ${randNum}/100`);
	}


	else if (cmd == "cat") {
		msg.channel.send("<a:CatLoading:426263491385622539>").then(nmsg => {
			request("https://api.chewey-bot.ga/cat", function(err, res, body) {
				if (err) return nmsg.edit(`Error... API returned nothing`);
				let data;
				try {
					data = JSON.parse(body);
				} catch (error) { return nmsg.edit(`Uh oh. There was an error while requesting an image of a cat...\n${error}`); }
				let embed = new Discord.RichEmbed()
					.setImage(data.data)
					.setColor('36393E')
					.setFooter("Powered by api.chewey-bot.ga")
				return nmsg.edit({embed});
			});
		});
	}


	else if (cmd == "dog") {
		msg.channel.send("<a:CatLoading:426263491385622539>").then(nmsg => {
			request("https://api.chewey-bot.ga/dog", function(err, res, body) {
				if (err) return nmsg.edit("Error. The API returned nothing...");
				let data;
				try {
					data = JSON.parse(body);
				} catch (error) { return nmsg.edit(`Error while requesting an image of a dog.\n${error}`); }
				let embed = new Discord.RichEmbed()
					.setImage(data.data)
					.setColor('36393E')
					.setFooter("Powered by api.chewey-bot.ga")
				return nmsg.edit({embed});
			});
		});
	}


	else if (cmd == "space") {
		msg.channel.send("<a:SpaceLoading:429061691633041419>").then(nmsg => {
			request("https://api.chewey-bot.ga/space", function(err, res, body) {
				if (err) return nmsg.edit("Error... API returned nothing");
				let data;
				try {
					data = JSON.parse(body);
				} catch (error) { return nmsg.edit(`Error while requesting a space image\n${error}`); }
				let embed = new Discord.RichEmbed()
					.setImage(data.data)
					.setColor('36393E')
					.setFooter("Powered by api.chewey-bot.ga")
				return nmsg.edit({embed});
			});
		});
	}


	else if (cmd == "snake" || cmd == "snek") {
		request("https://api.chewey-bot.ga/snake", function(err, res, body) {
			if (err) return msg.channel.send(`There was an error:\n${err}`);
			let data;
			try {
				data = JSON.parse(body);
			} catch (error) { return msg.channel.send(`Error while requesting an image of a snek\n${error}`); }
			let embed = new Discord.RichEmbed()
				.setImage(data.data)
				.setColor('36393E')
				.setFooter("Powered by api.chewey-bot.ga")
			msg.channel.send({embed});
		});
	}


	else if (cmd == "bird" || cmd == "birb") {
		request("https://api.chewey-bot.ga/birb", function(err, res, body) {
			if (err) return msg.channel.send(`There was an error:\n${err}`);
			let data;
			try {
				data = JSON.parse(body);
			} catch (error) { return msg.channel.send(`Error while requesting an image of a snek\n${error}`); }
			let embed = new Discord.RichEmbed()
				.setImage(data.data)
				.setColor('36393E')
				.setFooter("Powered by api.chewey-bot.ga")
			msg.channel.send({embed});
		});
	}


	else if (cmd == "neko") {
		msg.channel.send("<a:NekoSway:461420549990776832>").then(nmsg => {
			request("https://nekos.life/api/v2/img/neko", function(err, res, body) {
				if (err) return nmsg.edit(`There was an error:\n${err}`);
				let data;
				try {
					data = JSON.parse(body);
				} catch (error) { return nmsg.edit(`Error while requesting an image of a neko\n${error}`); }
				let embed = new Discord.RichEmbed()
					.setImage(data.url)
					.setColor('36393E')
					.setFooter("Powered by nekos.life")
				return nmsg.edit({embed});
			});
		});
	}


	else if (cmd == "meme") {
		let array = ["dankmemes", "meirl", "2meirl4meirl", "animemes", "sbubby", "fellowkids", "bertstrips", "2healthbars", "coaxedintoasnafu", "bossfight"];
		let choice = array[Math.floor(Math.random() * array.length)];
		request({ url: `https://api.reddit.com/r/${choice}/random`, headers: { "User-Agent": "Amanda" } }, function(err, res, body) {
			if (err) return msg.channel.send(`There was an error:\n${err}`);
			let data;
			try {
				data = JSON.parse(body);
			} catch (error) { return msg.channel.send(`Error while requesting a meme\n${error}`); }
			let embed = new Discord.RichEmbed()
				.setImage(data[0].data.children[0].data.preview?data[0].data.children[0].data.preview.images[0].source.url: "https://i2.wp.com/www.funnygrins.com/main/wp-content/uploads/2011/03/404Death.png")
				.setColor('36393E')
				.setFooter(`r/${choice}`)
			return msg.channel.send({embed});
		});
	}


	else if (cmd == "urban") {
		let req = undefined;
		if (msg.channel.type == "dm") req = true;
		else if (msg.channel.nsfw) req = true;
		else req = false;
		if (!req) return msg.channel.send(`Due to abuse and bot listing rules, this command is only allowed in nsfw channels`);
		if (!suffix) return msg.channel.send("No search terms provided");
		let body = await rp(`http://api.urbandictionary.com/v0/define?term=${suffix}`);
		try {
			let data = JSON.parse(body);
			if (data.result_type == "no_results") return msg.channel.send(`${msg.author.username}, those are invalid search terms`);
			let embed = new Discord.RichEmbed()
				.setAuthor(data.list[0].word || suffix)
				.addField("Definition:", (data.list[0].definition || "Not available").slice(0, 1024))
				.addField("Example:", (data.list[0].example || "Not available").slice(0, 1024))
				.setColor("36393E");
			return msg.channel.send({embed});
		} catch (error) { return msg.channel.send(`Error while requesting the definition\n${error}`); }
	}


	// Trivia doesn't work. Tested it with this new rewrite
	/* else if (cmd == "trivia" || cmd == "t") {
		if (suffix.toLowerCase() == "play" || suffix.toLowerCase() == "p") {
			doQuestion(msg);
		} else if (suffix.toLowerCase() == "categories") {
			https.get("https://opentdb.com/api_category.php", (res) => {
				res.once('data', function(data) {
					let json;
					try {
						json = JSON.parse(data.toString());
					} catch (error) { return msg.channel.send(`An error occurred while attempting to query the trivia category list\n${error}`); }
					let categories = "**Categories:** ";
					let i = 0;
					for(i in json.trivia_categories) categories = categories + "\n" + json.trivia_categories[i].name;
					let str = "A list has been sent to you via DM.";
					if(msg.channel.type == 'dm') str = "";
					msg.author.send(categories).catch(err => {
						str = "Unable to send you the list because you cannot receive DMs.";
						if(err != "DiscordAPIError: Cannot send messages to this user") console.log(err);
					}).then(() => {
						i++;
						msg.channel.send(`There are ${i} categories. ${str}`);
					});
				});
			}).once('error', err => { msg.channel.send("Failed to query category list."); });
		} else { return msg.channel.send(`${msg.author.username}, that's not a valid action to do`); }
	}

	function newGame() {
	return {
		running: true,
		answers: {},
		correctID: null,
		answer: null
	}
}

	function doQuestion(msg, authorName) {
		let id = msg.channel.id;
		if (!authorName) authorName = msg.author.username;
		if (games[id]) return msg.channel.send(`${authorName}, there's a game already in progress for this channel`);
		let game = newGame();
		games[id] = game;
		require("request")("https://opentdb.com/api.php?amount=1", function(err, res, body) {
			let data;
			try {
				data = JSON.parse(body);
			} catch (error) {
				const embed = new Discord.RichEmbed()
					.setDescription(`There was an error parsing the data returned by the api\n${error}`)
					.setColor(14164000)
				msg.channel.send({embed});
				return delete games[id];
			}
			if (data.response_code != 0) {
				msg.channel.send(`There was an error from the api`);
				return delete games[id];
			}
			let answer = data.results[0].correct_answer;
			game.answer = answer;
			let choices = data.results[0].incorrect_answers;
			choices.push(answer);
			let shuffled = choices.shuffle();
			let iOfA = shuffled.indexOf(answer);
			game.correctID = String.fromCharCode(iOfA+97);
			if (!game.correctID) {
				msg.channel.send(`Fuckery happened\n\nIndex of the answer: ${iOfA}\nShuffled Answer Array: ${shuffled}`);
				return delete games[id];
			}
			let [a1, a2, a3, a4] = shuffled;
			let color = 3447003;
			let reward = 10;
			let difficulty = undefined;
				switch(data.results[0].difficulty) {
					case "easy":
						color = 4249664;
						reward = 100;
						difficulty = "easy";
						break;
					case "medium":
						color = 12632064;
						reward = 250;
						difficulty = "medium";
						break;
					case "hard":
						color = 14164000;
						reward = 500;
						difficulty = "hard";
						break;
				}
				let str = `A: *${a1}*\nB: *${a2}*`;
				if (a3 && a4) str += `\nC: *${a3}*\nD: *${a4}*`;
				let guessembed = new Discord.RichEmbed()
					.setDescription(entities.decodeHTML(`**${data.results[0].category}** (${difficulty})\n${data.results[0].question}\n${str}`))
					.setColor(color)
				msg.channel.send(guessembed).then(msg => {
				let collector = msg.channel.createMessageCollector((m => {
					if (m.author.bot) return;
					let game = games[m.channel.id];
					if (!game) return;
					if (letters.includes(m.content.toLowerCase())) {
						game.answers[m.author.id] = m.content.toLowerCase();
					}
				}), { time: 20000 });
				collector.next.then(async msg => {
					let correctUsersStr = "";
					if (game == undefined || game.running == false) return;
					correctUsersStr = `**Correct Answers:**\n`;
					let correct = Object.keys(game.answers).filter(k => game.correctID == game.answers[k]);
					if (correct.length == 0) {
						correctUsersStr = "Nobody got the answer right.";
					} else {
						if (correct.length > 6) {
							correct.forEach(async function(item, index, array) {
								correctUsersStr += `${client.users.get(item) ? client.users.get(item).username : item}, `;
								let row = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, item);
								if (!row) {
									await utils.sql.all(`INSERT INTO money (userID, coins) VALUES (?, ?)`, [item, 5000]);
									row = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, item);
								}
								await utils.sql.all(`UPDATE money SET coins =? WHERE userID =?`, [row.coins + reward, item]);
								let user = await client.users.get(item)
								user.send(`You recieved ${reward} coins for guessing correctly on trivia`).catch(() => msg.channel.send(`**${user.tag}**, please enable DMs so I can tell you your earnings`));
							});
						} else {
							correct.forEach(async function(item, index, array) {
								correctUsersStr += `${client.users.get(item) ? client.users.get(item).username : item}\n`;
								let row = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, item);
								if (!row) {
									await utils.sql.all(`INSERT INTO money (userID, coins) VALUES (?, ?)`, [item, 5000]);
									row = await utils.sql.get(`SELECT * FROM money WHERE userID =?`, item);
								}
								await utils.sql.get(`UPDATE money SET coins =? WHERE userID =?`, [row.coins + reward, item]);
								let user = await client.users.get(item)
								user.send(`You recieved ${reward} coins for guessing correctly on trivia`).catch(() => msg.channel.send(`**${user.tag}**, please enable DMs so I can tell you your earnings`));
							});
						}
					}
					let resultembed = new Discord.RichEmbed()
						.setDescription(entities.decodeHTML(`**${game.correctID.toUpperCase()}:** ${game.answer}\n\n${correctUsersStr}`))
						.setColor(color)
						.setFooter(`Click the reaction for another round.`)
					msg.channel.send(resultembed).then(msg => {
						msg.reactionMenu([{ emoji: client.emojis.get("362741439211503616"), ignore: "total", actionType: "js", actionData: (msg, emoji, user) => { doQuestion(msg, user.username); }}]);
					});
					return delete games[id];
				});
			});
		});
	} */
}