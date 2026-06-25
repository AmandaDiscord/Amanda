// @ts-check

// Could also be useful (for testing) if we had a clean option to remove packages/*/dist (recursively)

// Scan packages/*/package.json to build dependency tree in memory

/**
 * @typedef {{ name: string, dependencies: { [package: string]: string }, scripts: { [name: string]: string }}} PackageJson
 */

void 0

const fs = require("node:fs")
const path = require("node:path")
const childProcess = require("node:child_process")
const chalk = require("chalk")
const assert = require("node:assert/strict")
const minimist = require("minimist")

const toPackages = path.join(__dirname, "../packages")

class ManagedSubprocess {
	static colors = ["yellow", "green", "cyan", "magenta", "grey", "white", "greenBright", "yellowBright", "blueBright", "magentaBright", "cyanBright"]
	/** @type {Promise<void>} */
	task
	/** @type {string} */
	label
	/** @type {string} */
	color
	/** @type {number} */
	longestName

	/** @param {string} str */
	static hashCode(str) {
		let h = 0
		for (let i = 0; i < str.length; i++) {
			h = Math.trunc(
				Math.imul(31, h) +
				// @ts-expect-error It's fine
				str.codePointAt(i)
			)
		}
		return Math.abs(h)
	}

	/**
	 * @param {string} label
	 * @param {number} longestName
	 * @param {import("node:child_process").ChildProcessWithoutNullStreams} proc
	 */
	constructor(label, longestName, proc) {
		this.label = label
		this.longestName = longestName
		this.proc = proc

		const { promise, resolve, reject } = Promise.withResolvers()
		this.task = promise

		const hash = ManagedSubprocess.hashCode(this.label)
		this.color = ManagedSubprocess.colors[hash % ManagedSubprocess.colors.length]

		this.proc.stdout.on("data", this.printOutput.bind(this, false))
		this.proc.stderr.on("data", this.printOutput.bind(this, true))

		this.proc.on("close", code => {
			if (code === 0) {
				resolve(void 0)
			} else {
				reject(`build command for ${this.label} failed`)
			}
		})
	}

	/**
	 * @param {boolean} isError
	 * @param {Buffer} data
	 */
	printOutput(isError, data) {
		const content = data.toString()

		/** @type {"red"} */
		// @ts-expect-error
		const color = isError ? "red" : this.color
		const channel = isError ? "stderr" : "stdout"
		for (let line of content.split("\n")) {
			if (line) {
				try {
					process[channel].write(`${chalk.default[color](this.label.padEnd(this.longestName))}  ${line}\n`)
				} catch (e) {
					console.log(channel, color)
					throw e
				}
			}
		}
	}
}

class Package {
	/** @type {Array<Package>} */
	upstream = []
	/** @type {Promise<void>?} */
	task = null
	/** @type {string} */
	packageName
	/** @type {string} */
	folderName
	/** @type {typeof packagePool} */
	pool
	/** @type {string} */
	script

	/**
	 * @param {typeof packagePool} pool
	 * @param {string} packageName
	 * @param {string} folderName
	 * @param {string} script
	 */
	constructor(pool, packageName, folderName, script) {
		this.pool = pool
		this.packageName = packageName
		this.folderName = folderName
		this.path = path.join(toPackages, folderName)
		this.script = script
	}

	/** @returns {Promise<void>} */
	async build() {
		// Only build once even if multiple downstreams ask this to build
		if (this.task) return this.task

		// Mark this as currently building
		const { promise, reject, resolve } = Promise.withResolvers()
		this.task = promise

		// Make sure all dependencies are built
		await Promise.all(this.upstream.map(p => p.build()))

		this.buildSelf().then(resolve).catch(reject)

		return promise
	}

	/**
	 * @returns {Promise<void>}
	 */
	buildSelf() {
		let proc
		if (process.platform === "win32") {
			proc = childProcess.spawn(`cd /d "${this.path}" && npm run ${this.script}`, {
				shell: true,
			})
		} else {
			proc = childProcess.spawn(`npm run ${this.script}`, {
				shell: true,
				cwd: this.path
			})
		}
		const managed = new ManagedSubprocess(this.packageName, this.pool.getLongestName(), proc)
		return managed.task
	}
}

const packagePool = new class PackagePool {
	/** @type {Map<string, Package>} */
	packages = new Map()

	/**
	 * @param {string} name
	 * @param {string} folder
	 * @param {string} script
	 */
	create(name, folder, script) {
		this.packages.set(name, new Package(this, name, folder, script))
	}

	/**
	 * @param {string} name
	 * @param {PackageJson["dependencies"]} deps
	 */
	add(name, deps) {
		const main = this.packages.get(name)
		assert(main)
		for (const depName of Object.keys(deps)) {
			const up = this.packages.get(depName)
			if (!up) continue // not part of the packages that we are building
			main.upstream.push(up)
		}
	}

	async buildAll() {
		await Promise.all([...this.packages.values()].map(p => p.build()))
	}

	getLongestName() {
		return Math.max(...[...this.packages.keys()].map(name => name.length))
	}
}

const packageFolders = fs.readdirSync(toPackages)

const otherModes = ["clean", "lint"]

const mode = otherModes.find(m => m in minimist(process.argv.slice(2)) ? m : undefined) ?? "build"

if (mode === "clean") {
	for (const folder of packageFolders) {
		const toDist = path.join(toPackages, folder, "dist")
		if (fs.existsSync(toDist)) {
			console.log(`Removing ${toDist}`)
			fs.rmSync(toDist, { recursive: true })
		}
	}
} else {
	/** @type {Array<PackageJson>} */
	const allPkgJSONs = []

	for (const p of packageFolders) {
		const toPkgJSON = path.join(toPackages, p, "package.json")
		if (fs.existsSync(toPkgJSON)) {
			const data = fs.readFileSync(toPkgJSON, { encoding: "utf-8" })
			const json = JSON.parse(data)
			if (!json.scripts?.[mode]) continue
			packagePool.create(json.name, p, mode)
			allPkgJSONs.push(json)
		}
	}

	for (const json of allPkgJSONs) {
		if (!json.dependencies) continue
		packagePool.add(json.name, json.dependencies)
	}

	packagePool.buildAll()
}
