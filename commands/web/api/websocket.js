const WebSocket = require("ws");

module.exports = (passthrough) => {
	const {client, utils, extra, reloadEvent} = passthrough;

	function addTemporaryListener(eventEmitter, event, callback) {
		eventEmitter.on(event, callback);
		reloadEvent.once(__filename, () => eventEmitter.removeListener(event, callback));
	}

	utils.ws = function(ws) {
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

		function sendVoiceState(serverID, queue) {
			wssend({
				event: "voiceState",
				serverID: serverID,
				queue: queue
			});
		}

		function queuesToObject(queues) {
			let object = {};
			for (let key of queues.keys()) {
				let entry = queues.get(key);
				object[key] = queueToObject(entry);
			}
			return object;
		}

		function queueToObject(queue) {
			return {
				playing: queue.playing,
				skippable: queue.skippable,
				volume: queue.volume,
				time: queue.connection.dispatcher ? queue.connection.dispatcher.time : null,
				totalTime: queue.songs[0] ? queue.songs[0].video.length_seconds : null,
				songs: queue.songs.map(song => {
					let newSong = {};
					newSong.title = song.title;
					newSong.author = song.video.author.name;
					newSong.url = song.url;
					newSong.length_seconds = song.video.length_seconds;
					newSong.id = song.video.video_id;
					/*newSong.thumbnail_url = song.video.player_response.videoDetails.thumbnail.thumbnails
						.sort((a, b) => (Math.abs(180-a.height) - Math.abs(180-b.height)))[0].url;
					newSong.thumbnail_url_hq = song.video.player_response.videoDetails.thumbnail.thumbnails
						.sort((a, b) => (b.height - a.height))[0].url;*/
					return newSong;
				})
			};
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
				//TODO
				return disconnect();
			}
		});

		ws.on("error", console.log); //TODO

		addTemporaryListener(reloadEvent, "musicOut", musicOut);
		function musicOut(event) {
			if (event == "queues") {
				let queue = arguments[1].get(serverID);
				if (!queue) wssend({event: "queuesUpdate", queue: null});
				else wssend({event: "queuesUpdate", queue: queueToObject(queue)});
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
	}

	return [];
}