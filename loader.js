const fs = require("fs");
const pj = require("path").join;
const router = require("./router.js");

const dir = "commands";
let watched = [];

module.exports = function(passthrough) {
	let { config, utils } = passthrough;

	try {
		require("./modules/help.js");
		require("./modules/events.js")(passthrough);
		require("./modules/util.js")(passthrough);
	} catch (e) { console.log(`Failed to load a module with error:\n${e.stack}`) }

	fs.readdir(dir, (err, files) => {
		files.filter(f => f.endsWith(".js")).forEach(f => {
			let filename = pj(__dirname, dir, f);
			loadFile(filename);
		});
	});

	function loadFile(filename) {
		if (!watched.includes(filename)) {
			watched.push(filename);
			fs.watchFile(filename, { interval: 2018 }, () => { loadFile(filename); });
		}
		try {
			router.emit(filename);
			delete require.cache[require.resolve(filename)];
			require(filename);
			console.log(`Loaded ${filename}`);
		} catch (e) { console.log(`Failed to load command ${filename} with error:\n${e.stack}`); }
	}
}