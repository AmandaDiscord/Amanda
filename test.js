async function process(event) {
	switch (event.t) {
	case "READY":
		await this.processReady(event);
		this.ready = true;
		break;
	case "GUILD_CREATE":
	case "GUILD_UPDATE":
		this.emit("debug", `Cached guild ${event.d.id}|${event.d.name}`);
		await this.guildCache?.update(event.d.id, event.d);
		break;
	case "GUILD_DELETE":
		this.emit("debug", `Guild ${event.d.id} ${event.d.unavailable ? "is unavailable" : "was removed"}`);
		if (event.d.unavailable) {
			await this.guildCache?.update(event.d.id, event.d);
		} else {
			await this.guildCache?.remove(event.d.id);
		}
		break;
	case "CHANNEL_CREATE":
	case "CHANNEL_UPDATE":
		// console.log(event);
		// console.log(event.d.permission_overwrites);
		await this.onChannelCreate(event);
		break;
	case "CHANNEL_DELETE":
		await this.onChannelDelete(event);
		break;
	case "GUILD_MEMBER_ADD":
	case "GUILD_MEMBER_UPDATE":
		await this.memberCache?.update(event.d.user.id, event.d.guild_id, event.d);
		break;
	case "GUILD_MEMBER_REMOVE":
		await this.memberCache?.remove(event.d.user.id, event.d.guild_id);
		break;
	case "GUILD_MEMBERS_CHUNK": {
		const guildMemberChunkPromises: Array<Promise<any> | undefined> = [];
		for (const member of event.d.members) {
			guildMemberChunkPromises.push(this.memberCache?.update(member.user.id, event.d.guild_id, member));
		}
		await Promise.all(guildMemberChunkPromises);
		this.emit("debug", `Cached ${guildMemberChunkPromises.length} Members from Guild Member Chunk`);
		break;
	}
	case "USER_UPDATE":
		await this.userCache?.update(event.d.id, event.d);
		break;
	case "PRESENCE_UPDATE":
		this.handlePresenceUpdate(event.d);
		break;
	case "GUILD_ROLE_CREATE":
	case "GUILD_ROLE_UPDATE":
		await this.roleCache?.update(event.d.role.id, event.d.guild_id, event.d.role);
		break;
	case "GUILD_ROLE_DELETE":
		await this.roleCache?.remove(event.d.guild_id, event.d.role_id);
		break;
	case "GUILD_EMOJIS_UPDATE": {
		let oldEmotes = await this.emojiCache?.filter(() => true, event.d.guild_id);
		if (!oldEmotes || oldEmotes.length === 0) {
			oldEmotes = [];
		}
		for (const emoji of event.d.emojis) {
			// @ts-ignore
			const oldEmote = oldEmotes.find(e => e.id === emoji.id);
			if (!oldEmote || oldEmote !== emoji) {
				await this.emojiCache?.update(emoji.id, event.d.guild_id, emoji);
			}
		}
		for (const oldEmote of oldEmotes) {
			// @ts-ignore
			const newEmote = event.d.emojis.find(e => e.id === oldEmote.id);
			if (!newEmote) {
				// @ts-ignore
				await this.emojiCache.remove(oldEmote.id, event.d.guild_id);
			}
		}
		break;
	}
	case "MESSAGE_CREATE": {
		if (event.d.webhook_id) return;
		if (event.d.member && event.d.author) await this.memberCache?.update(event.d.author.id, event.d.guild_id, { guild_id: event.d.guild_id, user: event.d.author, id: event.d.author.id, ...event.d.member });
		else if (event.d.author) await this.userCache?.update(event.d.author.id, event.d.author);

		if (event.d.mentions && event.d.mentions.length > 0 && event.d.guild_id) {
			await Promise.all(event.d.mentions.map(user => {
				if (user.member) this.memberCache?.update(user.id, event.d.guild_id, user.member);
				else this.userCache?.update(user.id, user);
			}));
		}
		break;
	}
	case "VOICE_STATE_UPDATE": {
		if (!event.d.guild_id) return;
		if (event.d.member && event.d.user_id && event.d.guild_id) await this.memberCache?.update(event.d.user_id, event.d.guild_id, { guild_id: event.d.guild_id, ...event.d.member });

		if (event.d.channel_id != null) await this.voiceStateCache?.update(event.d.user_id, event.d.guild_id, event.d);
		else await this.voiceStateCache?.remove(event.d.user_id, event.d.guild_id);
		break;
	}
	default:
		if (event.t !== "PRESENCE_UPDATE") {
			this.emit("debug", `Unknown Event ${event.t}`);
		}
		break;
	}
}
