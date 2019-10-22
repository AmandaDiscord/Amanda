// @ts-check

const path = require("path")

const passthrough = require("../passthrough")
const { commands, reloader } = passthrough

const utils = require("../modules/utilities.js")
reloader.useSync("./modules/utilities.js", utils)

const emptyNotifications = []

// TODO: make this actually work lol

/* utils.addTemporaryListener(queueManager.events, "remove", path.basename(__filename), () => {
	if (queueManager.storage.size == 0) {
		emptyNotifications.forEach(({user, channel}) => {
			channel.send(user+" All voice sessions have ended.")
		})
		emptyNotifications = []
	}
})

commands.assign({
	"emptynotify": {
		aliases: ["emptynotify"],
		description: "Notifies you when all voice sessions end",
		usage: "None",
		category: "admin",
		process: async (msg, suffix) => {
			if (queueManager.storage.size == 0) {
				msg.channel.send("There aren't any voice sessions right now. You won't be notified.")
			} else {
				let existing
				if (existing = emptyNotifications.find(entry => entry.user == msg.author)) {
					msg.channel.send("You already have notifications pending for "+existing.channel+".")
				} else {
					emptyNotifications.push({user: msg.author, channel: msg.channel})
					msg.react("✅")
				}
			}
		}
	}
})*/
