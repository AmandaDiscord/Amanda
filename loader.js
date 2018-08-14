const fs = require("fs");
const pj = require("path").join;
const http = require("http");
const WebSocket = require("ws");

module.exports = function(passthrough) {
	let { Discord, client, config, utils, commands, reloadEvent } = passthrough;

	let mysql = require("mysql2/promise");
	let pool = mysql.createPool({
		host: "cadence.gq",
		user: "amanda",
		password: config.mysql_password,
		database: "money",
		connectionLimit: 5
	});
	pool.query("SELECT 1").then(() => {
		console.log("Connected to MySQL database");
	}).catch(err => {
		console.log("Failed to connect to database\n", err);
	});
	passthrough.db = pool;

	require("./modules/events.js")(passthrough);
	require("./modules/util.js")(passthrough);

	fs.readdir("commands", (err, files) => {
		files.filter(f => f.endsWith(".js")).forEach(f => {
			let filename = pj(__dirname, "commands", f);
			loadFile(filename);
		});
	});

	function loadFile(filename) {
		try {
			console.log(`Loaded ${filename}`);
			delete require.cache[require.resolve(filename)];
			let result = require(filename);
			setImmediate(() => { Object.assign(passthrough.commands, result(passthrough)); });
		} catch (e) { console.log("Failed to load module "+filename+"\n"+e.stack); }
	}

	let port = process.env.PORT || 8080;
	let server = http.createServer((req, res) => {
		if (utils.server) utils.server(req, res);
		else {
			res.writeHead(200, {"Content-Type": "text/plain"});
			res.end("Dashboard not initialised. Assign a function to utils.server to use it.");
		}
	});
	server.listen(port);
	
	let wss = new WebSocket.Server({ server });
	wss.on("connection", ws => { if (utils.ws) utils.ws(ws); });
}