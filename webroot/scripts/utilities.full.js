const q = s => document.querySelector(s)

const opcodes = {
	IDENTIFY: 1,
	ACKNOWLEDGE: 2,
	STATE: 3,
	TRACK_ADD: 4,
	TRACK_REMOVE: 5,
	TRACK_UPDATE: 6,
	NEXT: 7,
	TIME_UPDATE: 8,
	TOGGLE_PLAYBACK: 9,
	SKIP: 10,
	STOP: 11,
	ATTRIBUTES_CHANGE: 12,
	CLEAR_QUEUE: 13,
	LISTENERS_UPDATE: 14,
}

function* generator() {
	let i = 0
	while (true) {
		yield ++i
	}
}

let generateNonce
{
	const genInstance = generator()
	generateNonce = () => genInstance.next().value
}

function prettySeconds(seconds) {
	if (isNaN(seconds)) return String(seconds)
	let minutes = Math.floor(seconds / 60)
	seconds = seconds % 60
	const hours = Math.floor(minutes / 60)
	minutes = minutes % 60
	const output = []
	if (hours) {
		output.push(hours)
		output.push(minutes.toString().padStart(2, "0"))
	} else output.push(minutes)
	output.push(seconds.toString().padStart(2, "0"))
	return output.join(":")
}

export {
	q,
	opcodes,
	generateNonce,
	prettySeconds
}
