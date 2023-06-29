import repl = require("repl")
import util = require("util")

class REPLProvider<C> {
	public repl: repl.REPLServer

	public constructor(public context: C) {
		const cli = repl.start({ prompt: "", eval: this.customEval, writer: s => s })
		Object.assign(cli.context, { extraContext: context })
		this.repl = cli
	}

	private async customEval(input: string, _context: import("vm").Context, _filename: string, callback: (err: Error | null, result: unknown) => unknown): Promise<void> {
		let depth = 0

		if (input === "exit\n") return process.exit()

		if (input.startsWith(":")) {
			const depthOverwrite = input.split(" ")[0]
			depth = +depthOverwrite.slice(1)
			input = input.slice(depthOverwrite.length + 1)
		}

		let result: unknown = void 0
		try {
			result = await eval(input)
			const output = util.inspect(result, false, depth, true)
			return void callback(null, output)
		} catch (e) {
			return void callback(null, util.inspect(e, true, 100, true))
		}
	}
}

export = REPLProvider
