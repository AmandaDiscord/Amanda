const pluginsDir = "plugins";
const fs = require("fs");
const pj = require("path").join;

let watched = [];

module.exports = (passthrough, callback) => {
	function loadFile(filename) {
		if (!watched.includes(filename)) {
			watched.push(filename);
			fs.watchFile(filename, {interval: 2018}, () => {
				loadFile(filename);
			});
		}
		try {
			console.log("Loaded "+filename);
			delete require.cache[require.resolve(filename)];
			passthrough.reloadEvent.emit(filename);
			let result = require(filename);
			if (typeof(result) == "function") {
				setImmediate(() => {
					callback(result(passthrough));
				});
			} else if (typeof(result) == "object") {
				Object.assign(passthrough.utils, result);
			}
		} catch (e) {
				console.log("Failed to reload module "+filename+"\n"+e.stack);
		}
	}
	fs.readdir(pluginsDir, (err, files) => {
		files.filter(f => f.endsWith(".js")).forEach(f => {
			let filename = pj(__dirname, pluginsDir, f);
			loadFile(filename);
		});
	});
}
