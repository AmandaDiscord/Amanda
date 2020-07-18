// @ts-check

const events = require("events")

const passthrough = require("../../passthrough")

/**
 * @param {events.EventEmitter} target
 * @param {string} name
 * @param {string} filename
 * @param {(...args: Array<any>) => any} code
 */
function addTemporaryListener(target, name, filename, code, targetListenMethod = "on") {
	console.log(`added event ${name}`)
	target[targetListenMethod](name, code)
	passthrough.reloadEvent.once(filename, () => {
		target.removeListener(name, code)
		console.log(`removed event ${name}`)
	})
}

module.exports.addTemporaryListener = addTemporaryListener
