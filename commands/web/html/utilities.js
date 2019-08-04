var ex = ex || []
ex.push({
	name: "utilities",
	dependencies: []
})

const q = s => document.querySelector(s)

const opcodes = {
	"IDENTIFY": 1,
	"ACKNOWLEDGE": 2,
	"REQUEST_STATE": 3,
	"STATE": 4,
	"QUEUE_ADD": 5,
	"NEXT": 6,
	"SONG_UPDATE": 7,
	"TIME_UPDATE": 8,
	"TOGGLE_PLAYBACK": 9,
	"SKIP": 10,
	"STOP": 11,
	"QUEUE_REMOVE": 12,
	"REQUEST_QUEUE_REMOVE": 13,
	"MEMBERS_CHANGE": 14
}

let generateNonce
{
	function* generator() {
		let i = 0
		while (true) {
			yield ++i
		}
	}
	let genInstance = generator()
	generateNonce = () => genInstance.next().value
}

function prettySeconds(seconds) {
	if (isNaN(seconds)) return seconds;
	let minutes = Math.floor(seconds / 60);
	seconds = seconds % 60;
	let hours = Math.floor(minutes / 60);
	minutes = minutes % 60;
	let output = [];
	if (hours) {
		output.push(hours);
		output.push(minutes.toString().padStart(2, "0"));
	} else {
		output.push(minutes);
	}
	output.push(seconds.toString().padStart(2, "0"));
	return output.join(":");
}
