const Jimp = require("jimp")

const [ImageCache, FontCache] = [require("./classes/ImageCache"), require("./classes/FontCache")]

const imageStore = new ImageCache()
const fontStore = new FontCache()

// Backgrounds
imageStore.save("slot-background", "./images/backgrounds/commands/slot.png")
imageStore.save("wheel-canvas", "./images/backgrounds/commands/wheel.png")
imageStore.save("canvas", "./images/backgrounds/defaultbg.png")
imageStore.save("canvas-vicinity", "./images/backgrounds/vicinity.png")
imageStore.save("canvas-sakura", "./images/backgrounds/sakura.png")

// Overlays
imageStore.save("slot-amanda", "./images/overlays/slot-amanda-carsaleswoman.png")
imageStore.save("slot-machine", "./images/overlays/slot-machine.png")
imageStore.save("slot-top", "./images/overlays/slot-top-layer.png")
imageStore.save("profile", "./images/overlays/profile.png")
imageStore.save("profile-light", "./images/overlays/profile_light.png")
imageStore.save("old-profile", "./images/overlays/profile_old.png")
imageStore.save("old-profile-light", "./images/overlays/profile_old_light.png")

// Emojis
imageStore.save("emoji-apple", "./images/emojis/apple.png")
imageStore.save("emoji-cherries", "./images/emojis/cherries.png")
imageStore.save("emoji-heart", "./images/emojis/heart.png")
imageStore.save("emoji-pear", "./images/emojis/pear.png")
imageStore.save("emoji-strawberry", "./images/emojis/strawberry.png")
imageStore.save("emoji-watermelon", "./images/emojis/watermelon.png")
imageStore.save("emoji-triangle", "./images/emojis/triangle.png")
imageStore.save("heart-full", "./images/emojis/pixel-heart.png")
imageStore.save("heart-broken", "./images/emojis/pixel-heart-broken.png")
imageStore.save("discoin", "./images/emojis/discoin.png")

// Badges
imageStore.save("badge-developer", "./images/badges/Developer_50x50.png")
imageStore.save("badge-donator", "./images/badges/Donator_50x50.png")
imageStore.save("badge-hunter", "./images/badges/Hunter_50x50.png")
imageStore.save("badge-booster", "./images/badges/Booster_50x50.png")
imageStore.save("badge-giver1", "./images/badges/GivingHand_50x50.png")
imageStore.save("badge-giver2", "./images/badges/GivingHandTier2_50x50.png")
imageStore.save("badge-giver3", "./images/badges/GivingHandTier3_50x50.png")

// Masks
imageStore.save("circle-mask", "./images/masks/circle_mask.png")


fontStore.save("whitney-20", ".fonts/Whitney-20.fnt")
fontStore.save("whitney-20-2", ".fonts/profile/Whitney-20-aaa.fnt")
fontStore.save("whitne-20-2-black", ".fonts/profile/Whitney-20-aaa-black.fnt")
fontStore.save("whitney-25", ".fonts/Whitney-25.fnt")
fontStore.save("whitney-25-black", ".fonts/Whitney-25-black.fnt")


;["apple", "cherries", "heart", "pear", "strawberry", "watermelon"].forEach(i => imageStore.get(`emoji-${i}`).then(image => image.resize(85, 85)))
imageStore.get("emoji-triangle").then(image => image.resize(50, 50, Jimp.RESIZE_NEAREST_NEIGHBOR))
imageStore.get("badge-hunter").then(badge => badge.resize(34, 34))

module.exports.images = imageStore
module.exports.fonts = fontStore
