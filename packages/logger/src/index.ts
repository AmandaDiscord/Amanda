import util = require("util")

import { BackTracker } from "backtracker"

const oldLog = console.log
const oldWarn = console.warn
const oldErr = console.error

const scopeNameMaxLogLength = 20

const T = /T/
const Z = /Z/

function getPrefix(type: "warn" | "info" | "error") {
	const stack = BackTracker.stack
	const first = stack[1]
	const scope = `${first.srcFilename}:${first.srcLine}:${first.srcColumn}`
	const color = type === "warn" ? "\x1b[93m" : type === "error" ? "\x1b[91m" : "\x1b[92m"

	const datePart = new Date().toISOString().replace(T, " ").replace(Z, "")
	const dateToTypePadding = type.length === 4 ? " " : ""
	const scopeToLogPadding = " ".repeat((scopeNameMaxLogLength - scope.length) < 1 ? 1 : scopeNameMaxLogLength - scope.length)

	return `\x1b[90m${datePart} ${dateToTypePadding}${color}${type.toUpperCase()} \x1b[0m--- \x1b[36m${scope}${scopeToLogPadding}\x1b[0m :`
}

function post(type: "info" | "warn" | "error", ...data: Array<unknown>): void {
	const fn = type === "info"
		? oldLog
		: type === "warn"
			? oldWarn
			: oldErr

	fn(getPrefix(type), ...data)
}

console.log = post.bind(null, "info")
console.warn = post.bind(null, "warn")
console.error = post.bind(null, "error")

const errorHandler = (reason: unknown) => post("error", util.inspect(reason, false, 5, true))

process.on("unhandledRejection", errorHandler)
process.on("uncaughtException", errorHandler)
