class CommandManager<Params extends Array<unknown>> {
	public cache = new Map<string, Command<Params>>()
	public categories = new Map<string, Array<string>>()

	public static default = CommandManager

	public assign(properties: Array<Command<Params>>) {
		properties.forEach(i => {
			if (this.cache.get(i.name)) this.cache.delete(i.name)
			this.cache.set(i.name, i)
			this.categories.forEach(c => {
				if (c.includes(i.name)) c.splice(c.indexOf(i.name), 1)
			})
			const cat = this.categories.get(i.category)
			if (!cat) this.categories.set(i.category, [i.name])
			else if (!cat.includes(i.name)) cat.push(i.name)
		})
	}

	public remove(commands: Array<string>) {
		for (const command of commands) {
			if (this.cache.get(command)) {
				this.cache.delete(command)
				this.categories.forEach(c => {
					if (c.includes(command)) c.splice(c.indexOf(command), 1)
				})
			}
		}
	}
}

type Command<Params extends Array<unknown>> = {
	name: string;
	options?: Array<import("discord-api-types/v10").APIApplicationCommandOption>;
	description: string;
	category: string;
	examples?: Array<string>;
	order?: number;
	process(...args: Params): Promise<unknown> | unknown;
}

export = CommandManager
