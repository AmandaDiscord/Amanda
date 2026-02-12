// @ts-check

// Could also be useful (for testing) if we had a clean option to remove packages/*/dist (recursively)

// Scan packages/*/package.json to build dependency tree in memory

/**
 * @typedef {{ name: string, dependencies: { [package: string]: string }, scripts: { [name: string]: string }}} PackageJson
 */

void 0

const fs = require("fs")
const path = require("path")
const childProcess = require("child_process")
const chalk = require("chalk")
const assert = require("assert/strict")
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
		for(var i = 0, h = 0; i < str.length; i++) {
			h = Math.imul(31, h) + str.charCodeAt(i) | 0
		}
		return Math.abs(h)
	}

	/**
	 * @param {string} label
	 * @param {number} longestName
	 * @param {import("child_process").ChildProcessWithoutNullStreams} proc
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

		const color = isError ? "red" : this.color
		const channel = isError ? "stderr" : "stdout"
		for (let line of content.split("\n")) {
			if (line) {
				try {
					process[channel].write(`${chalk[color](this.label.padEnd(this.longestName))}  ${line}\n`)
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
	task
	/** @type {string} */
	packageName
	/** @type {string} */
	folderName
	/** @type {typeof packagePool} */
	pool

	/**
	 * @param {typeof packagePool} pool
	 * @param {string} packageName
	 * @param {string} folderName
	 */
	constructor(pool, packageName, folderName) {
		this.pool = pool
		this.packageName = packageName
		this.folderName = folderName
		this.path = path.join(toPackages, folderName)
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

	/** @returns {Promise<void>} */
	buildSelf() {
		let proc
		if (process.platform === "win32") {
			proc = childProcess.spawn(`cd /d "${this.path}" && npm run build`, {
				shell: true,
			})
		} else {
			proc = childProcess.spawn("npm run build", {
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
	 */
	create(name, folder) {
		this.packages.set(name, new Package(this, name, folder))
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

const mode = "clean" in minimist(process.argv.slice(2)) ? "clean" : "build"

switch (mode) {
	case "build": {
		/** @type {Array<PackageJson>} */
		const allPkgJSONs = []

		for (const p of packageFolders) {
			const toPkgJSON = path.join(toPackages, p, "package.json")
			if (fs.existsSync(toPkgJSON)) {
				const data = fs.readFileSync(toPkgJSON, { encoding: "utf-8" })
				const json = JSON.parse(data)
				if (!json.scripts?.build) continue
				packagePool.create(json.name, p)
				allPkgJSONs.push(json)
			}
		}

		for (const json of allPkgJSONs) {
			if (!json.dependencies) continue
			packagePool.add(json.name, json.dependencies)
		}

		packagePool.buildAll()

		break;
	}

	case "clean": {
		for (const folder of packageFolders) {
			const toDist = path.join(toPackages, folder, "dist")
			if (fs.existsSync(toDist)) {
				console.log(`Removing ${toDist}`)
				fs.rmSync(toDist, { recursive: true })
			}
		}
	}
}
