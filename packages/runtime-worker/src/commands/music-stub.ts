import passthrough = require("../passthrough")
const { commands } = passthrough

commands.assign([
	{
		name: "play",
		description: "Play music from multiple sources",
		category: "audio",
		options: [
			{
				name: "track",
				type: 3,
				description: "The track you'd like to play",
				required: true
			},
			{
				name: "position",
				type: 4,
				description: "1 based index to start adding tracks from",
				required: false,
				min_value: 2
			}
		],
		process() { void 0 }
	},
	{
		name: "radio",
		description: "Play from radio stations",
		category: "audio",
		options: [
			{
				name: "station",
				type: 3,
				description: "The station to play from",
				required: true,
				choices: [
					{ name: "random", value: "random" },
					{ name: "frisky original", value: "frisky/original" },
					{ name: "frisky deep", value: "frisky/deep" },
					{ name: "frisky chill", value: "frisky/chill" },
					{ name: "frisky classics", value: "frisky/classics" },
					{ name: "listen moe japanese", value: "listenmoe/japanese" },
					{ name: "listen moe korean", value: "listenmoe/korean" },
					{ name: "absolute chillout", value: "radionet/absolutechillout" },
					{ name: "radio swiss jazz", value: "radionet/swissjazz" },
					{ name: "yoga chill", value: "radionet/yogachill" },
					{ name: "95.7 the rock", value: "radionet/therock" },
					{ name: "classic country", value: "radionet/classiccountry" },
					{ name: "94.9 the surf", value: "radionet/thesurf" },
					{ name: "gay fm", value: "radionet/gayfm" },
					{ name: "aardvark blues", value: "radionet/aardvarkblues" }
				]
			},
			{
				name: "position",
				type: 4,
				description: "1 based index to start adding tracks from",
				required: false,
				min_value: 2
			}
		],
		process() { void 0 }
	},
	{
		name: "skip",
		description: "Skip tracks in the queue",
		category: "audio",
		options: [
			{
				name: "start",
				type: 4,
				description: "1 based index to start skipping tracks from",
				required: false,
				min_value: 1
			},
			{
				name: "amount",
				type: 4,
				description: "The amount of tracks to skip in the queue",
				required: false,
				min_value: 1
			}
		],
		process() { void 0 }
	},
	{
		name: "stop",
		description: "Stops the queue",
		category: "audio",
		process() { void 0 }
	},
	{
		name: "queue",
		description: "Show the queue and do actions",
		category: "audio",
		options: [
			{
				name: "page",
				type: 4,
				description: "Choose what page in the queue to show",
				required: false,
				min_value: 1
			},
			{
				name: "volume",
				type: 4,
				min_value: 1,
				max_value: 500,
				description: "Set the volume % of the queue",
				required: false
			},
			{
				name: "loop",
				type: 5,
				description: "Set the state of loop mode for the queue",
				required: false
			},
			{
				name: "pause",
				type: 5,
				description: "Sets the paused state of the queue",
				required: false
			}
		],
		process() { void 0 }
	},
	{
		name: "nowplaying",
		description: "Show the queue now playing message",
		category: "audio",
		process() { void 0 }
	},
	{
		name: "trackinfo",
		description: "Shows info about the currently playing track",
		category: "audio",
		process() { void 0 }
	},
	{
		name: "lyrics",
		description: "Shows the lyrics of the currently playing track",
		category: "audio",
		process() { void 0 }
	},
	{
		name: "seek",
		description: "Seek to a time in the currently playing track",
		category: "audio",
		options: [
			{
				name: "time",
				type: 4,
				description: "The time in seconds to seek in the track",
				required: true
			}
		],
		process() { void 0 }
	},
	{
		name: "filters",
		description: "Apply filters to the queue",
		category: "audio",
		options: [
			{
				name: "pitch",
				type: 4,
				description: "Sets the pitch of the queue in decibals",
				min_value: -7,
				max_value: 7,
				required: false
			},
			{
				name: "speed",
				type: 4,
				description: "Sets the speed % of the queue",
				min_value: 1,
				max_value: 500,
				required: false
			}
		],
		process() { void 0 }
	},
	{
		name: "shuffle",
		description: "Shuffle the queue",
		category: "audio",
		process() { void 0 }
	},
	{
		name: "remove",
		description: "Removes a track from the queue",
		category: "audio",
		options: [
			{
				name: "index",
				type: 4,
				description: "1 based index to start removing tracks from",
				required: true,
				min_value: 2
			}
		],
		process() { void 0 }
	},
	{
		name: "musictoken",
		description: "Obtain a web dashboard login token",
		category: "audio",
		options: [
			{
				name: "action",
				description: "What to do",
				type: 3,
				choices: [
					{
						name: "new",
						value: "n"
					},
					{
						name: "delete",
						value: "d"
					}
				],
				required: false
			}
		],
		process() { void 0 }
	},
	{
		name: "playlists",
		description: "Manage and play Amanda playlists",
		category: "audio",
		options: [
			{
				name: "meta",
				description: "Metadata commands",
				type: 1,
				required: false,
				options: [
					{
						name: "show",
						description: "Shows all Amanda playlists. True to only show yourself",
						type: 5,
						required: false
					},
					{
						name: "info",
						description: "Shows info for a playlist",
						type: 3,
						required: false
					},
					{
						name: "create",
						description: "Creates a playlist",
						type: 3,
						required: false
					},
					{
						name: "delete",
						description: "Deletes a playlist",
						type: 3,
						required: false
					}
				]
			},
			{
				name: "add",
				description: "Adds a track to a playlist",
				type: 1,
				required: false,
				options: [
					{
						name: "playlist",
						description: "The name of the playlist",
						type: 3,
						required: true
					},
					{
						name: "track",
						description: "A resolveable track (link, name, id)",
						type: 3,
						required: true
					}
				]
			},
			{
				name: "remove",
				description: "Removes a track from a playlist",
				type: 1,
				required: false,
				options: [
					{
						name: "playlist",
						description: "The name of the playlist",
						type: 3,
						required: true
					},
					{
						name: "index",
						description: "The 1 based index of the track to remove",
						type: 4,
						required: true
					}
				]
			},
			{
				name: "move",
				description: "Moves a track in a playlist from one index to another",
				type: 1,
				required: false,
				options: [
					{
						name: "playlist",
						description: "The name of the playlist",
						type: 3,
						required: true
					},
					{
						name: "from",
						description: "The 1 based index of the track to move",
						type: 4,
						required: true
					},
					{
						name: "to",
						description: "The 1 based index the track should appear at",
						type: 4,
						required: true
					}
				]
			},
			{
				name: "search",
				description: "Filters tracks in a playlist",
				type: 1,
				required: false,
				options: [
					{
						name: "playlist",
						description: "The name of the playlist",
						type: 3,
						required: true
					},
					{
						name: "query",
						description: "The search term to filter by",
						type: 3,
						required: true
					}
				]
			},
			{
				name: "play",
				description: "Plays a playlist",
				type: 1,
				required: false,
				options: [
					{
						name: "playlist",
						description: "The name of the playlist",
						type: 3,
						required: true
					},
					{
						name: "shuffle",
						description: "If the playlist should start shuffled",
						type: 5,
						required: false
					},
					{
						name: "start",
						description: "The 1 based index to start from. When shuffling, only a portion is selected and then shuffled",
						type: 4,
						required: false,
						min_value: 1
					}
				]
			}
		],
		process() { void 0 }
	}
])
