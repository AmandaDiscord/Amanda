const numberOfSlots = 3
const numberOfFruits = 5 // heart not included
const heartChance = 0.186
const betAmount = 100

const payouts = {
	counts: [0, 1.25, 4, 20],
	same: 5
}

const stats = {
	runs: 0,
	counts: Array(numberOfSlots + 1).fill(0),
	same: 0,
	money: 0
}

const HEART_VALUE = 0
const FRUIT_VALUE = 1

/**
 * @param {number[]} slots
 */
function slotsAreSame(slots) {
	return slots.every(x => x === slots[0])
}

/**
 * @param {number[]} slots
 */
function countHearts(slots) {
	return slots.reduce((a, c) => a + +(c === HEART_VALUE), 0)
}

function generateSlots() {
	return Array(numberOfSlots).fill().map(() => {
		if (Math.random() < heartChance) {
			return HEART_VALUE
		} else {
			const fruit = Math.floor(Math.random() * numberOfFruits)
			return fruit + FRUIT_VALUE
		}
	})
}

function simulate() {
	stats.runs++
	stats.money -= betAmount

	const slots = generateSlots()
	const count = countHearts(slots)
	const same = slotsAreSame(slots)

	if (count === 0 && same) {
		stats.same++
		stats.money += betAmount * payouts.same
	} else {
		stats.counts[count]++
		stats.money += betAmount * payouts.counts[count]
	}
}

function report() {
	process.stdout.write(
		`Runs: ${stats.runs}\n`
		+`Outcomes: ${JSON.stringify(stats.counts)}, ${stats.money}\n`
		+`Money: ${stats.money}, avg. ${(stats.money/stats.runs).toFixed(3)}\n\n`
	)
}

while (true) {
	for (let i = 0; i < 100000; i++) {
		simulate()
	}
	report()
}
