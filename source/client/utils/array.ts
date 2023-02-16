/**
 * Get a random element from an array.
 */
export function random<T>(array: Array<T>) {
	const index = Math.floor(Math.random() * array.length)
	return array[index]
}

/**
 * Shuffle an array in place. https://stackoverflow.com/a/12646864
 */
export function shuffle<T extends Array<unknown>>(array: T) {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]]
	}
	return array
}

export function tableifyRows(rows: Array<Array<string>>, align: Array<"left" | "right" | "none">, surround: (currentLine: number) => string = () => "", spacer = " ") { // SC: en space
	const output = [] as Array<string>
	const maxLength = [] as Array<number>
	for (let i = 0; i < rows[0].length; i++) {
		let thisLength = 0
		for (const row of rows) {
			if (thisLength < row[i].length) thisLength = row[i].length
		}
		maxLength.push(thisLength)
	}
	for (let i = 0; i < rows.length; i++) {
		let line = ""
		for (let j = 0; j < rows[0].length; j++) {
			if (align[j] == "left" || align[j] == "right") {
				line += surround(i)
				if (align[j] == "left") {
					const pad = " ​"
					const padding = pad.repeat(maxLength[j] - rows[i][j].length)
					line += rows[i][j] + padding
				} else if (align[j] == "right") {
					const pad = "​ "
					const padding = pad.repeat(maxLength[j] - rows[i][j].length)
					line += padding + rows[i][j]
				}
				line += surround(i)
			} else {
				line += rows[i][j]
			}
			if (j < rows[0].length - 1) line += spacer
		}
		output.push(line)
	}
	return output
}

export function removeMiddleRows(rows: Array<string>, maxLength = 2000, joinLength = 1, middleString = "…") {
	let currentLength = 0
	let currentItems = 0
	const maxItems = 20
	/**
	 * Holds items for the left and right sides.
	 * Items should flow into the left faster than the right.
	 * At the end, the sides will be combined into the final list.
	 */
	const reconstruction = new Map<"left" | "right", Array<string>>([
		["left", []],
		["right", []]
	])
	let leftOffset = 0
	let rightOffset = 0
	function getNextDirection() {
		return rightOffset * 3 > leftOffset ? "left" : "right"
	}
	while (currentItems < rows.length) {
		const direction = getNextDirection()
		let row: string
		if (direction == "left") row = rows[leftOffset++]
		else row = rows[rows.length - 1 - rightOffset++]
		if (currentItems >= maxItems || currentLength + row.length + joinLength + middleString.length > maxLength) {
			return reconstruction.get("left")!.concat([middleString], reconstruction.get("right")!.reverse())
		}
		reconstruction.get(direction)!.push(row)
		currentLength += row.length + joinLength
		currentItems++
	}
	return reconstruction.get("left")!.concat(reconstruction.get("right")!.reverse())
}

export function createPages(rows: Array<string>, maxLength: number, itemsPerPage: number, itemsPerPageTolerance: number) {
	const pages = [] as Array<Array<string>>
	let currentPage = [] as Array<string>
	let currentPageLength = 0
	const currentPageMaxLength = maxLength
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]
		if ((currentPage.length >= itemsPerPage && rows.length - i > itemsPerPageTolerance) || currentPageLength + row.length + 1 > currentPageMaxLength) {
			pages.push(currentPage)
			currentPage = []
			currentPageLength = 0
		}
		currentPage.push(row)
		currentPageLength += row.length + 1
	}
	pages.push(currentPage)
	return pages
}
