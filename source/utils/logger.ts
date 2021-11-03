import { BackTracker } from "backtracker"

import { stringify } from "./text"

const workerNameMaxLogLength = 10
const scopeNameMaxLogLength = 15

const logger = {
	post: (error: boolean, value: string) => {
		error ? console.error(value) : console.log(value)
	},
	getPrefix: (type: "warn" | "info" | "error", worker: string) => {
		const first = BackTracker.stack[1]
		const scope = `${first.filename.replace(/\.js$/, "")}:${first.line}:${first.column}`
		const color = type === "warn" ? "\x1b[93m" : type === "error" ? "\x1b[91m" : "\x1b[92m"
		// 2021-01-01 00:00:00 INFO 69420 --- [      main] index:0:0      : Logged in!
		return `\x1b[90m${new Date().toISOString().replace("T", " ").replace("Z", "").replace(/\.\d+/, "")} ${color}${type !== "error" ? `${type} ` : type} \x1b[35m${process.pid} \x1b[0m--- [${" ".repeat((workerNameMaxLogLength - worker.length) < 1 ? 1 : workerNameMaxLogLength - worker.length)}${worker}] \x1b[36m${scope}${" ".repeat((scopeNameMaxLogLength - scope.length) < 1 ? 1 : scopeNameMaxLogLength - scope.length)}\x1b[0m :`
	},
	warn: async (message: unknown, worker = "main") => {
		logger.post(false, `${logger.getPrefix("warn", worker)} ${await stringify(message)}`)
	},
	info: async (message: unknown, worker = "main") => {
		logger.post(false, `${logger.getPrefix("info", worker)} ${await stringify(message)}`)
	},
	error: async (message: unknown, worker = "main") => {
		logger.post(true, `${logger.getPrefix("error", worker)} ${await stringify(message)}`)
	}
}

export = logger
