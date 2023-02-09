import passthrough from "../../passthrough"
const { sync } = passthrough

const [ImageCache, FontCache] = [sync.require("./classes/ImageCache"), sync.require("./classes/FontCache")] as [typeof import("./classes/ImageCache"), typeof import("./classes/FontCache")]

const imageStore = new ImageCache.ImageCache()
const fontStore = new FontCache.FontCache()

// Backgrounds
imageStore.save("slot-background", "../images/backgrounds/commands/slot.png")
imageStore.save("wheel-canvas", "../images/backgrounds/commands/wheel.png")
imageStore.save("bank", "../images/backgrounds/commands/bank.png")
imageStore.save("card1", "../images/backgrounds/commands/card.png")
imageStore.save("card2", "../images/backgrounds/commands/card2.png")
imageStore.save("canvas", "../images/backgrounds/defaultbg.png")
imageStore.save("canvas-vicinity", "../images/backgrounds/vicinity.png")
imageStore.save("canvas-sakura", "../images/backgrounds/sakura.png")

// Overlays
imageStore.save("slot-amanda", "../images/overlays/slot-amanda-carsaleswoman.png")
imageStore.save("slot-machine", "../images/overlays/slot-machine.png")
imageStore.save("slot-top", "../images/overlays/slot-top-layer.png")
imageStore.save("profile", "../images/overlays/profile.png")
imageStore.save("profile-light", "../images/overlays/profile_light.png")
imageStore.save("old-profile", "../images/overlays/profile_old.png")
imageStore.save("old-profile-light", "../images/overlays/profile_old_light.png")

// Emojis
imageStore.save("emoji-apple", "../images/emojis/apple.png")
imageStore.save("emoji-cherries", "../images/emojis/cherries.png")
imageStore.save("emoji-heart", "../images/emojis/heart.png")
imageStore.save("emoji-pear", "../images/emojis/pear.png")
imageStore.save("emoji-strawberry", "../images/emojis/strawberry.png")
imageStore.save("emoji-watermelon", "../images/emojis/watermelon.png")
imageStore.save("emoji-triangle", "../images/emojis/triangle.png")
imageStore.save("heart-full", "../images/emojis/pixel-heart.png")
imageStore.save("heart-broken", "../images/emojis/pixel-heart-broken.png")
imageStore.save("discoin", "../images/emojis/discoin.png")

// Badges
imageStore.save("badge-developer", "../images/badges/Developer_50x50.png")
imageStore.save("badge-donator", "../images/badges/Donator_50x50.png")
imageStore.save("badge-hunter", "../images/badges/Hunter_50x50.png")
imageStore.save("badge-booster", "../images/badges/Booster_50x50.png")
imageStore.save("badge-giver1", "../images/badges/GivingHand_50x50.png")
imageStore.save("badge-giver2", "../images/badges/GivingHandTier2_50x50.png")
imageStore.save("badge-giver3", "../images/badges/GivingHandTier3_50x50.png")
imageStore.save("badge-giver4", "../images/badges/GivingHandTier4_50x50.png")

// Masks
imageStore.save("circle-mask", "../images/masks/circle_mask.png")
imageStore.save("profile-background-mask", "../images/masks/profile_background_mask.png")
imageStore.save("card-overlap-mask", "../images/masks/card_overlap_mask.png")
imageStore.save("circle-overlap-mask", "../images/masks/circle_overlap_mask.png")

// Icons
imageStore.save("neko", "../images/icons/NEKO.png")
imageStore.save("add-circle", "../images/icons/add_circle.png")

// Fonts
fontStore.save("whitney-20", "../.fonts/Whitney-20.fnt")
fontStore.save("whitney-20-2", "../.fonts/profile/Whitney-20-aaa.fnt")
fontStore.save("whitney-20-2-black", "../.fonts/profile/Whitney-20-aaa-black.fnt")
fontStore.save("whitney-25", "../.fonts/Whitney-25.fnt")
fontStore.save("whitney-25-black", "../.fonts/Whitney-25-black.fnt")
fontStore.save("arial-16", "../.fonts/Arial-16.fnt")
fontStore.save("arial-24", "../.fonts/Arial-24.fnt")
fontStore.save("bahnschrift-22", "../.fonts/Bahnschrift-22.fnt")
fontStore.save("bahnschrift-22-red", "../.fonts/Bahnschrift-22-red.fnt")
fontStore.save("bahnschrift-22-green", "../.fonts/Bahnschrift-22-green.fnt")

export { imageStore as images, fontStore as fonts }
