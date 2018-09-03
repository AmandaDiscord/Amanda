const fs = require("fs");
const pj = require("path").join;
const util = require("util");

module.exports = (passthrough) => {
	const {client, utils, extra, reloadEvent, resolveTemplates} = passthrough;
	return [
		{
			route: "/about", methods: ["GET"], code: async () => {
				let page = await util.promisify(fs.readFile)(pj(__dirname, "../html/about.html"), {encoding: "utf8"});
				page = await resolveTemplates(page);
				let match = page.match(/<!-- user \d+ -->/g);
				if (match) {
					let promises = [];
					for (let string of match) {
						let userID = string.match(/\d+/)[0];
						promises.push(client.fetchUser(userID));
					}
					let users = await Promise.all(promises);
					page = page.replace(/<!-- user (\d+) -->/g, (string, userID) => users.find(u => u.id == userID).tag);
				}
				return {
					statusCode: 200,
					contentType: "text/html",
					content: page
				}
			}
		}
	]
}