import sharedUtils = require("@amanda/shared-utils")

import type { APIDMChannel } from "discord-api-types/v10"

import passthrough = require("./passthrough")
const { snow, confprovider, sync } = passthrough

let lastLover: Lover | undefined
let loverMessageSendTimeout: NodeJS.Timeout | undefined

class Lover {
	public channelGetter = new sharedUtils.AsyncValueCache<APIDMChannel | null>(
		() => snow.user.createDirectMessageChannel(this.id).catch(() => null) as Promise<APIDMChannel>
	)
	public lastTimeoutDuration = confprovider.config.amandas_lover_send_timeout

	public constructor(public id: string) { void 0 }

	public async send(message: string): Promise<void> {
		const channel = await this.channelGetter.get()
		if (!channel) return void console.error("Lover's DM channel was null")
		try {
			await snow.channel.createMessage(channel.id, { content: message })
			console.log(`Sent a message to my lover <3\n${message}`)
		} catch {
			console.error("Could not send a message to my lover. I'm gonna try again next time anyways just in case")
		}
	}
}

if (confprovider.config.lover_messages_enabled_on_this_cluster && confprovider.config.amandas_lover_id.length) {
	lastLover = new Lover(confprovider.config.amandas_lover_id)
	loverMessageSendTimeout = setTimeout(loverMessageSendTimeoutFunction, confprovider.config.amandas_lover_send_timeout)
	console.log("Lover messages have been enabled")
}

function loverMessageSendTimeoutFunction() {
	if (!lastLover) return
	const message = sharedUtils.arrayRandom(confprovider.config.lover_messages)
	lastLover.send(message)
	loverMessageSendTimeout = setTimeout(loverMessageSendTimeoutFunction, confprovider.config.amandas_lover_send_timeout)
}

function onConfigChangeCallback() {
	if ((lastLover && confprovider.config.lover_messages_enabled_on_this_cluster && !confprovider.config.amandas_lover_id.length) || (lastLover && !confprovider.config.lover_messages_enabled_on_this_cluster)) {
		if (loverMessageSendTimeout) clearTimeout(loverMessageSendTimeout)
		loverMessageSendTimeout = undefined
		lastLover = undefined
		console.log("Lover messages have been disabled")
	}

	if (confprovider.config.lover_messages_enabled_on_this_cluster && confprovider.config.amandas_lover_id.length && lastLover?.id !== confprovider.config.amandas_lover_id) {
		lastLover = new Lover(confprovider.config.amandas_lover_id)
		if (!loverMessageSendTimeout) loverMessageSendTimeout = setTimeout(loverMessageSendTimeoutFunction, confprovider.config.amandas_lover_send_timeout)
		console.log(`Lover channel changed to belong to ${confprovider.config.amandas_lover_id}`)
	}

	if (lastLover && confprovider.config.amandas_lover_send_timeout !== lastLover.lastTimeoutDuration) {
		lastLover.lastTimeoutDuration = confprovider.config.amandas_lover_send_timeout
		if (loverMessageSendTimeout) clearTimeout(loverMessageSendTimeout)
		loverMessageSendTimeout = undefined
		if (confprovider.config.lover_messages_enabled_on_this_cluster && confprovider.config.amandas_lover_id.length) loverMessageSendTimeout = setTimeout(loverMessageSendTimeoutFunction, confprovider.config.amandas_lover_send_timeout)
		else lastLover = undefined

		console.log("The lover send timeout has been changed")
	}
}

confprovider.addCallback(onConfigChangeCallback)

sync.events.once(__filename, () => {
	confprovider.removeCallback(onConfigChangeCallback)

	if (loverMessageSendTimeout) {
		clearTimeout(loverMessageSendTimeout)
		console.log("cleared old lover message send timeout")
	}
})
