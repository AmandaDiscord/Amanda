const WebSocket = require("ws");

module.exports = (passthrough) => {
	const {client, utils, extra, reloadEvent} = passthrough;

	function addTemporaryListener(eventEmitter, event, callback) {
		eventEmitter.on(event, callback);
		reloadEvent.once(__filename, () => eventEmitter.removeListener(event, callback));
	}

	/*utils.ws = function(ws) {
		let token = "";
		let userID = "";
		let guilds = [];
		let serverID = "";

		function wssend(data) {
			let message = JSON.stringify(data);
			try {
				ws.send(message);
			} catch (e) {
				if (e.message.startsWith("WebSocket is not open")) {
					console.log("Caught error: WebSocket is not open.");
				} else throw e;
			}
		}

		ws.on("message", async function(body) {
			let data;
			try {
				data = JSON.parse(body);
				if (data.event != "login" && !token) { // Not logged in failsafe
					return disconnect();
				}
				switch (data.event) {
				case "login":
					if (!data.serverID) return disconnect();
					extra.checkTokenWS(data, ws, async userRow => {
						guilds = await extra.getMusicGuilds(userRow.userID, userRow.music);
						if (!guilds.some(g => g.id == data.serverID)) return disconnect();
						serverID = data.serverID;
						token = data.token;
						userID = userRow.userID;
						wssend({event: "loggedin", userID: userRow.userID});
						reloadEvent.emit("music", "getQueues");
					});
					break;
				}
			} catch (e) {
				return disconnect();
			}
		});

		ws.on("error", error => { //TODO
			console.error("WebSocket encountered an error!");
			console.error(error);
		});

		addTemporaryListener(reloadEvent, "musicOut", musicOut);
		function musicOut(event) {
			if (event == "queues") {
				let queue = arguments[1].get(serverID);
				if (!queue) wssend({event: "queuesUpdate", queue: null});
				else wssend({event: "queuesUpdate", queue: queue.toObject()});
			}
		}

		ws.once("close", () => {
			disconnect();
		});

		function disconnect() {
			if (![WebSocket.CLOSING, WebSocket.CLOSED].includes(ws.readyState)) ws.close();
			ws.removeAllListeners("message");
			reloadEvent.removeListener("musicOut", musicOut);
		}
	}*/

	return [];
}