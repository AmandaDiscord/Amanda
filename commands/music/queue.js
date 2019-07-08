require("../../types.js")

const Discord = require("discord.js");
const ytdl = require("ytdl-core");

/** @param {PassthroughType} passthrough */
module.exports = passthrough => {
	const {client, queueManager, reloader, reloadEvent} = passthrough

	let utils = require("../../modules/utilities.js")(passthrough);
	reloader.useSync("./modules/utilities.js", utils);

	let lang = require("../../modules/lang.js")(passthrough);
	reloader.useSync("./modules/lang.js", lang);

	let songTypes = require("./songtypes.js")(passthrough)
	reloader.useSync("./commands/music/songtypes.js", songTypes)

	/**
	 * @param {Number} seconds
	 */
	function prettySeconds(seconds) {
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
	
	/**
	 * @param {Discord.StreamDispatcher} dispatcher
	 * @param {queueFile.Queue} queue
	 * @param {Boolean} done
	 * @returns {String}
	 */
	function songProgress(dispatcher, queue, done) {
		if (!queue.songs.length) return "0:00/0:00";
		if (queue.songs[0].source == "YouTube") { //TODO: move this to the song object
			let max = queue.songs[0].basic.length_seconds;
			let current = Math.floor(dispatcher.time/1000);
			if (current > max || done) current = max;
			return `\`[ ${prettySeconds(current)} ${utils.progressBar(35, current, max, dispatcher.paused ? " [PAUSED] " : "")} ${prettySeconds(max)} ]\``;
		} else if (queue.songs[0].source == "Frisky") {
			let current = Math.floor(dispatcher.time/1000);
			return `\`[ ${prettySeconds(current)} ${"=".repeat(35)} LIVE ]\``;
		} else {
			return "Cannot render progress for source `"+queue.songs[0].source+"`.";
		}
	}
	class Queue {
		/**
		 * @param {Discord.TextChannel} textChannel
		 * @param {Discord.VoiceChannel} voiceChannel
		 * @constructor
		 */
		constructor(textChannel, voiceChannel) {
			this.textChannel = textChannel;
			this._voiceChannel = voiceChannel;
			this.id = this.textChannel.guild.id;
			this.connection = undefined;
			/**
			 * @type {Discord.StreamDispatcher}
			 */
			this._dispatcher = undefined;
			/**
			 * @type {Set<String>}
			 */
			this.playedSongs = new Set();
			/**
			 * @type {Array<Song>}
			 */
			this.songs = [];
			this.playing = true;
			this.skippable = false;
			this.auto = false;
			this.nowPlayingMsg = undefined;
			this.queueManager = queueManager;
			this.queueManager.addQueue(this);
			voiceChannel.join().then(connection => {
				this.connection = connection;
				if (this.songs.length) this.play();
			});
			this.voiceLeaveTimeout = new utils.BetterTimeout();
		}
		/**
		 * @returns {Discord.VoiceChannel}
		 */
		get voiceChannel() {
			return this.connection ? this.connection.channel : this._voiceChannel;
		}
		/**
		 * @returns {Discord.StreamDispatcher}
		 */
		get dispatcher() {
			return this.connection.dispatcher || this._dispatcher;
		}
		toObject() {
			return {
				id: this.id,
				songs: this.songs.map(s => s.toUnified()),
				time: this.dispatcher.time,
				playing: this.playing,
				skippable: this.skippable,
				auto: this.auto,
				volume: this.volume,
			}
		}
		dissolve() {
			this.songs.length = 0;
			this.auto = false;
			this.voiceLeaveTimeout.clear();
			if (this.connection && this.connection.dispatcher) this.connection.dispatcher.end();
			if (this.voiceChannel) this.voiceChannel.leave();
			if (this.nowPlayingMsg) this.nowPlayingMsg.clearReactions();
			if (this.reactionMenu) this.reactionMenu.destroy(true);
			this.destroy();
		}
		destroy() {
			this.queueManager.storage.delete(this.id);
		}
		/**
		 * @param {Song} song
		 * @param {Boolean} insert
		 */
		addSong(song, insert) {
			let position; // the actual position to insert into, `undefined` to push
			if (insert == undefined) { // no insert? just push
				position = undefined;
			} else if (typeof(insert) == "number") { // number? insert into that point
				position = insert;
			} else if (typeof(insert) == "boolean") { // boolean?
				if (insert) position = 1; // if insert is true, insert
				else position = undefined; // otherwise, push
			}
			if (position == undefined) this.songs.push(song);
			else this.songs.splice(position, 0, song);
			if (this.songs.length == 1) {
				if (this.connection) this.play();
			} else {
				if (song.deleteCache) song.deleteCache();
			}
		}
		/**
		 * @param {Discord.GuildMember} oldMember
		 * @param {Discord.GuildMember} newMember
		 */
		voiceStateUpdate(oldMember, newMember) {
			let count = this.voiceChannel.members.filter(m => !m.user.bot).size;
			if (count == 0) {
				if (!this.voiceLeaveTimeout.isActive) {
					this.voiceLeaveTimeout = new utils.BetterTimeout(() => {
						this.textChannel.send("Everyone left, so I have as well.");
						this.dissolve();
					}, voiceEmptyDuration);
					this.textChannel.send("No users left in my voice channel. I will stop playing in "+voiceEmptyDuration/1000+" seconds if nobody rejoins.");
				}
			} else {
				this.voiceLeaveTimeout.clear();
			}
		}
		getNPEmbed() {
			let song = this.songs[0];
			let embed = new Discord.RichEmbed().setColor("36393E")
			.setDescription(`Now playing: **${song.title}**`)
			.addField("­",songProgress(this.dispatcher, this, !this.connection.dispatcher)+(this.auto ? "\n\n**Auto mode on.**" : ""));
			if (!this.textChannel.permissionsFor(client.user).has("ADD_REACTIONS")) embed.addField("­", "Please give me permission to add reactions to use player controls!");
			return embed;
		}
		generateReactions() {
			if (this.reactionMenu) this.reactionMenu.destroy(true);
			if (this.nowPlayingMsg) this.reactionMenu = this.nowPlayingMsg.reactionMenu([
				{ emoji: "⏯", remove: "user", actionType: "js", actionData: (msg, emoji, user) => {
					if (!this.voiceChannel.members.has(user.id)) return;
					if (this.playing) this.pause();
					else this.resume();
				}},
				{ emoji: "⏭", remove: "user", actionType: "js", actionData: (msg, emoji, user, messageReaction) => {
					if (!this.voiceChannel.members.has(user.id)) return;
					this.skip();
				}},
				{ emoji: "⏹", remove: "user", actionType: "js", actionData: (msg, emoji, user) => {
					if (!this.voiceChannel.members.has(user.id)) return;
					msg.clearReactions();
					this.stop();
				}}
			]);
		}
		/**
		 * @param {Function} code
		 */
		queueAction(code) {
			return (web) => {
				let result = code();
				if (web) {
					if (result[0]) { // no error
						if (result[1]) { // output
							return [200, result[1]];
						} else { // no output
							return [204, ""];
						}
					} else { // error
						return [400, result[1] || ""];
					}
				} else {
					if (result[1]) return this.textChannel.send(result[1]);
				}
				reloadEvent.emit("musicOut", "queues", queueManager.storage);
				return result;
			}
		}
		/**
		 * @returns {Promise<void>} void
		 */
		async play() {
			if (this.songs[0].basic && this.songs[0].basic.id) this.playedSongs.add(this.songs[0].basic.id);
			let streams = await this.songs[0].getStream();
			let stream = streams[0];
			streams[1].on("error", async err => {
				if (err.message == "Status code: 403") {
					console.log("We got the classic 403 signature base64 thingy.");
					if (!this.songs[0].failures) this.songs[0].failures = 1;
					else this.songs[0].failures++;
					if (this.songs[0].failures <= 3) {
						console.log(`Automatically retrying. (retry ${this.songs[0].failures})`);
						this.songs[0].info = undefined;
						setTimeout(() => {
							this.play();
						}, 1000);
						return;
					}
				}
				let embed = new Discord.RichEmbed()
				.setDescription(
					"Some error occurred and has been logged to console. Chances are that this won't happen a second time.\n"+
					"Press <:cbn_tick:378414422219161601> to try again.\n"+
					"If you keep seeing this, [please tell us about it in the support server.](https://discord.gg/zhthQjH)"
				)
				.setColor("#36393F")
				let retryMessage = await this.textChannel.send(embed);
				retryMessage.reactionMenu([
					{emoji: client.emojis.get(client.parseEmoji("<:cbn_tick:378414422219161601>").id), remove: "all", ignore: "total", actionType: "js", actionData: () => {
						this.songs[0].info = undefined;
						this.play();
					}}
				]);
			});
			/**
			 * @type {Discord.StreamDispatcher}
			 */
			const dispatcher = this.connection[this.songs[0].connectionPlayFunction](stream);
			this._dispatcher = dispatcher;
			dispatcher.once("start", async () => {
				queueManager.songsPlayed++;
				dispatcher.setBitrate("auto");
				this.skippable = true;
				reloadEvent.emit("musicOut", "queues", queueManager.storage);
				let dispatcherEndCode = new Function();
				let updateProgress = () => {
					if (this.songs[0]) return this.nowPlayingMsg.edit(this.getNPEmbed());
					else return Promise.resolve();
				}
				if (!this.nowPlayingMsg) {
					await this.textChannel.send(this.getNPEmbed()).then(n => this.nowPlayingMsg = n);
					this.generateReactions();
				} else {
					await updateProgress();
				}
				let npStartTimeout = setTimeout(() => {
					if (!this.songs[0] || !this.connection.dispatcher) return;
					updateProgress();
					let updateProgressInterval = setInterval(() => {
						updateProgress();
					}, 5000);
					dispatcherEndCode = () => {
						clearInterval(updateProgressInterval);
						updateProgress();
					};
				}, 5000-dispatcher.time%5000);
				function handleError (error) { console.error(error); }
				dispatcher.on('error', handleError);
				dispatcher.once("end", () => {
					dispatcher.player.streamingData.pausedTime = 0;
					dispatcher.removeListener("error", handleError);
					clearTimeout(npStartTimeout);
					dispatcherEndCode();
					this.skippable = false;
					new Promise(resolve => {
						if (this.auto && this.songs.length == 1) {
							this.songs[0].related().then(related => {
								related = related.filter(v => !this.playedSongs.has(v.id));
								if (related[0]) {
									ytdl.getInfo(related[0].id).then(video => {
										let song = new songTypes.YouTubeSong(video, true); //TODO: move this to the song object
										this.addSong(song);
										resolve();
									}).catch(reason => {
										manageYtdlGetInfoErrors(this.textChannel, reason);
										resolve();
									});
								} else {
									this.textChannel.send("Auto mode was on, but I ran out of related songs to play.");
								}
							});
						} else resolve();
					}).then(() => {
						this.songs.shift();
						if (this.songs.length) this.play();
						else this.dissolve();
					});
				});
			});
		}
		/**
		 * @returns {Array<any>}
		 */
		pause(web) {
			return this.queueAction(() => {
				if (this.connection && this.connection.dispatcher && this.playing && !this.songs[0].live) {
					this.playing = false;
					this.connection.dispatcher.pause();
					this.nowPlayingMsg.edit(this.getNPEmbed(this.connection.dispatcher, this));
					return [true];
				} else if (!this.playing) {
					return [false, "Music is already paused."];
				} else if (this.songs[0].live) {
					return [false, "Cannot pause live radio."];
				} else {
					return [false, lang.voiceCannotAction("paused")];
				}
			})(web);
		}
		/**
		 * @returns {Array<any>}
		 */
		resume(web) {
			return this.queueAction(() => {
				if (this.connection && this.connection.dispatcher && !this.playing) {
					this.playing = true;
					this.connection.dispatcher.resume();
					this.nowPlayingMsg.edit(this.getNPEmbed(this.connection.dispatcher, this));
					return [true];
				} else if (this.playing) {
					return [false, "Music is not paused."];
				} else {
					return [false, lang.voiceCannotAction("resumed")];
				}
			})(web);
		}
		/**
		 * @returns {Array<any>}
		 */
		skip(web) {
			return this.queueAction(() => {
				if (this.connection && this.connection.dispatcher && this.playing) {
					this.connection.dispatcher.end();
					return [true];
				} else if (!this.playing) {
					return [false, "You cannot skip while music is paused. Resume, then skip."];
				} else {
					return [false, lang.voiceCannotAction("skipped")];
				}
			})(web);
		}
		/**
		 * @returns {Array<any>}
		 */
		stop(web) {
			return this.queueAction(() => {
				if (this.connection) {
					this.dissolve();
					return [true];
				} else {
					return [false, "I have no idea why that didn't work."];
				}
			})(web);
		}
	}

	return {prettySeconds, songProgress, Queue}
}