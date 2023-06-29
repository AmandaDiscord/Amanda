import path = require("path")
import fs = require("fs")

import Canvas = require("canvas")

import passthrough = require("../passthrough")
const { client, confprovider, commands, sql, sync } = passthrough

import sharedUtils = require("@amanda/shared-utils")
import langReplace = require("@amanda/lang/replace")

import imageCache = require("../ImageCache")

import type { APIUser } from "discord-api-types/v10"
import type { UnpackArray } from "@amanda/shared-types"
import type { Lang } from "@amanda/lang"

const giverTier1 = BigInt(100000) // 100,000
const giverTier2 = BigInt(1000000) // 1,000,000
const giverTier3 = BigInt(10000000) // 10,000,000
const giverTier4 = BigInt(100000000) // 100,000,000

const imageCacheDirectory = path.join("../../image-cache")

const moneyManager: typeof import("../money-manager") = sync.require("../money-manager")
import type { CooldownInfo } from "../money-manager"

function mask(base: Canvas.Image | Canvas.Canvas, imageMask: Canvas.Image, width?: number, height?: number): Canvas.Canvas {
	const canvas = Canvas.createCanvas(width ?? base.width, height ?? base.height).getContext("2d")
	canvas.drawImage(imageMask, 0, 0, width ?? base.width, height ?? base.height)
	const oldOp = canvas.globalCompositeOperation
	canvas.globalCompositeOperation = "source-in"
	canvas.drawImage(base, 0, 0, width ?? base.width, height ?? base.height)
	canvas.globalCompositeOperation = oldOp
	return canvas.canvas
}

function getHeartType(user: APIUser, married?: boolean): "full" | "broken" {
	// Full hearts for Amanda! Amanda loves everyone.
	if (user.id == client.user.id) return "full"
	// User doesn't love anyone. Sad.
	if (!married) return "broken"
	// If we get here, then the user is in a relationship
	return "full"
}

const datemap = {
	0: "January",
	1: "February",
	2: "March",
	3: "April",
	4: "May",
	5: "June",
	6: "July",
	7: "August",
	8: "September",
	9: "October",
	10: "November",
	11: "December"
}

async function getDefaultBG(user: APIUser, images: Map<string, Canvas.Image>): Promise<Canvas.Image> {
	const attempt = await sql.orm.get("settings", {
		user_id: user.id,
		key: "defaultprofilebackground"
	})

	if (attempt && attempt.value !== "default") return images.get(attempt.value)!
	else return images.get("defaultbg")!
}

async function getOverlay(user: APIUser, images: Map<string, Canvas.Image>, themeoverlay: string): Promise<{
	style: "old" | "new",
	image: Canvas.Image
}> {
	const attempt = await sql.orm.get("settings", {
		user_id: user.id,
		key: "profilestyle"
	})

	if (attempt && attempt.value !== "new") {
		return {
			style: "old" as const,
			image: images.get(`old-${themeoverlay}`)!
		}
	} else {
		return {
			style: "new" as const,
			image: images.get(themeoverlay)!
		}
	}
}

const fontRegex = /(?<value>\d+\.?\d*)/

function setFontSize(size: number, ctx: Canvas.CanvasRenderingContext2D): void {
	ctx.font = ctx.font.replace(fontRegex, String(size))
}

const DiscordsProfile = {
	id: "643945264868098049",
	username: "Discord",
	discriminator: "0000",
	avatar: null
} as APIUser

function buildOldProfile(
	canvas: Canvas.CanvasRenderingContext2D,
	user: APIUser,
	others: Array<APIUser> | null,
	money: bigint,
	background: Canvas.Image,
	job: Awaited<ReturnType<typeof getOverlay>>,
	avatar: Canvas.Image,
	discoin: Canvas.Image,
	heart: Canvas.Image,
	badgeImage: Canvas.Image | null,
	giverImage: Canvas.Image | null
): void {
	// badge coords [219, 289, 359, 419, 489] (increments of 70)
	canvas.drawImage(background, 0, 0)
	canvas.drawImage(job.image, 0, 0)
	canvas.drawImage(avatar, 65, 61, 111, 111)

	if (badgeImage) canvas.drawImage(badgeImage, 219, 120)
	if (!badgeImage && giverImage) canvas.drawImage(giverImage, 219, 120)
	else if (badgeImage && giverImage) canvas.drawImage(giverImage, 289, 120)

	const otherTags = others
		? others.map(o => sharedUtils.userString(o)).join("\n")
		: null

	const useDiscrim = user.discriminator && user.discriminator !== "0"
	setFontSize(25, canvas)
	canvas.fillText(user.username, 219, useDiscrim ? 78 : 98)
	setFontSize(20, canvas)
	if (useDiscrim) canvas.fillText(`#${user.discriminator}`, 219, 90)
	canvas.drawImage(discoin, 62, 215)
	canvas.fillText(sharedUtils.numberComma(money), 106, 242)
	canvas.drawImage(heart, 62, 259)
	canvas.fillText(
		user.id == client.user.id ? "You <3" : otherTags ?? "Nobody, yet",
		106,
		285
	)
}

function buildNewProfile(
	canvas: Canvas.CanvasRenderingContext2D,
	user: APIUser,
	others: Array<APIUser> | null,
	money: bigint,
	background: Canvas.Image,
	bgmask: Canvas.Image,
	job: Awaited<ReturnType<typeof getOverlay>>,
	avatar: Canvas.Image,
	avatarMask: Canvas.Image,
	discoin: Canvas.Image,
	heart: Canvas.Image,
	badgeImage: Canvas.Image | null,
	giverImage: Canvas.Image | null
): void {
	canvas.drawImage(mask(background, bgmask), 0, 0)

	canvas.drawImage(job.image, 0, 0)

	canvas.drawImage(mask(avatar, avatarMask, 111, 111), 32, 85)

	if (badgeImage) canvas.drawImage(badgeImage, 166, 113)

	const useDiscrim = user.discriminator && user.discriminator !== "0"
	setFontSize(25, canvas)
	canvas.fillText(user.username, 508, useDiscrim ? 92 : 112)
	setFontSize(20, canvas)
	if (useDiscrim) canvas.fillText(`#${user.discriminator}`, 508, 124)

	const otherTags = others
		? others.map(o => sharedUtils.userString(o)).join("\n")
		: null

	canvas.drawImage(discoin, 508, 156)
	canvas.fillText(sharedUtils.numberComma(money), 550, 183)
	canvas.drawImage(heart, 508, 207)
	canvas.fillText(
		user.id == client.user.id ? "You <3" : otherTags ?? "Nobody, yet",
		550,
		233
	)
	if (giverImage) canvas.drawImage(giverImage, 595, 370)
}

function makefakeCardEnding(personal: boolean, user: APIUser, couple: { users: Array<string> } | null): string {
	const IDs = !personal && !!couple
		? couple.users.slice(0, 2)
		: [user.id]

	return `**** ${IDs.reduce((acc, cur) => acc + BigInt(cur), BigInt(0)).toString().slice(-4)}`
}

async function buildCard(
	card: Canvas.Image,
	cardOverlap: Canvas.Image,
	avatar: Canvas.Canvas,
	circleMask: Canvas.Image,
	circleOverlap: Canvas.Image,
	addCircle: Canvas.Canvas,
	neko: Canvas.Image,
	cardSizes: readonly [number, number],
	avatarSize: number,
	avatarStartX: number,
	avatarStartY: number,
	personal = true,
	fakePersonal: string,
	fakeCouple: string,
	page = 1,
	money: { amount: string },
	couple: { amount: string, users: Array<string> } | null,
	lang: Lang
): Promise<Canvas.CanvasRenderingContext2D> {
	const masked = (personal && page === 2) || (!personal && page === 1)
	const canvas = (masked
		? mask(card, cardOverlap, cardSizes[0], cardSizes[1]).getContext("2d")
		: (() => {
			const tempCanvas = Canvas.createCanvas(cardSizes[0], cardSizes[1]).getContext("2d")
			tempCanvas.drawImage(card, 0, 0, cardSizes[0], cardSizes[1])
			return tempCanvas
		})())

	canvas.fillStyle = "#ffffff"
	setFontSize(16, canvas)
	canvas.fillText(personal ? lang.GLOBAL.PRIVATE_CARD : lang.GLOBAL.COUPLE_CARD, 25, 50)
	canvas.fillText(personal ? fakePersonal : fakeCouple, 25, 70)

	setFontSize(22, canvas)
	canvas.fillText(sharedUtils.abbreviateNumber(personal ? money.amount : couple!.amount), 25, 30)

	if (!masked) {
		let avatars: Array<Canvas.Canvas> = []
		if (!personal) {
			avatars = await Promise.all(couple!.users.map(async u => {
				const user = await sharedUtils.getUser(u, client.snow, client) ?? DiscordsProfile

				return Canvas.loadImage(sharedUtils.displayAvatarURL(user))
					.catch(() => Canvas.loadImage(sharedUtils.displayAvatarURL(DiscordsProfile)))
			}))
				.then(pfps => pfps.map(a => mask(a, circleMask, avatarSize, avatarSize)))
		} else avatars = [avatar]

		const offset = 46
		canvas.drawImage(avatars[0], avatarStartX, avatarStartY)
		avatars.slice(1).forEach((pfp, index) => canvas.drawImage(mask(pfp, circleOverlap), avatarStartX + ((index + 1) * offset), avatarStartY))
		canvas.drawImage(addCircle, avatarStartX + (avatars.length * offset), avatarStartY)
		canvas.drawImage(neko, 280, avatarStartY + 10)
	}

	return canvas
}

async function printTransactions(
	page: Canvas.CanvasRenderingContext2D,
	id: string,
	fakeID: string,
	transactionOffset: number
): Promise<void> {
	const transactions = await sql.orm.select("transactions", {
		target: id
	}, {
		order: "date",
		orderDescending: true,
		limit: 7
	})

	const green = "#72BB72"
	const red = "#FF3B3B"

	transactions.forEach((transaction, index) => {
		page.textAlign = "left"
		const indexoffset = 570 + (index * transactionOffset)
		page.fillStyle = "#ffffff"
		setFontSize(18, page)
		page.fillText(transaction.description, 30, indexoffset)
		page.fillText(fakeID, 30, indexoffset + 30)

		page.textAlign = "right"
		const date = new Date(transaction.date)
		page.fillText(`${sharedUtils.position(date.getDate())} ${datemap[date.getMonth()]}, ${date.getFullYear()}`, 460, indexoffset + 20)
		page.fillStyle = transaction.mode === 0 ? green : red
		page.fillText(`${transaction.mode === 0 ? "+" : "-"}${sharedUtils.abbreviateNumber(transaction.amount)}`, 460, indexoffset - 10)
	})
}

async function buildPage1(
	base: Canvas.CanvasRenderingContext2D,
	card1: Canvas.Image,
	card2: Canvas.Image,
	cardOverlap: Canvas.Image,
	avatar: Canvas.Canvas,
	circleMask: Canvas.Image,
	circleOverlap: Canvas.Image,
	addCircle: Canvas.Canvas,
	neko: Canvas.Image,
	cardSizes: readonly [number, number],
	avatarSize: number,
	avatarStartX: number,
	avatarStartY: number,
	fakePersonal: string,
	fakeCouple: string,
	money: { id: string, amount: string },
	couple: { amount: string, users: Array<string> } | null,
	lang: Lang,
	cardOffset: number,
	transactionOffset: number
): Promise<Canvas.CanvasRenderingContext2D> {
	const promises: Array<Promise<Canvas.CanvasRenderingContext2D>> = []
	promises.push(buildCard(card1, cardOverlap, avatar, circleMask, circleOverlap, addCircle, neko, cardSizes, avatarSize, avatarStartX, avatarStartY, true, fakePersonal, fakeCouple, 1, money, couple, lang))
	if (couple) promises.push(buildCard(card2, cardOverlap, avatar, circleMask, circleOverlap, addCircle, neko, cardSizes, avatarSize, avatarStartX, avatarStartY, false, fakePersonal, fakeCouple, 1, money, couple, lang))
	const cards = await Promise.all(promises)

	let offset = 0

	if (couple) {
		offset = cardOffset
		base.drawImage(cards[1].canvas, 42, 150)
	}

	base.drawImage(cards[0].canvas, 42, 150 + offset)
	base.fillStyle = "#FFFFFF"
	setFontSize(24, base)
	base.textAlign = "center"
	base.fillText(`${lang.GLOBAL.TRANSACTIONS}:`, Math.floor(base.canvas.width / 2), 525)

	await printTransactions(base, money.id, fakePersonal, transactionOffset)

	return base
}

async function buildPage2(
	base: Canvas.CanvasRenderingContext2D,
	card1: Canvas.Image,
	card2: Canvas.Image,
	cardOverlap: Canvas.Image,
	avatar: Canvas.Canvas,
	circleMask: Canvas.Image,
	circleOverlap: Canvas.Image,
	addCircle: Canvas.Canvas,
	neko: Canvas.Image,
	cardSizes: readonly [number, number],
	avatarSize: number,
	avatarStartX: number,
	avatarStartY: number,
	fakePersonal: string,
	fakeCouple: string,
	money: { id: string, amount: string },
	couple: { id: string, amount: string, users: Array<string> },
	lang: Lang,
	cardOffset: number,
	transactionOffset: number
) {
	const promises = [
		buildCard(card2, cardOverlap, avatar, circleMask, circleOverlap, addCircle, neko, cardSizes, avatarSize, avatarStartX, avatarStartY, false, fakePersonal, fakeCouple, 2, money, couple, lang),
		buildCard(card1, cardOverlap, avatar, circleMask, circleOverlap, addCircle, neko, cardSizes, avatarSize, avatarStartX, avatarStartY, true, fakePersonal, fakeCouple, 2, money, couple, lang)
	]
	const cards = await Promise.all(promises)

	base.drawImage(cards[1].canvas, 42, 150)
	base.drawImage(cards[0].canvas, 42, 150 + cardOffset)
	base.fillStyle = "#FFFFFF"
	setFontSize(24, base)
	base.textAlign = "center"
	base.fillText(`${lang.GLOBAL.TRANSACTIONS}:`, Math.floor(base.canvas.width / 2), 525)

	await printTransactions(base, couple.id, fakeCouple, transactionOffset)

	return base
}

commands.assign([
	{
		name: "slots",
		description: "Run the slot machine",
		category: "money",
		options: [
			{
				name: "amount",
				type: 4,
				description: "The amount of money to bet",
				required: false,
				min_value: 2
			}
		],
		async process(cmd, lang) {
			if (!confprovider.config.db_enabled) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.DATABASE_OFFLINE
				})
			}

			const fruits = ["apple" as const, "cherries" as const, "watermelon" as const, "pear" as const, "strawberry" as const] // plus heart, which is chosen seperately
			const isPremium = await sql.orm.get("premium", { user_id: cmd.author.id })
			let cooldownInfo: { max: number, min: number, step: number, regen: { amount: number, time: number, } }
			// avg % assumes 5 fruits + heart, heart payouts [0, 1.25, 4, 20], triple fruit payout 5
			if (isPremium?.state) {
				cooldownInfo = {
					max: 190, // avg +6.2% per roll
					min: 172, // avg -4.8% per roll
					step: 6, // 4 rolls to hit the bottom
					regen: {
						amount: 1,
						time: 20 * 1000 // 2 minutes to recover by 1 roll
					}
				}
			} else {
				cooldownInfo = {
					max: 186, // avg +3.6% per roll
					min: 164, // avg -9.4% per roll
					step: 7, // 4.6 rolls to hit the bottom
					regen: {
						amount: 1,
						time: 30 * 1000 // 3.5 minutes to recover by 1 roll
					}
				}
			}

			const [money, winChance, images] = await Promise.all([
				moneyManager.getPersonalRow(cmd.author.id),
				moneyManager.updateCooldown(cmd.author.id, "slot", cooldownInfo),
				imageCache.getAll([
					"slot-background",
					"apple",
					"cherries",
					"heart",
					"pear",
					"strawberry",
					"watermelon"
				])
			])

			const slots: Array<UnpackArray<typeof fruits> | "heart"> = []
			for (let i = 0; i < 3; i++) {
				if (Math.random() < winChance / 1000) slots[i] = "heart"
				else slots[i] = sharedUtils.arrayRandom(fruits)
			}

			const canvas = Canvas.createCanvas(600, 800).getContext("2d")
			const bg = images.get("slot-background")!
			canvas.drawImage(bg, 0, 0)

			const pieces: Array<Canvas.Image> = []
			slots.forEach(i => pieces.push(images.get(i)!/* .resize(85, 85)*/))

			canvas.drawImage(pieces[0], 100, 560, 85, 85)
			canvas.drawImage(pieces[1], 258, 560, 85, 85)
			canvas.drawImage(pieces[2], 412, 560, 85, 85)

			const amount = cmd.data.options.get("amount")?.asNumber()

			if (!amount) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					files: [{
						name: "slot.png",
						file: canvas.canvas.toBuffer("image/png")
					}]
				})
			}

			const bet = BigInt(amount)
			if (bet > BigInt(money.amount)) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.NOT_ENOUGH_MONEY
				})
			}

			let result = ""
			let winning = BigInt(0)
			if (slots.every(s => s == "heart")) {
				winning = bet * BigInt(20)
				result = lang.GLOBAL.THREE_HEARTS
			} else if (slots.filter(s => s == "heart").length == 2) {
				winning = bet * BigInt(4)
				result = lang.GLOBAL.TWO_HEARTS
			} else if (slots.filter(s => s == "heart").length == 1) {
				winning = bet + (bet / BigInt(3))
				result = lang.GLOBAL.ONE_HEART
			} else if (slots.slice(1).every(s => s == slots[0])) {
				winning = bet * BigInt(5)
				result = lang.GLOBAL.TRIPLE_PIECES
			} else {
				winning = BigInt(0)
				result = lang.GLOBAL.LOST
			}

			await moneyManager.awardAmount(cmd.author.id, winning - bet, "NEKO Casino slot machine")
			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: result, files: [{
					name: "slot.png",
					file: canvas.canvas.toBuffer("image/png")
				}]
			})
		}
	},
	{
		name: "flip",
		description: "Flips a coin",
		category: "money",
		options: [
			{
				name: "amount",
				type: 4,
				description: "The amount of money to bet",
				required: false,
				min_value: 2
			},
			{
				name: "side",
				type: 3,
				description: "The side to bet on",
				required: false,
				choices: [
					{
						name: "heads",
						value: "h"
					},
					{
						name: "tails",
						value: "t"
					}
				]
			}
		],
		async process(cmd, lang) {
			const amount = cmd.data.options.get("amount")?.asNumber() ?? null
			let side = (cmd.data.options.get("side")?.asString() ?? null) as "h" | "t" | null
			if (!amount || !confprovider.config.db_enabled) {
				const flip = sharedUtils.arrayRandom(["<:coinH:402219464348925954>", "<:coinT:402219471693021196>"])
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: flip })
			}

			const money = await moneyManager.getPersonalRow(cmd.author.id)
			const bet = BigInt(amount)
			if (bet > BigInt(money.amount)) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.NOT_ENOUGH_MONEY
				})
			}

			let selfChosenSide = false
			if (!side) {
				side = Math.random() < 0.5 ? "h" : "t"
				selfChosenSide = true
			}

			const isPremium = await sql.orm.get("premium", { user_id: cmd.author.id })
			let cooldownInfo = {} as CooldownInfo // VSCode highlighting breaks if you type cast without an initializer
			if (isPremium?.state) {
				cooldownInfo = {
					max: 48,
					min: 40,
					step: 2,
					regen: {
						amount: 1,
						time: 1.5 * 60 * 1000
					}
				}
			} else {
				cooldownInfo = {
					max: 48,
					min: 40,
					step: 2,
					regen: {
						amount: 1,
						time: 2 * 60 * 1000
					}
				}
			}

			const winChance = await moneyManager.updateCooldown(cmd.author.id, "bf", cooldownInfo)
			if (Math.random() < winChance / 100) {
				const winnings = bet + (bet / BigInt(3))
				await moneyManager.awardAmount(cmd.author.id, winnings, "NEKO Casino coin flip")

				client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace((selfChosenSide
						? side === "h"
							? lang.GLOBAL.FLIP_AMANDA_CHOSE_HEADS_WON
							: lang.GLOBAL.FLIP_AMANDA_CHOSE_TAILS_WON
						: side === "h"
							? lang.GLOBAL.FLIP_HEADS_WON
							: lang.GLOBAL.FLIP_TAILS_WON
					),
					{
						"amount": sharedUtils.numberComma(winnings)
					})
				})
			} else {
				await moneyManager.awardAmount(cmd.author.id, -bet, "NEKO Casino coin flip")

				client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: langReplace((selfChosenSide
						? side === "h"
							? lang.GLOBAL.FLIP_AMANDA_CHOSE_HEADS_LOST
							: lang.GLOBAL.FLIP_AMANDA_CHOSE_TAILS_LOST
						: side === "h"
							? lang.GLOBAL.FLIP_HEADS_LOST
							: lang.GLOBAL.FLIP_TAILS_LOST
					),
					{
						"amount": sharedUtils.numberComma(bet)
					})
				})
			}
		}
	},
	{
		name: "money",
		description: "Shows how much money you/another person/the couple has",
		category: "money",
		options: [
			{
				name: "user",
				type: 6,
				description: "The user to get info on",
				required: false
			},
			{
				name: "couple",
				type: 5,
				description: "Whether to show the couple balance",
				required: false
			}
		],
		async process(cmd, lang) {
			if (!confprovider.config.db_enabled) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.DATABASE_OFFLINE
				})
			}

			const user = cmd.data.users.get(cmd.data.options.get("user")?.asString() ?? "") ?? cmd.author
			const showCouple = cmd.data.options.get("couple")?.asBoolean() ?? false

			const money = await moneyManager.getPersonalRow(user.id)
			const couple = await moneyManager.getCoupleRow(user.id)

			const [images, avatar] = await Promise.all([
				// jimpStores.fonts.getAll(["arial-16", "arial-24", "bahnschrift-22", "bahnschrift-22-red", "bahnschrift-22-green"]),
				imageCache.getAll([
					"bank",
					"card1",
					"card2",
					"card-overlap-mask",
					"circle-mask",
					"circle-overlap-mask",
					"add-circle",
					"neko"
				]),
				Canvas.loadImage(sharedUtils.displayAvatarURL(user))
			])

			const canvas = Canvas.createCanvas(485, 1050).getContext("2d")
			const bg = images.get("bank")!
			canvas.drawImage(bg, 0, 0)
			const card1 = images.get("card1")!
			const card2 = images.get("card2")!
			const cardOverlap = images.get("card-overlap-mask")!
			const circleMask = images.get("circle-mask")!
			const addCircle = images.get("add-circle")!
			const circleOverlap = images.get("circle-overlap-mask")!
			const neko = images.get("neko")!

			setFontSize(24, canvas)
			canvas.textAlign = "center"
			canvas.fillStyle = "#FFFFFF"
			canvas.fillText(sharedUtils.userString(user), Math.floor(bg.width / 2), 70)

			const avatarSize = 50
			const avatarStartX = 21
			const avatarStartY = 158
			const cardSizes = [400, 225] as const
			const cardOffset = 95

			const maskedAddCircle = mask(addCircle, circleOverlap, avatarSize, avatarSize)
			const maskedAvatar = mask(avatar, circleMask, avatarSize, avatarSize)

			const fakePersonal = makefakeCardEnding(true, user, null)
			const fakeCouple = makefakeCardEnding(false, user, couple)

			const transactionOffset = 70

			const buffer = await (couple && showCouple
				? buildPage2(canvas, card1, card2, cardOverlap, maskedAvatar, circleMask, circleOverlap, maskedAddCircle, neko, cardSizes, avatarSize, avatarStartX, avatarStartY, fakePersonal, fakeCouple, money, couple, lang, cardOffset, transactionOffset)
				: buildPage1(canvas, card1, card2, cardOverlap, maskedAvatar, circleMask, circleOverlap, maskedAddCircle, neko, cardSizes, avatarSize, avatarStartX, avatarStartY, fakePersonal, fakeCouple, money, couple, lang, cardOffset, transactionOffset)
			).then(c => c.canvas.toBuffer("image/png"))
			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { files: [{ name: "money.png", file: buffer }] })
		}
	},
	{
		name: "leaderboard",
		description: "Shows the leaderboard for top users of money",
		category: "money",
		async process(cmd, lang) {
			if (!confprovider.config.db_enabled) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.DATABASE_OFFLINE
				})
			}

			const itemsPerPage = 15

			const rows = await sql.all<{ user_id: string, amount: string }>(`SELECT bank_access.user_id, bank_accounts.amount FROM bank_accounts INNER JOIN bank_access ON bank_accounts.id = bank_access.id WHERE bank_accounts.type = 0 ORDER BY bank_accounts.amount DESC LIMIT ${itemsPerPage}`)

			const displayRows = await Promise.all(rows.map(async ({ user_id, amount }, index) => {
				const tag = await sharedUtils.getUser(user_id, client.snow, client)
					.then(user => user
						? sharedUtils.userString(user)
						: user_id)
					.catch(() => user_id)

				const ranking = index + 1
				return [`${ranking}. ${sharedUtils.numberComma(amount)}`, tag]
			}))

			const table = sharedUtils.tableifyRows(displayRows, ["left", "left"], () => "`")

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				embeds: [
					{
						author: { name: "Leaderboard" },
						description: table.join("\n"),
						color: confprovider.config.standard_embed_color
					}
				]
			})
		}
	},
	{
		name: "give",
		description: "Gives another user money",
		category: "money",
		options: [
			{
				name: "amount",
				type: 4,
				description: "The amount of money to give",
				required: true,
				min_value: 1
			},
			{
				name: "user",
				type: 6,
				description: "The user to give money to",
				required: true
			}
		],
		async process(cmd, lang) {
			if (!confprovider.config.db_enabled) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.DATABASE_OFFLINE
				})
			}

			const user = cmd.data.users.get(cmd.data.options.get("user")!.asString()!)!
			const amount = BigInt(cmd.data.options.get("amount")!.asNumber()!)

			if (user.id == cmd.author.id) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.CANNOT_GIVE_SELF
				})
			}

			const authorCoins = await moneyManager.getPersonalRow(cmd.author.id)
			if (amount > BigInt(authorCoins.amount)) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.NOT_ENOUGH_MONEY
				})
			}

			moneyManager.transact(cmd.author.id, user.id, amount)
			client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				content: langReplace(lang.GLOBAL.GIVEN_TO_OTHER, { "amount": sharedUtils.numberComma(amount), "user": sharedUtils.userString(user) })
			})
		}
	},
	{
		name: "wheel",
		description: "Spin the wheel of (mis)fortune",
		category: "money",
		options: [
			{
				name: "amount",
				type: 4,
				description: "The amount of money to bet",
				required: true,
				min_value: 2
			}
		],
		async process(cmd, lang) {
			if (!confprovider.config.db_enabled) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.DATABASE_OFFLINE
				})
			}

			const money = await moneyManager.getPersonalRow(cmd.author.id)
			const amount = BigInt(cmd.data.options.get("amount")!.asNumber()!)

			if (amount > BigInt(money.amount)) {
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					content: lang.GLOBAL.NOT_ENOUGH_MONEY
				})
			}

			const choices = [[0, 0], [1, 0], [2, 5], [3, 2], [4, 0], [5, 1], [6, 0], [7, 0]] as Array<[number, number]>
			const choice = sharedUtils.arrayRandom(choices)

			const image = await fs.promises.readFile(path.join(__dirname, `../../images/precalculated/${choice[0]}.png`))

			const award = (amount * BigInt(choice[1])) - amount
			await moneyManager.awardAmount(cmd.author.id, award, `Wheel Of ${award <= BigInt(0) ? "Misf" : "F"}ortune`)
			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: sharedUtils.numberComma(award), files: [{ name: "wheel.png", file: image }] })
		}
	},
	{
		name: "profile",
		description: "Gets a user's Amanda profile",
		category: "money",
		options: [
			{
				name: "user",
				type: 6,
				description: "The user's profile to get",
				required: false
			},
			{
				name: "light",
				type: 5,
				description: "If light mode should be force used (default false)",
				required: false
			}
		],
		async process(cmd) {
			const user = cmd.data.users.get(cmd.data.options.get("user")?.asString() ?? "") ?? cmd.author
			const light = cmd.data.options.get("light")?.asBoolean() ?? false
			const lightSpecified = !!cmd.data.options.get("light")

			let themeoverlay: "profile" | "profile-light" = "profile"
			if (lightSpecified) {
				themeoverlay = light ? "profile-light" : "profile"
			} else {
				const themedata = await sql.orm.get("settings", { user_id: user.id, key: "profiletheme" })
				if (themedata?.value == "light") themeoverlay = "profile-light"
			}

			const [isPremium, money, info, avatar, images] = await Promise.all([
				sql.orm.get("premium", { user_id: user.id }),
				moneyManager.getPersonalRow(user.id),
				moneyManager.getCoupleRow(user.id),
				Canvas.loadImage(sharedUtils.displayAvatarURL(user)),
				imageCache.getAll([
					"defaultbg",
					"vicinity",
					"sakura",
					"profile",
					"profile-light",
					"old-profile",
					"old-profile-light",
					"heart-full",
					"heart-broken",
					"badge-developer",
					"badge-donator",
					"circle-mask",
					"profile-background-mask",
					"badge-giver1",
					"badge-giver2",
					"badge-giver3",
					"badge-giver4",
					"discoin"
				])
			])

			const heartType = getHeartType(user, !!info)
			const heart = images.get(`heart-${heartType}`)!

			const badge = user.id === "320067006521147393"
				? "badge-developer" as const
				: isPremium?.state
					? "badge-donator" as const
					: null

			const amandollars = BigInt(money.amount)

			const badgeImage = badge ? images.get(badge)! : null
			const giverImage = amandollars >= giverTier4
				? images.get("badge-giver4")!
				: amandollars >= giverTier3
					? images.get("badge-giver3")!
					: amandollars >= giverTier2
						? images.get("badge-giver2")!
						: amandollars >= giverTier1
							? images.get("badge-giver1")!
							: null

			const job = await getOverlay(user, images, themeoverlay)

			const c = Canvas.createCanvas(800, 500)
			const ctx = c.getContext("2d")
			let bgimg: Canvas.Image | undefined = undefined
			if (user.id === "320067006521147393" || isPremium) {
				try {
					bgimg = await Canvas.loadImage(path.join(imageCacheDirectory, `${user.id}.png`))
					if (!bgimg) throw new Error("NOTHING")
				} catch {
					bgimg = await getDefaultBG(user, images)
				}
			} else bgimg = await getDefaultBG(user, images)

			if (!bgimg) throw new Error("SHIT YOURSELF NOW")

			if (themeoverlay === "profile") ctx.fillStyle = "#ffffff"
			else ctx.fillStyle = "#000000"

			let others: Array<APIUser> | null = null
			if (info) others = await Promise.all(info.users.filter(u => u !== user.id).map(u => sharedUtils.getUser(u, client.snow, client)))

			if (job.style == "old") buildOldProfile(ctx, user, others, amandollars, bgimg, job, avatar, images.get("discoin")!, heart, badgeImage, giverImage)
			else buildNewProfile(ctx, user, others, amandollars, bgimg, images.get("profile-background-mask")!, job, avatar, images.get("circle-mask")!, images.get("discoin")!, heart, badgeImage, giverImage)

			const buffer = c.toBuffer("image/png")

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				files: [
					{
						name: "profile.png",
						file: buffer
					}
				]
			})
		}
	}
])
