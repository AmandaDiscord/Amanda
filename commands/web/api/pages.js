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
		},
		{
			route: "/images/back-tg.svg", methods: ["GET"], code: async ({params}) => {
				let file = await util.promisify(fs.readFile)(pj(__dirname, "../html/images/back.svg"), {encoding: null});
				extra.trackImageUsage(params.d);
				let headers = {};
				if (params.c == 1) headers["Cache-Control"] = "public, max-age=7200";
				else headers["Cache-Control"] = "";
				return {
					statusCode: 200,
					contentType: "image/svg+xml",
					content: file,
					headers: headers
				}
			}
		},
		{
			route: "/apple-touch-icon.png", methods: ["GET"], code: async () => {
				return {
					statusCode: 301,
					contentType: "text/html",
					content: "",
					headers: {
						"Location": "/images/apple-touch-icon.png"
					}
				}
			}
		}
	]
}