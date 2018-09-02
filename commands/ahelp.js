let router = require("../router.js");
let help_info = {
	"help": {
		description: "Your average help command",
		arguments: "<command>",
		aliases: ["help", "h"],
		category: ["help"]
	},
	"commands": {
		description: "Displays all of the commands in a category",
		arguments: "<category>",
		aliases: ["commands", "cmds"],
		category: ["help"]
	}
}
let commands = {};

router.on("help", managehelp);
router.emit("help", help_info);
router.on("command", file_help);
router.once(__filename, () => {
	router.removeListener("help", managehelp);
	router.removeListener("command", file_help);
});
async function file_help(passthrough) {
	let { Discord, client, msg, cmd, suffix } = passthrough;

	if (cmd == "help" || cmd == "h") {
		let embed;
		if (suffix) {
			let args = suffix.split(" ");
			let command = Object.values(commands).find(c => c.aliases.includes(args[0]));
			if (command) {
				embed = new Discord.RichEmbed().addField(`Help for ${command.aliases[0]}`, `Arguments: ${command.arguments}\nDescription: ${command.description}\nAliases: [${command.aliases.join(", ")}]\nCategory: ${command.category.join("/")}`).setColor('36393E');
				return msg.channel.send({embed});
			} else {
				embed = new Discord.RichEmbed().setDescription(`**${msg.author.tag}**, I couldn't find the help panel for that command`).setColor("B60000");
				return msg.channel.send({embed});
			}
		} else {
			let all = Object.values(commands).map(c => c.category[0]);
			let filter = (value, index, self) => { return self.indexOf(value) == index; };
			let cats = all.filter(filter).sort();
			embed = new Discord.RichEmbed().setAuthor("Command Categories").setDescription(`❯ ${cats.join("\n❯ ")}\n\n𝓲 - typing \`&cmds <category>\` will show all cmds in that category`).setFooter("Amanda help panel", client.user.smallAvatarURL).setColor('36393E');
			try {
				await msg.author.send({embed});
				if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
			} catch (reason) { return msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`); }
		}
	}

	else if (cmd == "commands" || cmd == "cmds") {
		if (!suffix) return msg.channel.send(`${msg.author.username}, you must provide a command category as an argument`);
		let cat = Object.values(commands).filter(c => c.category[0] == suffix.toLowerCase());
		let embed;
		if (suffix.toLowerCase() == "music") {
			embed = new Discord.RichEmbed()
				.setAuthor("&music: command help [music, m]")
				.addField(`play`, `Play a song or add it to the end of the queue. Use any YouTube video or playlist url or video name as an argument.\n\`&music play https://youtube.com/watch?v=e53GDo-wnSs\` or\n\`&music play despacito 2\``)
				.addField(`insert`, `Works the same as play, but inserts the song at the start of the queue instead of at the end.\n\`&music insert https://youtube.com/watch?v=e53GDo-wnSs\``)
				.addField(`now`, `Show the current song.\n\`&music now\``)
				.addField(`related [play|insert] [index]`,
					"Show videos related to what's currently playing. Specify either `play` or `insert` and an index number to queue that song.\n"+
					"`&music related` (shows related songs)\n"+
					"`&music rel play 8` (adds related song #8 to the end of the queue)")
				.addField(`queue`, `Shows the current queue.\n\`&music queue\``)
				.addField(`shuffle`, `Shuffle the queue. Does not affect the current song.\n\`&music shuffle\``)
				.addField(`skip`, `Skip the current song and move to the next item in the queue.\n\`&music skip\``)
				.addField(`stop`, `Empty the queue and leave the voice channel.\n\`&music stop\``)
				.addField(`volume <amount>`, `Set the music volume. Must be a whole number from 0 to 5. Default volume is 5.\n\`&music volume 3\``)
				.addField(`playlist`, `Manage playlists. Try \`&cmds playlist\` for more info.`)
				.setColor('36393E')
				try {
					await msg.author.send({embed});
					if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
					return;
				} catch (reason) { return msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`); }
		}
		if (suffix.toLowerCase() == "playlist") {
			embed = new Discord.RichEmbed()
				.setAuthor(`&music playlist: command help`)
				.setDescription("All playlist commands begin with `&music playlist` followed by the name of a playlist. "+
					"If the playlist name does not exist, you will be asked if you would like to create a new playlist with that name.\n"+
					"Note that using `add`, `remove`, `move` and `import` require you to be the owner (creator) of a playlist.")
				.addField("play [start] [end]", "Play a playlist.\n"+
					"Optionally, specify values for start and end to play specific songs from a playlist. "+
					"Start and end are item index numbers, but you can also use `-` to specify all songs towards the list boundary.\n"+
					"`&music playlist xi play` (plays the entire playlist named `xi`)\n"+
					"`&music playlist xi play 32` (plays item #32 from the playlist)\n"+
					"`&music playlist xi play 3 6` (plays items #3, #4, #5 and #6 from the playlist)\n"+
					"`&music playlist xi play 20 -` (plays all items from #20 to the end of the playlist)")
				.addField("shuffle [start] [end]", "Play the songs from a playlist in a random order. Works exactly like `play`.\n`&music playlist xi shuffle`")
				.addField("add <url>", "Add a song to playlist. Specify a URL the same as `&music play`.\n"+
					"`&music playlist xi add https://youtube.com/watch?v=e53GDo-wnSs`")
				.addField("remove <index>", "Remove a song from a playlist.\n"+
					"`index` is the index of the item to be removed.\n"+
					"`&music playlist xi remove 12`")
				.addField("move <index1> <index2>", "Move items around within a playlist. "+
					"`index1` is the index of the item to be moved, `index2` is the index of the position it should be moved to.\n"+
					"The indexes themselves will not be swapped with each other. Instead, all items in between will be shifted up or down to make room. "+
					"If you don't understand what this means, try it out yourself.\n"+
					"`&music playlist xi move 12 13`")
				.addField("import <url>", "Import a playlist from YouTube into Amanda. `url` is a YouTube playlist URL.\n"+
					"`&music playlist undertale import https://www.youtube.com/playlist?list=PLpJl5XaLHtLX-pDk4kctGxtF4nq6BIyjg`")
				.setColor('36393E')
			try {
				await msg.author.send({embed});
				if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
				return;
			} catch (reason) { return msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`); }
		}
		if (!cat || cat.toString().length < 1 || suffix.toLowerCase() == "admin") {
			embed = new Discord.RichEmbed().setDescription(`**${msg.author.tag}**, It looks like there isn't anything here but the almighty hipnotoad`).setColor('36393E')
			return msg.channel.send({embed});
		}

		let str = cat.map(c => `${c.aliases[0]}    [${c.aliases.join(", ")}]`).sort().join("\n");
		embed = new Discord.RichEmbed().setAuthor(`${suffix.toLowerCase()} command list`).setTitle("command    [aliases]").setDescription(str).setColor("36393E")
		try {
			await msg.author.send({embed});
			if (msg.channel.type != "dm") msg.channel.send(`${msg.author.username}, a DM has been sent!`);
			return;
		} catch (reason) { return msg.channel.send(`${msg.author.username}, you must allow me to DM you for this command to work.`); }
	}
};
function managehelp(info) { Object.assign(commands, info); };