const fs = require("fs");
const pj = require("path").join;
const http = require("http");
const WebSocket = require("ws");
const router = require("./router.js");

const commandDirs = ["modules", "commands"];
let watched = [];

module.exports = passthrough => new Promise((resolve, reject) => {
	let { config, utils } = passthrough;

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
		passthrough.db = pool;


		for (let dir of commandDirs) {
			fs.readdir(dir, (err, files) => {
				files.filter(f => f.endsWith(".js")).forEach(f => {
					let filename = pj(__dirname, dir, f);
					loadFile(filename);
				});
			});
		}
	
		function loadFile(filename) {
			if (!watched.includes(filename)) {
				watched.push(filename);
				fs.watchFile(filename, { interval: 2018 }, () => { loadFile(filename); });
			}
			try {
				router.emit(filename);
				delete require.cache[require.resolve(filename)];
				let result = require(filename);
				if (typeof(result) == "function") result(passthrough);
				else result;
				console.log(`Loaded ${filename}`);
			} catch (e) { console.log(`Failed to load ${filename} with error:\n${e.stack}`); }
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
	
		let wss = new WebSocket.Server({server});
		wss.on("connection", ws => {
			if (utils.ws) utils.ws(ws);
		});

		resolve()
	}).catch(err => {
		console.log("Failed to connect to database\n", err);
		reject();
	});
});