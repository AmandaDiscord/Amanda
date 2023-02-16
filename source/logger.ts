/* eslint-disable @typescript-eslint/ban-ts-comment */
import { BackTracker } from "backtracker"

const scopeNameMaxLogLength = 20

// @ts-ignore
console._oldLog = console._oldLog || console.log; console._oldWarn = console._oldWarn || console.warn; console._oldErr = console._oldErr || console.error

const T = /T/
const Z = /Z/

function getPrefix(type: "warn" | "info" | "error") {
	const stack = BackTracker.stack
	const first = stack[1]
	const scope = `${first.srcFilename}:${first.srcLine}:${first.srcColumn}`
	const color = type === "warn" ? "\x1b[93m" : type === "error" ? "\x1b[91m" : "\x1b[92m"
	return `\x1b[90m${new Date().toISOString().replace(T, " ").replace(Z, "")} ${type.length === 4 ? " " : ""}${color}${type.toUpperCase()} \x1b[0m--- \x1b[36m${scope}${" ".repeat((scopeNameMaxLogLength - scope.length) < 1 ? 1 : scopeNameMaxLogLength - scope.length)}\x1b[0m :`
}

function post(type: "info" | "warn" | "error", ...data: Array<any>): void {
	// @ts-ignore
	const fn = type === "info" ? console._oldLog : type === "warn" ? console._oldWarn : console._oldErr
	fn(getPrefix(type), ...data)
}

console.log = post.bind(null, "info")
console.warn = post.bind(null, "warn")
console.error = post.bind(null, "error")

export = { getPrefix, post } // heat sync requires it to be an object
