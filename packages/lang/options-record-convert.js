// @ts-check

const fs = require("fs")
const path = require("path")

/** @type {["GLOBAL"]} */
const exclude = ["GLOBAL"]

// require caches results and if en-us is modified, then fuck LOL
const english = JSON.parse(fs.readFileSync(path.join(__dirname, "./localizations/en-us.json"), { encoding: "utf-8" }))

const paths = fs.readdirSync(path.join(__dirname, "./localizations"))

/** @type {Array<typeof import("./localizations/en-us.json")>} */
const langs = paths.map(i => require(`./localizations/${i}`))

for (let i = 0; i < langs.length; i++) {
	const lang = langs[i]
	const name = paths[i]

	for (const key of Object.keys(lang)) {
		/** @type {Exclude<keyof lang, import("@amanda/shared-types").UnpackArray<typeof exclude>>} */
		// @ts-expect-error SHUT UP!!!
		const k = key
		// @ts-expect-error SHUT UP!!!
		if (exclude.includes(k)) continue

		const command = lang[k]
		/** @type {typeof command & { options?: Array<{ name: string, description: string, options?: Array<{ name: string, description: string }> }> }} */
		const asWithOptions = command
		/** @type {typeof command & { options?: Record<string, { name: string, description: string, options?: Array<{ name: string, description: string }> }> }} */
		// @ts-expect-error Assignment
		const asWithOptionsRecord = command

		if (asWithOptions.options) {
			const opts = asWithOptions.options

			/** @type {typeof command & { options?: Array<{ name: string, description: string, options?: Array<{ name: string, description: string }> }> }} */
			const englishOpts = english[k]
			if (!englishOpts.options) {
				console.error(`Command ${command.name} has options that the english command doesn't have`)
				continue
			}

			if (opts.length !== englishOpts.options.length) {
				console.error(`Command ${command.name} has more of fewer options than the english command`)
				continue
			}

			asWithOptionsRecord.options = {}

			for (let i2 = 0; i2 < opts.length; i2++) {
				const opt = opts[i2]
				const enOption = englishOpts.options[i2]
				asWithOptionsRecord.options[enOption.name] = opt

				if (opt.options) {
					if (!enOption.options) {
						console.error(`Option ${opt.name} from command ${command.name} has options that the english command option doesn't have`)
						continue
					}

					if (opt.options.length !== enOption.options.length) {
						console.error(`Option ${opt.name} from command ${command.name} has more or fewer options that the english command option`)
						continue
					}

					const opts2 = opt.options

					/** @type {{ name: string, description: string, options: Record<string, { name: string, description: string }>}} */
					// @ts-expect-error Assignment
					const opt2AsRecord = opt
					opt2AsRecord.options = {}

					for (let i3 = 0; i3 < opts2.length; i3++) {
						const opt2 = opts2[i3]
						const enOption2 = enOption.options[i3]

						opt2AsRecord.options[enOption2.name] = opt2
					}
				}
			}
		}
	}

	fs.writeFileSync(path.join(__dirname, "./localizations", name), JSON.stringify(lang, null, "\t"))
	console.log(`Done with ${name}`)
}
