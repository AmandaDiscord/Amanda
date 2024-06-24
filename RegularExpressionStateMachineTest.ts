type State = {
	next: State
	type: "character"
	value: string
	group?: number
} | {
	type: "end"
	value: string
	group?: number
} | {
	type: "set" | "nset"
	list: Set<string> // can have multiple transitions to the same state because of character groups
	group?: number
} | {
	type: "any"
	next: State
	group?: number
}

type StateMachine = {
	first: State
	compiled: string
	groups: number
	fromStart: boolean
	toEnd: boolean
}

export function compile(regex: string): StateMachine {
	const endState: State = { type: "end", value: "" }
	const machine: StateMachine = {
		first: endState,
		compiled: regex,
		groups: 0,
		fromStart: regex[0] === "^",
		toEnd: regex[regex.length - 1] === "$"
	}
	if (regex.length === 0) return machine

	let current: State | undefined
	let skip = 0
	let groupIndex = 0
	const workingGroups: Array<number> = []
	const groupEndingMap: { [strIndex: number]: number } = {}
	for (let i = 0; i < regex.length; i++) {
		if (skip > 0) {
			skip--
			continue
		}

		if (i === regex.length - 1) {
			endState.value = regex[i]
			break
		}

		switch (regex[i]) {
		case "\\":
			skip += 1
			current = asgn(machine, { type: "character", value: regex[i + 1], next: endState }, current)
			if (workingGroups.length) current.group = workingGroups[workingGroups.length - 1]
			break

		case "[": {
			const ending = indexOfNextUnescapedItem(regex.slice(i), "]")
			if (ending === -1) throw new Error("Unbalanced [")
			const nSet = regex[i + 1] === "^"
			const characters = regex.slice(i + (nSet ? 2 : 1), ending).split("")
			const st: State = {
				type: nSet ? "nset" : "set",
				list: new Set(characters.filter(c => c !== "\\"))
			}
			current = asgn(machine, st, current)
			skip += (nSet ? 2 : 1) + characters.length
			break
		}

		case "(": {
			const ending = indexOfNextUnescapedItem(regex.slice(i), ")")
			if (ending === -1) throw new Error("Unbalanced (")
			if (regex[i + 1] !== "?") {
				workingGroups.push(groupIndex++)
				groupEndingMap[groupIndex - 1] = ending
			} else skip += 2 // currently dont care about group types
			break
		}

		case ")":
			if (groupEndingMap[i]) {
				workingGroups.splice(workingGroups.length - 1, 1)
				delete groupEndingMap[i]
			}
			break

		default:
			current = asgn(machine, { type: "character", value: regex[i], next: endState }, current)
			break
		}

	}

	return machine
}

function asgn(machine: StateMachine, state: State, current: State | undefined): State {
	if (current) {
		switch (current.type) {
		case "character":
		case "any":
			current.next = state
			break
		case "set":
		case "nset":
			for (const key of Object.keys(current.list)) {
				current.list[key] = state
			}
			break
		default: throw new Error(`Don't know how to assign next to type ${current.type}`)
		}
	} else machine.first = state

	return state
}

function indexOfNextUnescapedItem(str: string, item: string): number {
	const index = str.indexOf(item)
	if (index === -1) return -1
	if (str[index - 1] === "\\") return index + indexOfNextUnescapedItem(str.slice(index + 1), item)
	return index
}
