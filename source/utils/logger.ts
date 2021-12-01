import { BackTracker } from "backtracker"

import passthrough from "../passthrough"
const { sync } = passthrough

const text = sync.require("./string") as typeof import("./string")

const workerNameMaxLogLength = 10
const scopeNameMaxLogLength = 15

export function post(err: boolean, value: string) {
	err ? console.error(value) : console.log(value)
}

export function getPrefix(type: "warn" | "info" | "error", worker: string) {
	const first = BackTracker.stack[1]
	const scope = `${first.filename.replace(/\.js$/, "")}:${first.line}:${first.column}`
	const color = type === "warn" ? "\x1b[93m" : type === "error" ? "\x1b[91m" : "\x1b[92m"
	// 2021-01-01 00:00:00 INFO 69420 --- [      main] index:0:0      : Logged in!
	return `\x1b[90m${new Date().toISOString().replace("T", " ").replace("Z", "").replace(/\.\d+/, "")} ${color}${type !== "error" ? `${type} ` : type} \x1b[35m${process.pid} \x1b[0m--- [${" ".repeat((workerNameMaxLogLength - worker.length) < 1 ? 1 : workerNameMaxLogLength - worker.length)}${worker}] \x1b[36m${scope}${" ".repeat((scopeNameMaxLogLength - scope.length) < 1 ? 1 : scopeNameMaxLogLength - scope.length)}\x1b[0m :`
}

export async function warn(message: unknown, worker = "main") {
	post(false, `${getPrefix("warn", worker)} ${await text.stringify(message, 0, true)}`)
}

export async function info(message: unknown, worker = "main") {
	post(false, `${getPrefix("info", worker)} ${await text.stringify(message, 0, true)}`)
}

export async function error(message: unknown, worker = "main") {
	post(true, `${getPrefix("error", worker)} ${await text.stringify(message, 0, true)}`)
}

export default exports as typeof import("./logger")
