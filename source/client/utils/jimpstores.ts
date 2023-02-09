import path from "path"

import passthrough from "../../passthrough"
const { sync } = passthrough

const [ImageCache, FontCache] = [sync.require("./classes/ImageCache"), sync.require("./classes/FontCache")] as [typeof import("./classes/ImageCache"), typeof import("./classes/FontCache")]

const imageStore = new ImageCache.ImageCache()
const fontStore = new FontCache.FontCache()

const rootDir = path.join(__dirname, "../../../")

// Backgrounds
imageStore.save("slot-background", path.join(rootDir, "./images/backgrounds/commands/slot.png"))
imageStore.save("wheel-canvas", path.join(rootDir, "./images/backgrounds/commands/wheel.png"))
imageStore.save("bank", path.join(rootDir, "./images/backgrounds/commands/bank.png"))
imageStore.save("card1", path.join(rootDir, "./images/backgrounds/commands/card.png"))
imageStore.save("card2", path.join(rootDir, "./images/backgrounds/commands/card2.png"))
imageStore.save("canvas", path.join(rootDir, "./images/backgrounds/defaultbg.png"))
imageStore.save("canvas-vicinity", path.join(rootDir, "./images/backgrounds/vicinity.png"))
imageStore.save("canvas-sakura", path.join(rootDir, "./images/backgrounds/sakura.png"))

// Overlays
imageStore.save("slot-amanda", path.join(rootDir, "./images/overlays/slot-amanda-carsaleswoman.png"))
imageStore.save("slot-machine", path.join(rootDir, "./images/overlays/slot-machine.png"))
imageStore.save("slot-top", path.join(rootDir, "./images/overlays/slot-top-layer.png"))
imageStore.save("profile", path.join(rootDir, "./images/overlays/profile.png"))
imageStore.save("profile-light", path.join(rootDir, "./images/overlays/profile_light.png"))
imageStore.save("old-profile", path.join(rootDir, "./images/overlays/profile_old.png"))
imageStore.save("old-profile-light", path.join(rootDir, "./images/overlays/profile_old_light.png"))

// Emojis
imageStore.save("emoji-apple", path.join(rootDir, "./images/emojis/apple.png"))
imageStore.save("emoji-cherries", path.join(rootDir, "./images/emojis/cherries.png"))
imageStore.save("emoji-heart", path.join(rootDir, "./images/emojis/heart.png"))
imageStore.save("emoji-pear", path.join(rootDir, "./images/emojis/pear.png"))
imageStore.save("emoji-strawberry", path.join(rootDir, "./images/emojis/strawberry.png"))
imageStore.save("emoji-watermelon", path.join(rootDir, "./images/emojis/watermelon.png"))
imageStore.save("emoji-triangle", path.join(rootDir, "./images/emojis/triangle.png"))
imageStore.save("heart-full", path.join(rootDir, "./images/emojis/pixel-heart.png"))
imageStore.save("heart-broken", path.join(rootDir, "./images/emojis/pixel-heart-broken.png"))
imageStore.save("discoin", path.join(rootDir, "./images/emojis/discoin.png"))

// Badges
imageStore.save("badge-developer", path.join(rootDir, "./images/badges/Developer_50x50.png"))
imageStore.save("badge-donator", path.join(rootDir, "./images/badges/Donator_50x50.png"))
imageStore.save("badge-hunter", path.join(rootDir, "./images/badges/Hunter_50x50.png"))
imageStore.save("badge-booster", path.join(rootDir, "./images/badges/Booster_50x50.png"))
imageStore.save("badge-giver1", path.join(rootDir, "./images/badges/GivingHand_50x50.png"))
imageStore.save("badge-giver2", path.join(rootDir, "./images/badges/GivingHandTier2_50x50.png"))
imageStore.save("badge-giver3", path.join(rootDir, "./images/badges/GivingHandTier3_50x50.png"))
imageStore.save("badge-giver4", path.join(rootDir, "./images/badges/GivingHandTier4_50x50.png"))

// Masks
imageStore.save("circle-mask", path.join(rootDir, "./images/masks/circle_mask.png"))
imageStore.save("profile-background-mask", path.join(rootDir, "./images/masks/profile_background_mask.png"))
imageStore.save("card-overlap-mask", path.join(rootDir, "./images/masks/card_overlap_mask.png"))
imageStore.save("circle-overlap-mask", path.join(rootDir, "./images/masks/circle_overlap_mask.png"))

// Icons
imageStore.save("neko", path.join(rootDir, "./images/icons/NEKO.png"))
imageStore.save("add-circle", path.join(rootDir, "./images/icons/add_circle.png"))

// Fonts
fontStore.save("whitney-20", path.join(rootDir, ".fonts/Whitney-20.fnt"))
fontStore.save("whitney-20-2", path.join(rootDir, ".fonts/profile/Whitney-20-aaa.fnt"))
fontStore.save("whitney-20-2-black", path.join(rootDir, ".fonts/profile/Whitney-20-aaa-black.fnt"))
fontStore.save("whitney-25", path.join(rootDir, ".fonts/Whitney-25.fnt"))
fontStore.save("whitney-25-black", path.join(rootDir, ".fonts/Whitney-25-black.fnt"))
fontStore.save("arial-16", path.join(rootDir, ".fonts/Arial-16.fnt"))
fontStore.save("arial-24", path.join(rootDir, ".fonts/Arial-24.fnt"))
fontStore.save("bahnschrift-22", path.join(rootDir, ".fonts/Bahnschrift-22.fnt"))
fontStore.save("bahnschrift-22-red", path.join(rootDir, ".fonts/Bahnschrift-22-red.fnt"))
fontStore.save("bahnschrift-22-green", path.join(rootDir, ".fonts/Bahnschrift-22-green.fnt"))

export { imageStore as images, fontStore as fonts }
