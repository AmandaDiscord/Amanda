// @ts-check

const constants = require("../../constants")

const passthrough = require("../../passthrough")
const { client } = passthrough

/**
 * @returns {[number, number]} [removedCount, addedCount]
 */
function applyChanges() {
	let removedCount = 0
	let addedCount = 0
	for (const node of client.lavalink.nodes.values()) {
		if (!constants.lavalinkNodes.find(n => n.host === node.host)) {
			removedCount++
			const nodeInstance = client.lavalink.nodes.get(node.host)
			client.lavalink.removeNode(node.host)
			nodeInstance.destroy()
		}
	}

	for (const node of constants.lavalinkNodes) {
		if (!client.lavalink.nodes.has(node.host)) {
			addedCount++
			client.lavalink.createNode(node)
		}
	}
	return [removedCount, addedCount]
}

/**
 * @param {string} name
 */
function removeByName(name) {
	constants.lavalinkNodes = constants.lavalinkNodes.filter(node => node.name !== name)
	return applyChanges()
}

function add(data) {
	constants.lavalinkNodes.push(data)
	return applyChanges()
}

/**
 * Add enabled and disconnected nodes to the client node list and connect to them.
 * Clean unused and disabled client nodes and close their websockets
 * so that the lavalink process can be ended safely.
 *
 * @returns {Promise<[number, number]>} cleaned nodes, added nodes
 */
async function syncConnections() {
	const queues = passthrough.queues // file load order means queueStore cannot be extracted at top of file

	let cleanedCount = 0
	let addedCount = 0

	for (const node of constants.lavalinkNodes) { // loop through all known nodes
		const clientNode = [...client.lavalink.nodes.values()].find(n => n.host === node.host) // get the matching client node
		if (node.enabled) { // try connecting to nodes
			if (clientNode) continue // only consider situations where the client node is unknown
			// connect to the node
			client.lavalink.createNode(node)
			addedCount++
		} else { // try disconnecting from nodes
			if (!clientNode) continue // only consider situations where the client node is known
			// if no queues are using the node, disconnect it.
			let fq
			for (const q of queues.cache.values()) {
				const p = await q.player
				const found = p.node === clientNode
				if (found) fq = q
			}
			if (!fq) {
				client.lavalink.removeNode(clientNode.host)
				clientNode.destroy()
				cleanedCount++
			}
		}
	}

	return [cleanedCount, addedCount]
}

module.exports.applyChanges = applyChanges
module.exports.removeByName = removeByName
module.exports.add = add
module.exports.syncConnections = syncConnections
