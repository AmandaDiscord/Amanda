import { webcrypto } from "crypto"

import { verify } from "discord-verify/node"

import buttons = require("@amanda/buttons")

import type { APIInteraction, APIChatInputApplicationCommandInteraction } from "discord-api-types/v10"

import passthrough = require("../passthrough")
const { server, sync, confprovider, commands } = passthrough

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

	const body = await utils.requestBody(res, Number(reqLength)).catch(() => void 0)
	if (!body) {
		if (!res.continue) return
		return void res.writeStatus("400").endWithoutBody()
	}
	if (!res.continue) return

	const bodyString = body.toString("utf8")
	const allowed = await verify(bodyString, reqSig, reqTimestamp, confprovider.config.discord_app_public_key, webcrypto.subtle).catch(() => false)
	if (!res.continue) return
	if (!allowed) return void res.writeStatus("401").endWithoutBody()

	const payload: APIInteraction = JSON.parse(bodyString)

	// Pings to verify
	if (payload.type === 1) {
		return void res
			.writeStatus("200")
			.writeHeader("Content-Type", "application/json")
			.end("{\"type\":1}")
	}

	// Commands
	if (payload.type === 2) {
		if (commands.handle(payload as APIChatInputApplicationCommandInteraction)) {
			return void res
				.writeStatus("200")
				.writeHeader("Content-Type", "application/json")
				.end("{\"type\":5}")
		}
	}

	// Buttons
	if (payload.type === 3) {
		res
			.writeStatus("200")
			.writeHeader("Content-Type", "application/json")
			.end("{\"type\":6}")

		return void buttons.handle(payload)
	}
})
