import { BackTracker } from "backtracker"

const scopeNameMaxLogLength = 20

const oldLog = console.log
const oldWarn = console.warn
const oldErr = console.error

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
	const fn = type === "info" ? oldLog : type === "warn" ? oldWarn : oldErr
	fn(getPrefix(type), ...data)
}

console.log = post.bind(null, "info")
console.warn = post.bind(null, "warn")
console.error = post.bind(null, "error")
