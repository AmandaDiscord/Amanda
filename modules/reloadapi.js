// @ts-check

const path = require("path")

const { ipc, reloader } = require("../passthrough")

// This isn't in reloader because the idea of reloader is to be independent.
// This depends on IPC things that only we have.
ipc.replier.addReceivers([
	["RECEIVE_RELOAD_LANG", {
		op: "RELOAD_LANG",
		fn: () => {
			const langEntry = require.resolve("@amanda/lang")
			const langFolder = path.dirname(langEntry)
			Object.keys(require.cache).filter(p => p.startsWith(langFolder)).forEach(p => delete require.cache[p])
			reloader.reloadEvent.emit("@amanda/lang")
		}
	}]
])
