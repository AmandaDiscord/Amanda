const fs = require("fs");
const path = require("path");
const mime = require("mime");
const cf = require("./web/util/common.js");

const globalHeaders = {};
const apiDir = "web/api";

const webHandlers = fs.readdirSync(path.join(__dirname, apiDir)).map(f => path.join(apiDir, f));
const pageHandlers = [
	{web: "/", local: "index.html"},
	{web: "/dash", local: "dash/index.html"},
	{web: "/dash/login", local: "dash/login.html"},
	{web: "/dash/servers/[0-9]+", local: "dash/server.html"}
];
const cacheControl = [
	"ttf", "png", "jpg", "svg"
];

function mimeType(type) {
	const types = {
		"ttf": "application/font-sfnt"
	};
	return types[type.split(".")[1]] || mime.getType(type);
}

function toRange(data, req) {
	let range = "";
	if (req.headers.range && req.headers.range.startsWith("bytes")) {
		range = req.headers.range.match(/^bytes=(.*)$/)[1];
	}
	let rangeStart = range.split("-")[0] || 0;
	let rangeEnd = range.split("-")[1] || data.length-1;
	let statusCode = range ? 206 : 200;
	let headers = range ? {"Accept-Ranges": "bytes", "Content-Range": "bytes "+rangeStart+"-"+rangeEnd+"/"+data.length} : {};
	let result;
	if (!range) result = data;
	else if (range.match(/\d-\d/)) result = data.slice(range.split("-")[0]);
	else if (range.match(/\d-$/)) result = data.slice(range.split("-")[0]);
	else if (range.match(/^-\d/)) result = data.slice(0, range.split("-")[1]);
	else result = data;
	return {result, headers, statusCode};
}

async function resolveTemplates(page) {
	let promises = [];
	let template;
	let regex = /<!-- TEMPLATE (\S+?) -->/g;
	while (template = regex.exec(page)) {
		let templateName = template[1];
		promises.push(new Promise(resolve => {
			fs.readFile(path.join(__dirname, "web/templates", templateName+".html"), {encoding: "utf8"}, (err, content) => {
				if (err) resolve(undefined);
				else resolve({template: templateName, content: content});
			});
		}));
	}
	let results = await Promise.all(promises);
	results.filter(r => r).forEach(result => {
		page = page.replace("<!-- TEMPLATE "+result.template+" -->", result.content);
	});
	return page;
}

module.exports = function(passthrough) {
	const { client, utils } = passthrough;

	let routeHandlers = [];
	delete require.cache[require.resolve("./web/util/extra.js")];
	passthrough.resolveTemplates = resolveTemplates;
	const extra = require("./web/util/extra.js")(passthrough);
	passthrough.extra = extra;
	webHandlers.forEach(h => {
		delete require.cache[require.resolve(path.join(__dirname, h))];
		routeHandlers.push(...require(path.join(__dirname, h))(passthrough));
	});
	console.log(`Loaded ${webHandlers.length} web API modules`);

	utils.server = function(req, res) {
		req.gmethod = req.method == "HEAD" ? "GET" : req.method;
		let headers = {};
		if (cacheControl.includes(req.url.split(".")[1])) headers["Cache-Control"] = "max-age=604800, public";
		//console.log(">>> "+req.url+" "+req["user-agent"]);
		while (req.url.match(/%[0-9A-Fa-f]{2}/)) {
			req.url = req.url.replace(/%[0-9A-Fa-f]{2}/, Buffer.from(req.url.match(/%([0-9A-Fa-f]{2})/)[1], "hex").toString("utf8"));
		}
		let [reqPath, paramString] = req.url.split("?");
		if (reqPath.length > 5) reqPath = reqPath.replace(/\/+$/, "");
		let params = {};
		if (paramString) paramString.split("&").forEach(p => {
			let [key, value] = p.split("=");
			params[key] = value;
		});
		// Attempt to use routeHandlers first
		let foundRoute = routeHandlers.find(h => {
			let rr = new RegExp("^"+h.route+"$");
			let match = reqPath.match(rr);
			if (match && h.methods.includes(req.gmethod)) {
				new Promise(resolve => {
					let fill = match.slice(1);
					if (req.method == "POST" || req.method == "PATCH") {
						let buffers = [];
						req.on("data", (chunk) => {
							buffers.push(chunk);
						});
						req.on("end", (chunk) => {
							let body = Buffer.concat(buffers);
							let data = {};
							try {
								data = JSON.parse(body);
							} catch (e) {};
							h.code({req, reqPath, fill, params, body, data}).then(resolve);
						});
					} else {
						h.code({req, reqPath, fill, params}).then(resolve);
					}
				}).then(result => {
					if (result.constructor.name == "Array") {
						let newResult = {statusCode: result[0], content: result[1]};
						if (typeof(newResult.content) == "number") newResult.content = {code: newResult.content};
						result = newResult;
					}
					if (!result.contentType) result.contentType = (typeof(result.content) == "object" ? "application/json" : "text/plain");
					if (typeof(result.content) == "object" && ["Object", "Array"].includes(result.content.constructor.name)) result.content = JSON.stringify(result.content);
					if (!result.headers) result.headers = {};
					headers["Content-Length"] = Buffer.byteLength(result.content);
					cf.log("Using routeHandler "+h.route+" to respond to "+reqPath, "spam");
					res.writeHead(result.statusCode, Object.assign({"Content-Type": result.contentType}, headers, result.headers, globalHeaders));
					res.write(result.content);
					res.end();
				});
				return true;
			}
		});
		if (!foundRoute) {
			// If that fails, try pageHandlers
			foundRoute = pageHandlers.find(h => {
				let rr = new RegExp("^"+h.web+"$");
				let match = reqPath.match(rr);
				if (match) {
					fs.readFile(path.join(__dirname, "web/html", h.local), {encoding: "utf8"}, (err, page) => {
						resolveTemplates(page).then(page => {
							headers["Content-Length"] = Buffer.byteLength(page);
							cf.log("Using pageHandler "+h.web+" ("+h.local+") to respond to "+reqPath, "spam");
							res.writeHead(200, Object.assign({"Content-Type": mimeType(h.local)}, headers, globalHeaders));
							if (req.method == "HEAD") {
								res.end();
							} else {
								res.write(page, () => {
									res.end();
								});
							}
						});
					});
					return true;
				} else {
					return false;
				}
			});
			if (!foundRoute) {
				// If THAT fails, try reading the html directory for a matching file
				let filename = path.join(__dirname, "web/html", reqPath);
				fs.stat(filename, (err, stats) => {
					if (err || stats.isDirectory()) {
						cf.log("Couldn't handle request for "+reqPath, "warning");
						res.writeHead(404, Object.assign({"Content-Type": "text/plain"}, globalHeaders));
						res.write("404 Not Found");
						res.end();
						return;
					}
					//console.log(stats);
					if (stats.size < 5*10**6 || req.headers["Range"]) { //TODO: remove range check
						cf.log("Using file directly for "+reqPath+" (read)", "spam");
						fs.readFile(filename, {encoding: null}, (err, content) => {
							if (err) throw err;
							let ranged = toRange(content, req);
							headers["Content-Length"] = Buffer.byteLength(ranged.result);
							res.writeHead(ranged.statusCode, Object.assign({"Content-Type": mimeType(reqPath)}, ranged.headers, headers, globalHeaders));
							res.write(ranged.result);
							res.end();
						});
					} else {
						cf.log("Using file directly for "+reqPath+" (stream)", "spam");
						let stream = fs.createReadStream(filename);
						headers["Content-Length"] = stats.size;
						res.writeHead(200, Object.assign({"Content-Type": mimeType(reqPath)}, headers, globalHeaders));
						let resReady = true;
						stream.on("readable", () => {
							if (resReady) doRead();
							else {
								//console.log("(waiting for flush)");
								pending = true;
							}
						});
						function doRead() {
							let data = stream.read();
							if (data == null) return; //console.log("No data available");
							let flushed = res.write(data);
							//console.log("Wrote data: "+data.length);
							if (flushed) {
								//console.log("Flushed data automatically, will read again");
								doRead();
							} else {
								//console.log("Flushing data...");
								resReady = false;
								res.once("drain", () => {
									//console.log("Flushed data manually, will read again");
									resReady = true;
									doRead();
								});
							}
						}
						stream.on("end", () => {
							console.log("Stream ended.");
							res.end();
						});
					}
				});
			}
		}
	}

	return {};
}