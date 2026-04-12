import { webcrypto } from "crypto"

import { verify } from "discord-verify/node"

import type { APIInteraction } from "discord-api-types/v10"

import passthrough = require("../passthrough")
const { server, sync, confprovider, commands, commandWorkers } = passthrough

const utils = sync.require("../utils") as typeof import("../utils")

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
		let written = false
		return void res.cork(() => {
			if (written) return
			written = true
			res.writeStatus("400").endWithoutBody()
		})
	}
	if (!res.continue) return

	const bodyString = body.toString("utf8")
	const allowed = await verify(bodyString, reqSig, reqTimestamp, confprovider.config.discord_app_public_key, webcrypto.subtle).catch(() => false)
	if (!res.continue) return
	if (!allowed) {
		let written = false
		return void res.cork(() => {
			if (written) return
			written = true
			res.writeStatus("401").endWithoutBody()
		})
	}

	const payload: APIInteraction = JSON.parse(bodyString)
	const fromHandler = await utils.handleInteraction(payload, true).catch(() => void 0)
	if (!res.continue) return

	if (!fromHandler) {
		console.warn("No command workers to handle interaction")
		let written = false
		return void res.cork(() => {
			if (written) return
			written = true
			res
				.writeStatus("503 Service Unavailable")
				.endWithoutBody()
		})
	}

	let written = false
	return void res.cork(() => {
		if (written) return
		written = true
		res
			.writeStatus("200")
			.writeHeader("Content-Type", "application/json")
			.end(fromHandler)
	})
})
