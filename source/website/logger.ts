export function getPrefix(type: "warn" | "info" | "error") {
	const color = type === "warn" ? "\x1b[93m" : type === "error" ? "\x1b[91m" : "\x1b[92m"
	return `\x1b[90m${new Date().toISOString().replace("T", " ").replace("Z", "").replace(/\.\d+/, "")} ${color}${type !== "error" ? `${type} ` : type} \x1b[35m${process.pid} \x1b[0m ---`
}

export function post(err: boolean, value: string) {
	err ? console.error(value) : console.log(value)
}

export async function warn(message: string) {
	post(false, `${getPrefix("warn")} ${message}`)
}

export async function info(message: string) {
	post(false, `${getPrefix("info")} ${message}`)
}

export async function error(message: string) {
	post(true, `${getPrefix("error")} ${message}`)
}

export default exports as typeof import("./logger")
