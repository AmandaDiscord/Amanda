import path = require("path")

import Canvas = require("canvas")

import { AsyncValueCache } from "@amanda/shared-utils"

const images = {
	"defaultbg": "backgrounds/defaultbg.png",
	"sakura": "backgrounds/sakura.png",
	"vicinity": "backgrounds/vicinity.png",
	"slot-background": "backgrounds/commands/slot.png",
	"bank": "backgrounds/commands/bank.png",
	"card1": "backgrounds/commands/card.png",
	"card2": "backgrounds/commands/card2.png",

	"badge-developer": "badges/Developer_50x50.png",
	"badge-donator": "badges/Donator_50x50.png",
	"badge-giver1": "badges/GivingHand_50x50.png",
	"badge-giver2": "badges/GivingHandTier2_50x50.png",
	"badge-giver3": "badges/GivingHandTier3_50x50.png",
	"badge-giver4": "badges/GivingHandTier4_50x50.png",

	"apple": "emojis/apple-warped.png",
	"cherries": "emojis/cherries-warped.png",
	"discoin": "emojis/discoin.png",
	"heart": "emojis/heart-warped.png",
	"heart-broken": "emojis/pixel_heart_broken.png",
	"heart-full": "emojis/pixel_heart.png",
	"pear": "emojis/pear-warped.png",
	"strawberry": "emojis/strawberry-warped.png",
	"triangle": "emojis/triangle.png",
	"watermelon": "emojis/watermelon-warped.png",

	"add-circle": "icons/add_circle.png",
	"neko": "icons/NEKO.png",

	"card-overlap-mask": "masks/card_overlap_mask.png",
	"circle-mask": "masks/circle_mask.png",
	"circle-overlap-mask": "masks/circle_overlap_mask.png",
	"profile-background-mask": "masks/profile_background_mask.png",

	"profile-light": "overlays/profile_light.png",
	"old-profile-light": "overlays/profile_old_light.png",
	"old-profile": "overlays/profile_old.png",
	"profile": "overlays/profile.png",
	"slot-jackpot": "overlays/JACKPOT.png",
	"slot-win": "overlays/YOUWIN.png",
	"slot-lost": "overlays/YOULOST.png"
}

import type { UnpackArray } from "@amanda/shared-types"

const rootImageDir = path.join(__dirname, "../images")

class ImageCache {
	private _cache: Record<keyof typeof images, AsyncValueCache<Canvas.Image>>

	public constructor() {
		const temp = {} as Record<keyof typeof images, AsyncValueCache<Canvas.Image>>

		for (const [key, value] of Object.entries(images)) {
			temp[key] = new AsyncValueCache(() => Canvas.loadImage(path.join(rootImageDir, value)))
		}

		this._cache = temp
	}

	public get(key: keyof typeof images): Promise<Canvas.Image> {
		return this._cache[key].get()
	}

	public async getAll<T extends Array<keyof typeof images>, R extends UnpackArray<T>>(keys: T): Promise<Map<R, Canvas.Image>> {
		const rt = new Map<R, Canvas.Image>()

		for (const key of keys) {
			rt.set(key as R, await this.get(key))
		}

		return rt
	}
}

const imageCacheInstance = new ImageCache()

export = imageCacheInstance
