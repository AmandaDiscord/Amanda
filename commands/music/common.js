//@ts-ignore
require("../../types.js")

const ytdl = require("ytdl-core");
const rp = require("request-promise");
const Discord = require("discord.js");

const Structures = require("../../modules/structures");

let resultCache;

/** @param {PassthroughType} passthrough */
module.exports = passthrough => {
	let {client, reloader, youtube} = passthrough;

	let utils = require("../../modules/utilities.js")(passthrough);
	reloader.useSync("./modules/utilities.js", utils);

	let lang = require("../../modules/lang.js")(passthrough);
	reloader.useSync("./modules/lang.js", lang);

	if (!resultCache) {
		var common = {
			/**
			 * @param {Structures.TextChannel} channel
			 * @param {Object} reason
			 * @param {String} reason.message
			 * @param {String} id
			 * @param {Number} item
			 * @returns {Promise<Structures.Message>}
			 */
			manageYtdlGetInfoErrors: function(channel, reason, id, item) {
				if (channel instanceof Structures.Message) channel = channel.channel;
				let idString = id ? ` (index: ${item}, id: ${id})` : "";
				if (!reason || !reason.message) {
					return channel.send("An unknown error occurred."+idString);
				} if (reason.message && reason.message.startsWith("No video id found:")) {
					return channel.send(`That is not a valid YouTube video.`+idString);
				} else if (reason.message && (
						reason.message.includes("who has blocked it in your country")
					|| reason.message.includes("This video is unavailable")
					|| reason.message.includes("The uploader has not made this video available in your country")
					|| reason.message.includes("copyright infringement")
				)) {
					return channel.send(`I'm not able to stream that video. It may have been deleted by the creator, made private, blocked in certain countries, or taken down for copyright infringement.`+idString);
				} else {
					return new Promise(resolve => {
						utils.stringify(reason).then(result => {
							channel.send(result).then(resolve);
						});
					});
				}
			},
			
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
			},
			resolveInput: {
				/**
				 * @param {String} input
				 * @param {Structures.TextChannel} channel
				 * @returns {Promise<Array<String>|Array<import("simple-youtube-api").Video>>}
				 */
				toID: async function(input, channel) {
					input = input.replace(/(<|>)/g, "");
					try {
						let inputAsURL = input;
						if (inputAsURL.includes(".com/") && !inputAsURL.startsWith("http")) inputAsURL = "https://"+inputAsURL;
						let url = new URL(inputAsURL);
						// It's a URL.
						if (url.hostname.startsWith("www.")) url.hostname = url.hostname.slice(4);
						// Is it CloudTube?
						if (url.hostname == "cadence.moe" || url.hostname == "cadence.gq") {
							try {
								let id = url.pathname.match(/video\.(.*)$/)[1];
								// Got an ID!
								return [id];
							} catch (e) {
								// Didn't match.
								return null;
							}
						}
						// Is it youtu.be?
						else if (url.hostname == "youtu.be") {
							let id = url.pathname.slice(1)
							return [id]
						}
						// Is it YouTube-compatible?
						else if (url.hostname == "youtube.com" || url.hostname == "invidio.us" || url.hostname == "hooktube.com") {
							// Is it a video?
							if (url.pathname == "/watch") {
								let id = url.searchParams.get("v");
								// Got an ID!
								return [id];
							}
							// Is it a playlist?
							else if (url.pathname == "/playlist") {
								let list = url.searchParams.get("list")
								let playlist = await youtube.getPlaylistByID(list, {part: "snippet,contentDetails"})
								if (channel) {
									if (playlist.length > 300) await channel.send(`That's a MASSIVE playlist (${playlist.length} items). I'll only load the first 300 items. Give me a moment...`)
									else if (playlist.length > 100) await channel.send(`That's a pretty big playlist (${playlist.length} items). Give me a moment to load it...`)
								}
								let videos = await playlist.getVideos(300)
								let parts = []
								let addIndex = 0
								while (addIndex < videos.length) {
									parts.push(videos.slice(addIndex, addIndex+50))
									addIndex += 50
								}
								await Promise.all(parts.map(part => {
									let ids = part.map(p => p.id).join("%2C")
									return rp(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${youtube.key}`, {json: true}).then(data => {
										data.items.forEach((dataItem, index) => {
											part[index]._patch(dataItem)
										})
									})
								}))
								return videos
							}
							// YouTube-compatible, but can't resolve to a video.
							else {
								return null;
							}
						}
						// Unknown site.
						else {
							return null;
						}
					} catch (e) {
						// Not a URL. Might be an ID?
						if (input.length == 11) return ytdl.getBasicInfo(input).then(info => [info.player_response.videoDetails.videoId]).catch(() => null)
						else return null
					}
				},

				/**
				 * Not interactive. Max 10 results.
				 * @param {String} input
				 * @returns {Promise<Array<{type: String, title: String, videoId: String, author: String, authorId: String, videoThumbnails: Array<{quality: String, url: String, width: Number, height: Number}>, description: String, descriptionHtml: String, viewCount: Number, published: Number, publishedText: String, lengthSeconds: Number, liveNow: Boolean, paid: Boolean, premium: Boolean}>>}
				 */
				toSearch: async function(input) {
					let videos;
					try {
						videos = await rp(`https://invidio.us/api/v1/search?order=relevance&q=${encodeURIComponent(input)}`, {json: true});
					} catch (e) {
						return [];
					}
					if (!videos.filter) return [];
					videos = videos.filter(v => v.lengthSeconds > 0).slice(0, 10);
					return videos;
				},

				/**
				 * Interactive.
				 * @param {String} input
				 * @param {Structures.TextChannel} channel
				 * @param {String} authorID
				 * @returns {Promise<Array<any>>} An array of video IDs, or null
				 */
				toIDWithSearch: async function(input, channel, authorID) {
					let id = await common.resolveInput.toID(input, channel);
					if (id) return [id, false];
					channel.sendTyping()
					let videos = await common.resolveInput.toSearch(input);
					if (videos.length < 1) return null;
					let videoResults = videos.map((video, index) => `${index+1}. **${Discord.Util.escapeMarkdown(video.title)}** (${common.prettySeconds(video.lengthSeconds)})`);
					return utils.makeSelection(channel, authorID, "Song selection", "Song selection cancelled", videoResults).then(index => {
						return [[videos[index].videoId], true];
					}).catch(() => {
						return null;
					})
				}
			}
		}
		resultCache = common
	} else {
		var common = resultCache
	}

	return common
}