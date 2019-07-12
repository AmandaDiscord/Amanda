const Discord = require("discord.js");
const path = require("path");
const repl = require("repl");
const util = require("util");

require("../types.js");

/**
 * @param {PassthroughType} passthrough
 */
module.exports = function(passthrough) {
	let { config, client, commands, db, reloader, reloadEvent, reactionMenus, queueManager } = passthrough;

	let utils = require("../modules/utilities.js")(passthrough);
	reloader.useSync("./modules/utilities.js", utils);

	let lang = require("../modules/lang.js")(passthrough);
	reloader.useSync("./modules/lang.js", lang);

	async function customEval(input, context, filename, callback) {
		let depth = 0;
		if (input == "exit\n") return process.exit();
		if (input.startsWith(":")) {
			let [depthOverwrite, command] = input.split(" ");
			depth = +depthOverwrite.slice(1);
			input = command;
		}
		let result = await eval(input);
		let output = util.inspect(result, false, depth, true);
		return callback(undefined, output);
	}
	
	reloadEvent.once(path.basename(__filename), () => {
		process.exit();
	});
	
	client.once("prefixes", () => {
		let cli = repl.start({prompt: "> ", eval: customEval, writer: s => s});

		Object.assign(cli.context, passthrough, {Discord});
		
		cli.on("exit", () => process.exit());
	});
}