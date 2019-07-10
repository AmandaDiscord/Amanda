//@ts-ignore
require("../../types.js")

let resultCache;

/** @param {PassthroughType} passthrough */
module.exports = passthrough => {
	let {client, reloader} = passthrough;

	let utils = require("../../modules/utilities.js")(passthrough);
	reloader.useSync("./modules/utilities.js", utils);

	let lang = require("../../modules/lang.js")(passthrough);
	reloader.useSync("./modules/lang.js", lang);

	if (!resultCache) {
		var common = {
			/**
			 * @param {Number} seconds
			 */
			prettySeconds: function(seconds) {
				if (isNaN(seconds)) return seconds;
				let minutes = Math.floor(seconds / 60);
				seconds = seconds % 60;
				let hours = Math.floor(minutes / 60);
				minutes = minutes % 60;
				let output = [];
				if (hours) {
					output.push(hours);
					output.push(minutes.toString().padStart(2, "0"));
				} else {
					output.push(minutes);
				}
				output.push(seconds.toString().padStart(2, "0"));
				return output.join(":");
			}
		}
		resultCache = common
	} else {
		var common = resultCache
	}

	return common
}