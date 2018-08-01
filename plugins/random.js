const entities = require("entities");
const request = require("request");

module.exports = function(passthrough) {
	const { Discord, client } = passthrough;
	return {
		"randnumber": {
			usage: "<min #> <max #>",
			description: "Generates a random number from a given data range.",
			aliases: ["randnumber", "randnum", "rn"],
			category: "fun",
			process: function(msg, suffix) {
				let args = suffix.split(' ');
				let min = Math.floor(parseInt(args[0]));
				let max = Math.floor(parseInt(args[1]));
				if (!min) return msg.channel.send("Please provide a minimum number and a maximum number");
				if (!max) return msg.channel.send("Please provide a maximum number");
				if (isNaN(min)) return msg.channel.send(`${msg.author.username}, the minimum value you provided is not a number`);
				if (isNaN(max)) return msg.channel.send(`${msg.author.username}, the maximum value you provided is not a number`);
				msg.channel.send(`${Math.floor(Math.random() * (max - min) + min)}, ${msg.author.username}`)
			}
		},

		"chucknorris": {
			usage: "",
			description: "Gives a random Chuck Norris joke",
			aliases: ["chucknorris", "norris", "cn"],
			category: "fun",
			process: function(msg, suffix) {
				request("http://api.icndb.com/jokes/random", function(err, res, body) {
					if (err) return msg.channel.send(`Error: The API didn't return anything`);
					let data;
					try {
						data = JSON.parse(body);
					} catch (reason) {
						msg.channel.send(`There was an error parsing the data:\n${reason}`);
					}
					msg.channel.send(entities.decodeHTML(data.value.joke));
				});
			}
		},

		"yomamma": {
			usage: "",
			description: "Gets a random yo mamma joke",
			aliases: ["yomamma", "yomama", "ym"],
			category: "fun",
			process: function(msg, suffix) {
				request("http://api.yomomma.info/", function(err, res, body) {
					if (err) return msg.channel.send(`Error: The API didn't return anything`);
					let data;
					try {
						data = JSON.parse(body);
					} catch(reason) {
						msg.channel.send(`There was an error parsing the data:\n${reason}`);
					}
					msg.channel.send(data.joke);
				});
			}
		},

		"yesno": {
			usage: "<question>",
			description: "Says yes or no about something",
			aliases: ["yesno", "yn"],
			category: "fun",
			process: async function(msg, suffix) {
				let array = ["yes", "no"];
				let choice = array[Math.floor(Math.random() * array.length)];
				if (!suffix) return msg.channel.send(`${msg.author.username}, you didn't ask a question`);
				msg.channel.send(`I'd have to say ${choice}, ${msg.author.username}`);
			}
		},

		"8ball": {
			usage: "<question>",
			description: "Asks the 8ball a question",
			aliases: ["8ball", "ball"],
			category: "fun",
			process: async function(msg, suffix) {
				let array = ["The stars have fortold.", "The prophecy has told true.", "Absolutely", "Answer Unclear Ask Later", "Cannot Foretell Now", "Can't Say Now", "Chances Aren't Good", "Consult Me Later", "Don't Bet On It", "Focus And Ask Again", "Indications Say Yes", "Looks Like Yes", "No", "No Doubt About It", "Positively", "Prospect Good", "So It Shall Be", "The Stars Say No", "Unlikely", "Very Likely", "Yes", "You Can Count On It", "As I See It Yes", "Ask Again Later", "Better Not Tell You Now", "Cannot Predict Now", "Concentrate and Ask Again", "Don't Count On It", "It Is Certain", "It Is Decidedly So", "Most Likely", "My Reply Is No", "My Sources Say No", "Outlook Good", "Outlook Not So Good", "Reply Hazy Try Again", "Signs Point to Yes", "Very Doubtful", "Without A Doubt", "Yes", "Yes - Definitely", "You May Rely On It", "Ask Me If I Care", "Dumb Question Ask Another", "Forget About It", "Not A Chance", "Obviously", "Well Maybe", "What Do You Think?", "Whatever"];
				let choice = array[Math.floor(Math.random() * array.length)];
				if (!suffix) return msg.channel.send(`${msg.author.username}, you didn't ask the 8ball a question`);
				msg.channel.send(`${choice}, ${msg.author.username}`);
			}
		},

		"rate": {
			usage: "<Thing to rate>",
			description: "Rates something",
			aliases: ["rate"],
			category: "fun",
			process: function(msg, suffix) {
				let randNum = Math.floor(Math.random() * (100 - 1) + 1);
				let esuffix;
				if (suffix.match(/(\W|^)you(\W|$)/i)) esuffix = suffix.replace(/(?:\W|^)(you)(?:\W|$)/ig, "me ");
				else if (suffix.match(/(\W|^)me(\W|$)/i)) esuffix = suffix.replace(/(?:\W|^)(me)(?:\W|$)/ig, "you ");
				else esuffix = suffix;
				msg.channel.send(`<:SuperThink:400184748649218058> I'd rate ${esuffix} a(n) ${randNum}/100`);
			}
		}
	}
}
