import { webcrypto } from "crypto"

import { verify } from "discord-verify/node"

import buttons = require("@amanda/buttons")
import sharedUtils = require("@amanda/shared-utils")

import type { APIInteraction, APIChatInputApplicationCommandInteraction } from "discord-api-types/v10"

import passthrough = require("../passthrough")
const { server, sync, confprovider, commands, commandWorkers } = passthrough

const utils: typeof import("../utils") = sync.require("../utils")

server.post("/interaction", async (res, req) => {
	utils.attachResponseAbortListener(res)

	const reqLength = req.getHeader("content-length")
	const reqType = req.getHeader("content-type")
	const reqSig = req.getHeader("x-signature-ed25519")
	const reqTimestamp = req.getHeader("x-signature-timestamp")

	if (reqType !== "application/json") return void res.writeStatus("415").endWithoutBody()
	if (!reqSig || !reqTimestamp) return void res.writeStatus("400").endWithoutBody()
	if (!reqLength || isNaN(Number(reqLength))) return void res.writeStatus("411").endWithoutBody()

	const body = await utils.requestBody(res, Number(reqLength))
	if (!body) {
		if (!res.continue) return
		return void res.cork(() => res.writeStatus("400").endWithoutBody())
	}
	if (!res.continue) return

	const bodyString = body.toString("utf8")
	const allowed = await verify(bodyString, reqSig, reqTimestamp, confprovider.config.discord_app_public_key, webcrypto.subtle).catch(() => false)
	if (!res.continue) return
	if (!allowed) return void res.cork(() => res.writeStatus("401").endWithoutBody())

	const payload: APIInteraction = JSON.parse(bodyString)
	let rt = "{}"
	let commandHandled = false

	const user = payload.member?.user ?? payload.user
	sharedUtils.updateUser(user)

	// Pings to verify
	if (payload.type === 1) rt = "{\"type\":1}"
	else if (payload.type === 2) { // Commands
		rt = "{\"type\":5}"
		if (commands.handle(payload as APIChatInputApplicationCommandInteraction)) commandHandled = true
	} else if (payload.type === 3) { // Buttons
		rt = "{\"type\":6}"
		buttons.handle(payload)
	} else console.error(`Unknown payload type ${payload.type}\n`, payload)

	if (!commandHandled) {
		if (!commandWorkers.length) {
			console.warn("No command workers to handle interaction")
			return void res.cork(() => {
				res
					.writeStatus("503 Service Unavailable")
					.endWithoutBody()
			})
		}
		const worker = sharedUtils.arrayRandom(commandWorkers)
		worker.send({
			op: 0,
			t: "INTERACTION_CREATE",
			d: payload
		})
	}

	return void res.cork(() => {
		res
			.writeStatus("200")
			.writeHeader("Content-Type", "application/json")
			.end(rt)
	})
})
