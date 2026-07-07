var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { createHash } from "node:crypto";
import { BetterComponent } from "@amanda/buttons";
import { ComponentType, MessageFlags, } from "discord-api-types/v10";
const { sync, queues, confprovider, snow, lavalink, sessions, sessionGuildIndex } = passthrough;
const common = sync.require("./utils");
const sharedUtils = sync.require("@amanda/shared-utils");
const queueDestroyAfter = 20000;
const interactionExpiresAfter = 1000 * 60 * 14;
const stopDisplayingErrorsAfter = 3;
const defaultVolumeAmount = 0.1;
export class Queue extends sync.reloadClassMethods(() => Queue) {
    constructor(guildID, voiceChannelID, textChannelID) {
        super();
        this.guildID = guildID;
        this.voiceChannelID = voiceChannelID;
        this.textChannelID = textChannelID;
        this.tracks = [];
        this.menu = [];
        this.playHasBeenCalled = false;
        this.listeners = new Map();
        this.loop = false;
        this.trackStartTime = 0;
        this.pausedAt = null;
        this.errorChain = 0;
        this.leaveTimeout = new sharedUtils.BetterTimeout(() => {
            if (!this._interactionExpired && this.interaction) {
                snow.interaction.createFollowupMessage(this.interaction.application_id, this.interaction.token, {
                    content: this.lang.GLOBAL.EVERYONE_LEFT
                });
            }
            this.destroy();
        }, queueDestroyAfter);
        this.messageUpdater = new sharedUtils.BetterTimeout(() => this._updateMessage()).setAsInterval(true);
        this._volume = defaultVolumeAmount;
        this._interactionExpired = false;
        this._interactionExpireTimeout = null;
        this._destroyed = false;
        this._lastFMSent = false;
        this._canSetVCStatus = true;
        queues.set(guildID, this);
    }
    toJSON() {
        return {
            members: (Array.from(this.listeners.values())).map(m => ({
                id: m.id,
                tag: sharedUtils.userString(m),
                avatar: m.avatar,
                isAmanda: m.id === confprovider.config.client_id
            })),
            tracks: this.tracks.map(s => s.toObject()),
            playing: !this.paused,
            voiceChannel: {
                id: this.voiceChannelID,
                name: "Amanda-Music"
            },
            textChannelID: this.textChannelID,
            pausedAt: this.pausedAt,
            trackStartTime: this.trackStartTime,
            attributes: {
                loop: this.loop
            },
            node: this.node
        };
    }
    get interaction() {
        return this._interaction;
    }
    set interaction(value) {
        if (value && value.channel.id !== this.textChannelID) {
            snow.interaction.editOriginalInteractionResponse(value.application_id, value.token, {
                content: langReplace(this.lang.GLOBAL.MUSIC_SEE_OTHER, { channel: `<#${this.textChannelID}>` })
            });
            return;
        }
        if (!this._interactionExpired && this._interaction) {
            snow.interaction.editOriginalInteractionResponse(this._interaction.application_id, this._interaction.token, {
                flags: MessageFlags.IsComponentsV2,
                components: [{
                        type: ComponentType.Container,
                        components: [{
                                type: ComponentType.TextDisplay,
                                content: this.lang.GLOBAL.NEWER_NOW_PLAYING
                            }]
                    }]
            });
        }
        this._interactionExpired = false;
        this.menu.forEach(bn => bn.destroy());
        this.menu.length = 0;
        if (value) {
            if (this._interactionExpireTimeout)
                clearTimeout(this._interactionExpireTimeout);
            this._interactionExpired = false;
            this.createNPMenu();
            this._interactionExpireTimeout = setTimeout(() => {
                this.messageUpdater.clear();
                this._interactionExpired = true;
            }, interactionExpiresAfter);
        }
        else {
            if (this._interactionExpireTimeout)
                clearTimeout(this._interactionExpireTimeout);
            this._interactionExpired = false;
            this.messageUpdater.clear();
        }
        this._interaction = value;
        if (this._interaction)
            this._updateMessage();
    }
    get speed() {
        var _a, _b, _c;
        return (_c = (_b = (_a = this.player) === null || _a === void 0 ? void 0 : _a.filters.timescale) === null || _b === void 0 ? void 0 : _b.speed) !== null && _c !== void 0 ? _c : 1;
    }
    set speed(amount) {
        if (amount === this.speed)
            return;
        if (this.player) {
            Object.assign(this.player.filters, {
                timescale: { speed: amount, pitch: this.pitch }
            });
        }
    }
    get paused() {
        return this.pausedAt !== null;
    }
    set paused(newState) {
        var _a;
        if (newState)
            this.pausedAt = Date.now();
        else
            this.pausedAt = null;
        (_a = this.player) === null || _a === void 0 ? void 0 : _a.pause(newState);
    }
    get volume() {
        return this._volume;
    }
    set volume(amount) {
        var _a;
        this._volume = amount;
        (_a = this.player) === null || _a === void 0 ? void 0 : _a.update({ volume: amount * 100 });
    }
    get pitch() {
        var _a, _b, _c;
        return (_c = (_b = (_a = this.player) === null || _a === void 0 ? void 0 : _a.filters.timescale) === null || _b === void 0 ? void 0 : _b.pitch) !== null && _c !== void 0 ? _c : 1;
    }
    set pitch(amount) {
        if (amount === this.pitch)
            return;
        if (this.player) {
            Object.assign(this.player.filters, {
                timescale: { speed: this.speed, pitch: amount }
            });
        }
    }
    get time() {
        if (this.paused)
            return this.pausedAt - this.trackStartTime;
        else
            return Date.now() - this.trackStartTime;
    }
    get timeSeconds() {
        return Math.round(this.time / 1000);
    }
    get totalDuration() {
        return this.tracks.reduce((acc, cur) => (acc + cur.lengthSeconds), 0);
    }
    applyFilters() {
        var _a;
        return (_a = this.player) === null || _a === void 0 ? void 0 : _a.update({ filters: this.player.filters });
    }
    addPlayerListeners() {
        this.player.on("trackEnd", (event) => this._onEnd(event));
        this.player.on("state", (event) => this._onPlayerUpdate(event));
        this.player.on("error", (event) => this._onPlayerError(event));
    }
    play() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.tracks[0])
                throw new Error("NO_TRACK");
            this.playHasBeenCalled = true;
            const track = this.tracks[0];
            if (this.tracks[1])
                this.tracks[1].prepare();
            yield track.prepare();
            if (!track.error) {
                if (track.track === "!")
                    track.error = this.lang.GLOBAL.SONG_ERROR_EXCLAIMATION;
                else if (track.track === null)
                    track.error = this.lang.GLOBAL.SONG_ERROR_NULL;
            }
            if (track.error) {
                console.error(`Track error call C: { id: ${track.id}, error: ${track.error} }`);
                this._reportError();
                this._nextTrack();
            }
            else {
                yield this.player.play(track.track);
                if (track.error)
                    return;
                this.trackStartTime = Date.now();
                this.pausedAt = null;
                this._startNPUpdates();
                const percent40 = Math.floor((track.lengthSeconds * 1000) * 0.4);
                setTimeout(() => {
                    if (this.tracks[0] === track)
                        this._lastFMSetTrack();
                }, Math.min(percent40, 10000));
                if (this._canSetVCStatus) {
                    try {
                        yield snow.channel.setVoiceChannelStatus(this.voiceChannelID, track.title);
                    }
                    catch (_a) {
                        this._canSetVCStatus = false;
                    }
                }
            }
        });
    }
    _lastFMSetTrack() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._lastFMSent)
                return;
            if (this.listeners.size > 1) {
                const track = this.tracks[0];
                if (!track)
                    return;
                this._lastFMSent = true;
                const usersAsPrepared = new Array(this.listeners.size).fill("?").map((_, ind) => `$${ind + 2}`);
                const sqlString = `SELECT * FROM connections WHERE type = $1 AND user_id IN (${usersAsPrepared})`;
                const prepared = ["lastfm"];
                for (const user of this.listeners.values()) {
                    prepared.push(user.id);
                }
                const connections = yield sql.all(sqlString, prepared);
                const pickedApart = common.genius.pickApart(track);
                for (const row of connections !== null && connections !== void 0 ? connections : []) {
                    const params = new URLSearchParams({
                        method: "track.scrobble",
                        "artist[0]": pickedApart.artist,
                        "track[0]": pickedApart.title,
                        "timestamp[0]": String(Math.floor(Date.now() / 1000)),
                        "duration[0]": String(track.lengthSeconds),
                        "chosenByUser[0]": track.requester.id === row.user_id ? "1" : "0",
                        api_key: confprovider.config.lastfm_key,
                        sk: row.access
                    });
                    const orderedParams = Array.from(params.keys())
                        .sort((a, b) => a.localeCompare(b))
                        .map(param => `${param}${params.get(param)}`)
                        .join("");
                    const orderedWithSecret = `${orderedParams}${confprovider.config.lastfm_sec}`;
                    const signature = createHash("md5").update(orderedWithSecret).digest("hex");
                    yield fetch("https://ws.audioscrobbler.com/2.0/", {
                        method: "POST",
                        body: `${params.toString()}&api_sig=${signature}&format=json`,
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded"
                        }
                    });
                }
            }
        });
    }
    destroy() {
        return __awaiter(this, arguments, void 0, function* (editInteraction = true) {
            if (this._destroyed)
                return;
            queues.delete(this.guildID);
            this._destroyed = true;
            this.menu.forEach(bn => bn.destroy());
            for (const track of this.tracks) {
                try {
                    yield track.destroy();
                }
                catch (e) {
                    console.error(`Track destroy error:\n${util.inspect(e, true, Infinity, true)}`);
                }
            }
            this.tracks.length = 0;
            this.leaveTimeout.clear();
            this.messageUpdater.clear();
            this.sendToSubscribedSessions("onStop");
            if (!this._interactionExpired && this.interaction && editInteraction) {
                yield snow.interaction.editOriginalInteractionResponse(this.interaction.application_id, this.interaction.token, {
                    flags: MessageFlags.IsComponentsV2,
                    components: [{
                            type: ComponentType.Container,
                            components: [{
                                    type: ComponentType.TextDisplay,
                                    content: this.lang.GLOBAL.QUEUE_ENDED
                                }]
                        }]
                });
            }
            if (this._canSetVCStatus) {
                snow.channel.setVoiceChannelStatus(this.voiceChannelID, "").catch(() => void 0);
            }
            yield lavalink.leave(this.guildID).catch(e => console.error(`lavalink leave error:\n${util.inspect(e, true, Infinity, true)}`));
        });
    }
    _nextTrack() {
        var _a, _b;
        this._lastFMSent = false;
        if (((_b = (_a = this.tracks) === null || _a === void 0 ? void 0 : _a[1]) === null || _b === void 0 ? void 0 : _b.live) && this.speed != 1)
            this.speed = 1;
        if (this.tracks.length === 1 && this.loop && !this.tracks[0].error) {
            this.play();
            return;
        }
        if (this.tracks[0] && (!this.loop || this.tracks[0].error))
            this.tracks[0].destroy();
        if (this.tracks.length <= 1) {
            this.destroy();
        }
        else {
            this.sendToSubscribedSessions("onNext");
            const removed = this.tracks.shift();
            if (removed && this.loop && !removed.error)
                this.addTrack(removed);
            this.play();
        }
    }
    createNPMenu(assign = true) {
        const newMenu = [
            new BetterComponent({ emoji: { name: "⏪" }, style: 2, type: 2 }, {}).setCallback(interaction => {
                var _a, _b;
                const user = (_b = (_a = interaction.member) === null || _a === void 0 ? void 0 : _a.user) !== null && _b !== void 0 ? _b : interaction.user;
                if (!this.listeners.get(user.id))
                    return;
                this.seek(0);
            }),
            new BetterComponent({ emoji: { name: "playpauseorang", id: "1385477006535163935" }, style: 2, type: 2 }, {}).setCallback(interaction => {
                var _a, _b;
                const user = (_b = (_a = interaction.member) === null || _a === void 0 ? void 0 : _a.user) !== null && _b !== void 0 ? _b : interaction.user;
                if (!this.listeners.get(user.id))
                    return;
                this.paused = !this.paused;
            }),
            new BetterComponent({ emoji: { name: "⏭" }, style: 2, type: 2 }, {}).setCallback(interaction => {
                var _a, _b;
                const user = (_b = (_a = interaction.member) === null || _a === void 0 ? void 0 : _a.user) !== null && _b !== void 0 ? _b : interaction.user;
                if (!this.listeners.get(user.id))
                    return;
                this.skip();
            }),
            new BetterComponent({ emoji: { name: "⏹" }, style: 4, type: 2 }, {}).setCallback(interaction => {
                var _a, _b;
                const user = (_b = (_a = interaction.member) === null || _a === void 0 ? void 0 : _a.user) !== null && _b !== void 0 ? _b : interaction.user;
                if (!this.listeners.get(user.id))
                    return;
                this.destroy();
            })
        ];
        if (assign) {
            if (this.menu) {
                this.menu.forEach(bn => bn.destroy());
                this.menu.length = 0;
            }
            this.menu.push(...newMenu);
        }
        return newMenu;
    }
    skip() {
        var _a;
        (_a = this.player) === null || _a === void 0 ? void 0 : _a.stop();
    }
    addTrack(track_1) {
        return __awaiter(this, arguments, void 0, function* (track, position = this.tracks.length) {
            if (position === -1)
                this.tracks.push(track);
            else
                this.tracks.splice(position, 0, track);
            if (this.playHasBeenCalled)
                this.sendToSubscribedSessions("onTrackAdd", track, position);
            else {
                yield this.play();
                this.volume = defaultVolumeAmount;
                this.sendToSubscribedSessions("sendState");
            }
        });
    }
    removeTrack(index) {
        return __awaiter(this, void 0, void 0, function* () {
            if (index === 0)
                return 1;
            if (!this.tracks[index])
                return 1;
            const removed = this.tracks.splice(index, 1)[0];
            if (!removed)
                return 2;
            try {
                yield removed.destroy();
            }
            catch (e) {
                console.error(`Track destroy error:\n${util.inspect(e, true, Infinity, true)}`);
            }
            this.sendToSubscribedSessions("onTrackRemove", index);
            return 0;
        });
    }
    seek(position) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const track = this.tracks[0];
            if (!track)
                return 1;
            if (track.live || !track.canSeek)
                return 2;
            if (position > (track.lengthSeconds * 1000))
                return 3;
            const result = yield ((_a = this.player) === null || _a === void 0 ? void 0 : _a.seek(position));
            if (result)
                return 0;
            else
                return 4;
        });
    }
    _onEnd(event) {
        if (event.type === "TrackEndEvent" && event.reason === "replaced")
            return;
        if (event.type === "TrackStuckEvent") {
            if (this.tracks[0]) {
                this.tracks[0].error = this.lang.GLOBAL.SONG_STUCK;
                console.error("Track error call D");
                this._reportError();
            }
        }
        this._nextTrack();
    }
    _onPlayerUpdate(state) {
        var _a, _b, _c;
        if (this.player && !this.paused) {
            const newTrackStartTime = (Number((_a = state.time) !== null && _a !== void 0 ? _a : 0)) - ((_b = state.position) !== null && _b !== void 0 ? _b : 0);
            this.trackStartTime = newTrackStartTime;
        }
        this.sendToSubscribedSessions("onTimeUpdate", { trackStartTime: this.trackStartTime, pausedAt: (_c = this.pausedAt) !== null && _c !== void 0 ? _c : 0, playing: !this.paused });
    }
    _onPlayerError(details) {
        var _a;
        if (details.type === "WebSocketClosedEvent") {
            return void this.destroy();
        }
        console.error(`Lavalink error event at ${new Date().toUTCString()}\n${util.inspect(details, true, Infinity, true)}`);
        if (this.tracks[0]) {
            this.tracks[0].error = (_a = details.exception.message) !== null && _a !== void 0 ? _a : "Unknown error";
            console.error("Track error call B");
            this._reportError();
            this._nextTrack();
        }
        else
            this.destroy();
    }
    _startNPUpdates() {
        if (!this.tracks[0])
            return console.error("Tried to call Queue._startNPUpdates but no tracks");
        const frequency = this.tracks[0].npUpdateFrequency;
        const timeUntilNext5 = frequency - ((Date.now() - this.trackStartTime) % frequency);
        const triggerNow = timeUntilNext5 > 1500;
        this.messageUpdater.setDelay(frequency);
        if (triggerNow)
            this.messageUpdater.triggerNow();
        this.messageUpdater.run();
    }
    _updateMessage() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._interactionExpired)
                this.interaction = void 0;
            if (!this.interaction)
                return;
            const track = this.tracks[0];
            if (track) {
                const progress = track.getProgress(this.timeSeconds, this.paused);
                const link = yield track.showLink().catch(() => `${confprovider.config.website_protocol}://${confprovider.config.website_domain}`);
                snow.interaction.editOriginalInteractionResponse(this.interaction.application_id, this.interaction.token, {
                    flags: MessageFlags.IsComponentsV2,
                    components: [
                        {
                            type: ComponentType.Container,
                            components: [
                                {
                                    type: ComponentType.TextDisplay,
                                    content: langReplace(this.lang.GLOBAL.NOW_PLAYING, { "song": `[**${track.title}**](${link})` })
                                },
                                {
                                    type: ComponentType.TextDisplay,
                                    content: progress
                                },
                                {
                                    type: ComponentType.ActionRow,
                                    components: this.menu.map(c => c.component)
                                }
                            ]
                        }
                    ]
                }).catch(() => {
                    this._interactionExpired = true;
                });
            }
        });
    }
    _onAllUsersLeave() {
        this.leaveTimeout.run();
        if (!this._interactionExpired && this.interaction) {
            snow.interaction.createFollowupMessage(this.interaction.application_id, this.interaction.token, {
                content: langReplace(this.lang.GLOBAL.NO_USERS_IN_VC, { time: sharedUtils.shortTime(queueDestroyAfter) })
            }).then(msg => this.leavingSoonID = msg.id);
        }
    }
    _reportError() {
        const serverURL = `${confprovider.config.website_protocol}://${confprovider.config.website_domain}/to/server`;
        const track = this.tracks[0];
        const sendReport = (contents) => {
            var _a, _b, _c, _d, _e;
            contents.components.push({ type: ComponentType.Separator }, { type: ComponentType.TextDisplay, content: `[${this.lang.GLOBAL.TITLE_JOIN_SERVER}](${serverURL})` });
            if (!this._interactionExpired && this.interaction)
                snow.interaction.createFollowupMessage(this.interaction.application_id, this.interaction.token, { flags: MessageFlags.IsComponentsV2, components: [contents] });
            const reportTarget = confprovider.config.error_log_channel_id;
            const undef = "undefined";
            const details = [
                ["Tree", confprovider.config.cluster_id],
                ["Node", (_a = this.node) !== null && _a !== void 0 ? _a : "UNNAMED"],
                ["Guild ID", (_c = (_b = this.interaction) === null || _b === void 0 ? void 0 : _b.guild_id) !== null && _c !== void 0 ? _c : undef],
                ["Text Channel", (_e = (_d = this.interaction) === null || _d === void 0 ? void 0 : _d.channel.id) !== null && _e !== void 0 ? _e : undef]
            ];
            if (track) {
                details.push(["Requester", sharedUtils.userString(track.requester)], ["Requester ID", track.requester.id], ["Input", track.input], ["Track", track.id.length > 50 ? track.id.slice(0, 48) + "…" : track.id]);
            }
            const maxLength = details.reduce((p, c) => Math.max(p, c[0].length), 0);
            const detailsString = details.map(row => `\`${row[0]}${" ​".repeat(maxLength - (row === null || row === void 0 ? void 0 : row[0].length))}\` ${row[1]}`).join("\n");
            snow.channel.createMessage(reportTarget, {
                flags: MessageFlags.IsComponentsV2,
                components: [
                    {
                        type: ComponentType.Container,
                        accent_color: 0xff2ee7,
                        components: [
                            {
                                type: ComponentType.TextDisplay,
                                content: "Music error occurred."
                            },
                            {
                                type: ComponentType.TextDisplay,
                                content: "The next container is what was sent to the user."
                            },
                            {
                                type: ComponentType.Separator
                            },
                            {
                                type: ComponentType.TextDisplay,
                                content: detailsString
                            }
                        ]
                    },
                    contents
                ]
            });
        };
        this.errorChain++;
        if (this.errorChain <= stopDisplayingErrorsAfter) {
            if (track) {
                sendReport({
                    type: ComponentType.Container,
                    accent_color: 0xdd2d2d,
                    components: [
                        {
                            type: ComponentType.TextDisplay,
                            content: this.lang.GLOBAL.SONG_NOT_PLAYABLE
                        },
                        {
                            type: ComponentType.TextDisplay,
                            content: `**${track.title}** (ID: ${track.id})`
                        },
                        {
                            type: ComponentType.Separator
                        },
                        {
                            type: ComponentType.TextDisplay,
                            content: track.error
                        }
                    ]
                });
            }
            else {
                sendReport({
                    type: ComponentType.Container,
                    accent_color: 0xdd2d2d,
                    components: [
                        {
                            type: ComponentType.TextDisplay,
                            content: this.lang.GLOBAL.ERROR_OCCURRED
                        },
                        {
                            type: ComponentType.TextDisplay,
                            content: langReplace(this.lang.GLOBAL.SONG_NOT_OBJECT, { "song": track })
                        }
                    ]
                });
            }
            if (this.errorChain === 3) {
                if (!this._interactionExpired && this.interaction) {
                    snow.interaction.createFollowupMessage(this.interaction.application_id, this.interaction.token, {
                        flags: MessageFlags.IsComponentsV2,
                        components: [
                            {
                                type: ComponentType.Container,
                                accent_color: 0xff2ee7,
                                components: [
                                    {
                                        type: ComponentType.TextDisplay,
                                        content: this.lang.GLOBAL.TOO_MANY_ERRORS
                                    },
                                    {
                                        type: ComponentType.TextDisplay,
                                        content: this.lang.GLOBAL.ERRORS_SUPPRESSED
                                    },
                                    {
                                        type: ComponentType.Separator
                                    },
                                    {
                                        type: ComponentType.TextDisplay,
                                        content: `[${this.lang.GLOBAL.TITLE_JOIN_SERVER}](${serverURL})`
                                    }
                                ]
                            }
                        ]
                    });
                }
            }
        }
    }
    sendToSubscribedSessions(method, ...args) {
        const inGuild = sessionGuildIndex.get(this.guildID);
        inGuild === null || inGuild === void 0 ? void 0 : inGuild.forEach(s => sessions.get(s)[method](...args));
    }
    voiceStateUpdate(packet) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            if (packet.channel_id && packet.user_id === confprovider.config.client_id) {
                if (!this.createResolveCallback) {
                    console.error("Amanda joined the VC before a callback was set. Likely a race condition with rejection or new Queue is being called elsewhere");
                    return;
                }
                this.createResolveCallback();
                const [clientUser, states] = yield Promise.all([
                    sharedUtils.getUser(confprovider.config.client_id, snow),
                    redis.SMEMBERS(`vcs.${this.voiceChannelID}`).then(mems => Promise.all(mems.map(mem => redis.GET("voice", mem))))
                ]);
                if (clientUser)
                    this.listeners.set(clientUser.id, clientUser);
                for (const state of states) {
                    if (!state)
                        continue;
                    if (this.listeners.has(state.user_id))
                        continue;
                    const user = (_b = (_a = state.member) === null || _a === void 0 ? void 0 : _a.user) !== null && _b !== void 0 ? _b : yield sharedUtils.getUser(state.user_id, snow);
                    if (user && !user.bot)
                        this.listeners.set(user.id, user);
                }
                this._lastFMSetTrack();
                this.sendToSubscribedSessions("onListenersUpdate", this.toJSON().members);
                return;
            }
            if (!packet.channel_id && this.voiceChannelID && packet.user_id === confprovider.config.client_id)
                return this.destroy();
            if (packet.channel_id !== this.voiceChannelID && this.listeners.has(packet.user_id)) {
                this.listeners.delete(packet.user_id);
                if (this.listeners.size <= 1)
                    this._onAllUsersLeave();
            }
            if (packet.channel_id === this.voiceChannelID && packet.user_id !== confprovider.config.client_id) {
                if (!((_c = packet.member) === null || _c === void 0 ? void 0 : _c.user) || packet.member.user.bot)
                    return;
                this.leaveTimeout.clear();
                if (this.leavingSoonID && this.interaction) {
                    snow.interaction.deleteFollowupMessage(this.interaction.application_id, this.interaction.token, this.leavingSoonID);
                }
                this.leavingSoonID = void 0;
                this.listeners.set(packet.member.user.id, packet.member.user);
            }
            this.sendToSubscribedSessions("onListenersUpdate", this.toJSON().members);
        });
    }
}
