var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { en_us } from "@amanda/lang";
import { Player, Rest } from "lavacord";
import { SecondTrack } from "./tracktypes";
import { ComponentType, MessageFlags } from "discord-api-types/v10";
const { sync, confprovider, lavalink, snow, queues } = passthrough;
const sharedUtils = sync.require("@amanda/shared-utils");
const selectTimeout = 1000 * 60;
const waitForClientVCJoinTimeout = 5000;
const trackNameRegex = /(?:\w+ ? \| ?)?([^|[\]]+?) ?([-–—|:]|\bby\b) ?([^()[\],|]+)?/;
const knownGoodArtistRegex = /(.+?)(?:(?: - Topic)|(?:VEVO))/;
const hiddenEmbedRegex = /(^<|>$)/g;
const searchShortRegex = /^\w+?search:/;
const startsWithHTTP = /^https?:\/\//;
const replaceExtraneousRegex = / ?\([^)]+\) ?/g;
const userTagRegex = /(.+?)#(\d+)$/;
const sourceMap = new Map([
    ["http", "ExternalTrack"]
]);
class LoadTracksError extends Error {
    constructor(message, node, options) {
        super(message, options);
        this.node = node;
    }
}
const common = {
    nodes: {
        random() {
            const filtered = passthrough.lavalink_nodes.filter(n => n.enabled);
            return sharedUtils.arrayRandom(filtered);
        },
        byID(id) {
            var _a;
            return (_a = passthrough.lavalink_nodes.find(n => n.id === id && n.enabled)) !== null && _a !== void 0 ? _a : null;
        },
        byIdeal() {
            const node = lavalink.idealNodes[0];
            if (node)
                return common.nodes.byID(node.id);
            else
                return common.nodes.random();
        }
    },
    genius: {
        getLyrics(title, artist) {
            return fetch(`https://some-random-api.com/others/lyrics?title=${encodeURIComponent(artist ? `${artist} - ${title}` : title)}`, {
                headers: {
                    Authorization: confprovider.config.sra_token
                }
            })
                .then(d => d.json())
                .then(j => { var _a, _b; return (_b = (_a = j.lyrics) !== null && _a !== void 0 ? _a : j.error) !== null && _b !== void 0 ? _b : null; })
                .catch(() => null);
        },
        pickApart(track) {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            let title = "", artist;
            let confidence = 0;
            let skip = false;
            if (track.source === "spotify" || track.source === "applemusic" || track.source === "soundcloud") {
                confidence = 2;
                title = track.title;
                artist = track.author;
                skip = true;
            }
            if (!skip) {
                const authorNameMatch = knownGoodArtistRegex.exec(track.author);
                const trackNameMatch = trackNameRegex.exec(track.title);
                if (authorNameMatch) {
                    title = (_c = (_b = (_a = track.title) === null || _a === void 0 ? void 0 : _a.replace(new RegExp(`${authorNameMatch[1]} ?- ?`), "")) === null || _b === void 0 ? void 0 : _b.replace(replaceExtraneousRegex, "")) === null || _c === void 0 ? void 0 : _c.trim();
                    artist = (_d = authorNameMatch[1]) === null || _d === void 0 ? void 0 : _d.trim();
                    confidence = 2;
                }
                else if (trackNameMatch) {
                    if (trackNameMatch[2] === "by") {
                        title = (_e = trackNameMatch[1]) === null || _e === void 0 ? void 0 : _e.trim();
                        artist = (_f = trackNameMatch[3]) === null || _f === void 0 ? void 0 : _f.trim();
                    }
                    else {
                        title = (_g = trackNameMatch[3]) === null || _g === void 0 ? void 0 : _g.trim();
                        artist = (_h = trackNameMatch[1]) === null || _h === void 0 ? void 0 : _h.trim();
                    }
                    confidence = 1;
                }
            }
            if (!title || !artist) {
                title = track.title;
                artist = track.author;
            }
            return { title, artist, confidence };
        }
    },
    handleTrackLoadError(cmd, error, input) {
        var _a, _b, _c;
        const reportTarget = confprovider.config.error_log_channel_id;
        const undef = "undefined";
        const details = [
            ["Tree", confprovider.config.cluster_id],
            ["Branch", "music"],
            ["Node", error.node],
            ["User", sharedUtils.userString(cmd.author)],
            ["User ID", cmd.author.id],
            ["Guild ID", (_a = cmd.guild_id) !== null && _a !== void 0 ? _a : undef],
            ["Text Channel", cmd.channel.id],
            ["Input", input]
        ];
        const maxLength = details.reduce((page, c) => Math.max(page, c[0].length), 0);
        const detailsString = details.map(row => `\`${row[0]}${" ​".repeat(maxLength - row[0].length)}\` ${row[1]}`).join("\n");
        snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
            flags: MessageFlags.IsComponentsV2,
            components: [{ type: ComponentType.TextDisplay, content: (_b = error.message) !== null && _b !== void 0 ? _b : "A load tracks exception occured, but no error message was provided" }]
        });
        snow.channel.createMessage(reportTarget, {
            flags: MessageFlags.IsComponentsV2,
            components: [
                {
                    type: ComponentType.Container,
                    accent_color: sharedUtils.ACCENT_COLOR_ERROR,
                    components: [
                        {
                            type: ComponentType.TextDisplay,
                            content: "Lavalink load tracks exception"
                        },
                        {
                            type: ComponentType.TextDisplay,
                            content: detailsString,
                        },
                        {
                            type: ComponentType.Separator
                        },
                        {
                            type: ComponentType.TextDisplay,
                            content: (_c = error.message) !== null && _c !== void 0 ? _c : undef
                        }
                    ]
                }
            ]
        });
    },
    handleTrackLoadsToArray(tracks) {
        switch (tracks.loadType) {
            case "empty":
            case "error":
                return null;
            case "track":
                return [tracks.data];
            case "playlist":
                return tracks.data.tracks;
            default:
                return tracks.data;
        }
    },
    inputToTrack(resource_1, cmd_1, lang_1, node_1) {
        return __awaiter(this, arguments, void 0, function* (resource, cmd, lang, node, doSelection = true) {
            var _a, _b, _c, _d, _e;
            resource = resource.replace(hiddenEmbedRegex, "");
            const llnode = (_b = (_a = (node ? common.nodes.byID(node) : void 0)) !== null && _a !== void 0 ? _a : common.nodes.byIdeal()) !== null && _b !== void 0 ? _b : common.nodes.random();
            const secondMatch = confprovider.config.second_matcher_regex.exec(resource);
            if (llnode.search_with_invidious && secondMatch) {
                let input = "", precedenceIndex = 0, precedence = -1;
                while (input === "") {
                    precedence = confprovider.config.second_matcher_group_precedence[precedenceIndex];
                    if (secondMatch[precedence])
                        input = secondMatch[precedence];
                    precedenceIndex++;
                    if (precedenceIndex === confprovider.config.second_matcher_group_precedence.length && input === "") {
                        snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
                            flags: MessageFlags.IsComponentsV2,
                            components: [{ type: ComponentType.TextDisplay, content: lang.GLOBAL.NO_RESULTS }]
                        });
                        return null;
                    }
                }
                const mode = (_c = confprovider.config.second_matcher_map[precedence]) !== null && _c !== void 0 ? _c : "search";
                let tracks;
                try {
                    tracks = mode === "search"
                        ? yield common.second.search(input, llnode.invidious_origin)
                        : [yield common.second.byID(input, llnode.invidious_origin)];
                }
                catch (e) {
                    common.handleTrackLoadError(cmd, e, resource);
                    return null;
                }
                if (!tracks.length) {
                    snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
                        flags: MessageFlags.IsComponentsV2,
                        components: [{ type: ComponentType.TextDisplay, content: lang.GLOBAL.NO_RESULTS }]
                    });
                    return null;
                }
                if (mode !== "search" || doSelection === false) {
                    return tracks.map(t => {
                        var _a, _b;
                        return new SecondTrack("!", {
                            identifier: t.videoId,
                            isSeekable: t.lengthSeconds !== 0,
                            author: t.author,
                            length: t.lengthSeconds * 1000,
                            isStream: t.lengthSeconds === 0,
                            position: 0,
                            title: t.title,
                            artworkUrl: (_b = (_a = t.videoThumbnails.find(t2 => t2.quality === "maxresdefault")) === null || _a === void 0 ? void 0 : _a.second__originalUrl) !== null && _b !== void 0 ? _b : t.videoThumbnails[0].second__originalUrl,
                            uri: confprovider.config.second_id_to_uri(t.videoId),
                            sourceName: "http"
                        }, resource, cmd.author, sharedUtils.getLang(cmd.guild_locale));
                    });
                }
                const chosen = yield trackSelection(cmd, lang, tracks, i => `${i.author} - ${i.title} (${sharedUtils.prettySeconds(i.lengthSeconds)})`);
                if (!chosen) {
                    snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
                        flags: MessageFlags.IsComponentsV2,
                        components: [{ type: ComponentType.TextDisplay, content: lang.GLOBAL.NO_RESULTS }]
                    });
                    return null;
                }
                return [
                    new SecondTrack("!", {
                        identifier: chosen.videoId,
                        isSeekable: chosen.lengthSeconds !== 0,
                        author: chosen.author,
                        length: chosen.lengthSeconds * 1000,
                        isStream: chosen.lengthSeconds === 0,
                        position: 0,
                        title: chosen.title,
                        artworkUrl: (_e = (_d = chosen.videoThumbnails.find(t2 => t2.quality === "maxresdefault")) === null || _d === void 0 ? void 0 : _d.second__originalUrl) !== null && _e !== void 0 ? _e : chosen.videoThumbnails[0].second__originalUrl,
                        uri: confprovider.config.second_id_to_uri(chosen.videoId),
                        sourceName: "http"
                    }, resource, cmd.author, sharedUtils.getLang(cmd.guild_locale))
                ];
            }
            else {
                let tracks;
                try {
                    tracks = yield common.loadtracks(resource, lang, llnode.id);
                }
                catch (e) {
                    common.handleTrackLoadError(cmd, e, resource);
                    return null;
                }
                const mapped = common.handleTrackLoadsToArray(tracks);
                if (!mapped) {
                    snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
                        flags: MessageFlags.IsComponentsV2,
                        components: [{ type: ComponentType.TextDisplay, content: lang.GLOBAL.NO_RESULTS }]
                    });
                    return null;
                }
                if (tracks.loadType !== "search" || doSelection === false) {
                    return mapped.map(track => decodedToTrack(track.encoded, track.info, resource, cmd.author, sharedUtils.getLang(cmd.guild_locale)));
                }
                const chosen = yield trackSelection(cmd, lang, tracks.data, i => `${i.info.author} - ${i.info.title} (${sharedUtils.prettySeconds(Math.round(Number(i.info.length) / 1000))})`);
                if (!chosen) {
                    snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
                        flags: MessageFlags.IsComponentsV2,
                        components: [{ type: ComponentType.TextDisplay, content: lang.GLOBAL.NO_RESULTS }]
                    });
                    return null;
                }
                return [
                    decodedToTrack(chosen.encoded, chosen.info, resource, cmd.author, sharedUtils.getLang(cmd.guild_locale))
                ];
            }
        });
    },
    loadtracks(input, lang, nodeID) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const node = (_b = (_a = (nodeID ? common.nodes.byID(nodeID) : void 0)) !== null && _a !== void 0 ? _a : common.nodes.byIdeal()) !== null && _b !== void 0 ? _b : common.nodes.random();
            const llnode = lavalink.nodes.get(node.id);
            if (!llnode)
                throw new LoadTracksError(`Lavalink node ${node.id} doesn't exist in lavacord`, node.id);
            if (!startsWithHTTP.test(input) && !searchShortRegex.test(input))
                input = `${confprovider.config.lavalink_default_search_prefix}${input}`;
            const data = yield Rest.load(llnode, input);
            if (data.loadType === "error")
                throw new LoadTracksError((_c = data.data.message) !== null && _c !== void 0 ? _c : lang.GLOBAL.UNKNOWN_TRACK_EXCEPTION, node.id);
            return data;
        });
    },
    second: {
        search(input, baseURL) {
            return __awaiter(this, void 0, void 0, function* () {
                const r = yield fetch(`${baseURL}/api/v1/search?q=${encodeURIComponent(input)}`);
                return r.json();
            });
        },
        byID(id, baseURL) {
            return __awaiter(this, void 0, void 0, function* () {
                const r = yield fetch(`${baseURL}/api/v1/videos/${id}`);
                const json = yield r.json();
                if ("error" in json)
                    throw new Error(json.error);
                return json;
            });
        }
    },
    queues: {
        createQueue(cmd_1, lang_1, state_1, node_1) {
            return __awaiter(this, arguments, void 0, function* (cmd, lang, state, node, followup = false) {
                const respond = (followup ? snow.interaction.createFollowupMessage : snow.interaction.editOriginalInteractionResponse).bind(snow.interaction);
                if (cmd.guild_id !== state.guild_id) {
                    respond(cmd.application_id, cmd.token, {
                        flags: MessageFlags.IsComponentsV2,
                        components: [{ type: ComponentType.TextDisplay, content: lang.GLOBAL.VC_IN_OTHER_GUILD }]
                    });
                    return null;
                }
                const queueFile = sync.require("./queue");
                const queue = new queueFile.Queue(cmd.guild_id, state.channel_id, cmd.channel.id);
                queue.lang = cmd.guild_locale ? sharedUtils.getLang(cmd.guild_locale) : lang;
                queue.interaction = cmd;
                snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
                    flags: MessageFlags.IsComponentsV2,
                    components: [
                        {
                            type: ComponentType.Container,
                            components: [
                                {
                                    type: ComponentType.TextDisplay,
                                    content: langReplace(lang.GLOBAL.NOW_PLAYING, {
                                        "song": `[**${lang.GLOBAL.HEADER_LOADING}**](${confprovider.config.website_protocol}://${confprovider.config.website_domain})\n\n\`[${sharedUtils.progressBar(18, 60, 60, `[${lang.GLOBAL.HEADER_LOADING}]`)}]\``
                                    })
                                }
                            ]
                        }
                    ]
                });
                try {
                    const player = yield lavalink.join({ channel: state.channel_id, guild: cmd.guild_id, node });
                    yield new Promise((res, rej) => {
                        const timer = setTimeout(() => {
                            queue.createResolveCallback = void 0;
                            rej(lang.GLOBAL.TIMED_OUT);
                        }, waitForClientVCJoinTimeout);
                        queue.createResolveCallback = () => {
                            clearTimeout(timer);
                            res();
                        };
                    });
                    queue.node = node;
                    queue.player = player;
                    queue.addPlayerListeners();
                    return queue;
                }
                catch (e) {
                    if (e !== lang.GLOBAL.TIMED_OUT)
                        console.error(e);
                    queue.destroy();
                    respond(cmd.application_id, cmd.token, {
                        flags: MessageFlags.IsComponentsV2,
                        components: [{ type: ComponentType.TextDisplay, content: `${langReplace(lang.GLOBAL.VC_NOT_JOINABLE, { username: cmd.author.username })}\n${yield sharedUtils.stringify(e)}` }]
                    });
                    snow.channel.createMessage(confprovider.config.error_log_channel_id, {
                        content: `Unable to join voice channel ${state.channel_id} in guild ${cmd.guild_id}\n\n${util.inspect(e, false, 3, false)}`
                    });
                    return null;
                }
            });
        },
        createQueueFromRestore(guildID, data) {
            return __awaiter(this, void 0, void 0, function* () {
                const node = data.node ? lavalink.nodes.get(data.node) : void 0;
                if (!node)
                    return void console.error(`Node ${data.node} doesn't exist in memory`);
                const queueFile = sync.require("./queue");
                const queue = new queueFile.Queue(guildID, data.voiceChannel.id, data.textChannelID);
                queue.lang = en_us;
                queue.node = data.node;
                queue.player = new Player(node, guildID);
                queue.loop = data.attributes.loop;
                for (const member of data.members) {
                    const tag = userTagRegex.exec(member.tag);
                    queue.listeners.set(member.id, {
                        id: member.id,
                        username: tag ? tag[1] : member.tag,
                        discriminator: tag ? tag[2] : "0",
                        global_name: "",
                        avatar: member.avatar
                    });
                }
                queue.pausedAt = data.pausedAt;
                if (data.pausedAt)
                    queue.player.paused = true;
                queue.trackStartTime = data.trackStartTime;
                const trackTypes = sync.require("./tracktypes");
                for (const track of data.tracks) {
                    const ctrack = new trackTypes[track.class](track.track, {
                        identifier: track.id,
                        isSeekable: track.seekable,
                        author: track.author,
                        length: track.length * 1000,
                        isStream: track.live,
                        position: 0,
                        title: track.title,
                        uri: track.uri,
                        isrc: track.isrc,
                        sourceName: track.source
                    }, track.input, {
                        id: confprovider.config.client_id,
                        username: "amanda_restore_internal",
                        discriminator: "0",
                        global_name: "Amanda Restore Internal",
                        avatar: null
                    }, queue.lang);
                    ctrack.complete = track.complete;
                    yield queue.addTrack(ctrack);
                }
                queue.addPlayerListeners();
                console.warn(`Restored queue ${guildID}`);
            });
        },
        getOrCreateQueue(cmd_1, lang_1) {
            return __awaiter(this, arguments, void 0, function* (cmd, lang, followup = false) {
                var _a, _b;
                let queue = (_a = queues.get(cmd.guild_id)) !== null && _a !== void 0 ? _a : null;
                const userVoiceState = yield redis.GET("voice", cmd.author.id);
                const respond = (followup ? snow.interaction.createFollowupMessage : snow.interaction.editOriginalInteractionResponse).bind(snow.interaction);
                if (!userVoiceState) {
                    respond(cmd.application_id, cmd.token, {
                        content: langReplace(lang.GLOBAL.VC_REQUIRED, { username: cmd.author.username })
                    });
                    return { queue: null, existed: !!queue };
                }
                if ((queue === null || queue === void 0 ? void 0 : queue.voiceChannelID) && userVoiceState.channel_id !== queue.voiceChannelID) {
                    respond(cmd.application_id, cmd.token, {
                        content: langReplace(lang.GLOBAL.MUSIC_SEE_OTHER, { channel: `<#${queue.voiceChannelID}>` })
                    });
                    return { queue: null, existed: true };
                }
                if (queue)
                    return { queue, existed: true };
                const node = (_b = common.nodes.byIdeal()) !== null && _b !== void 0 ? _b : common.nodes.random();
                queue = yield common.queues.createQueue(cmd, lang, userVoiceState, node.id, followup).catch(() => null);
                if (!queue)
                    return { queue: null, existed: false };
                return { queue, existed: false };
            });
        },
        doChecks(cmd, lang, isAddTrack = false) {
            if (!confprovider.config.redis_enabled) {
                snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.VOICE_STATUS_OFFLINE });
                return false;
            }
            if (!confprovider.config.music_enabled && isAddTrack) {
                snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.MUSIC_DISABLED });
                return false;
            }
            if (!cmd.guild_id) {
                snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.GUILD_ONLY });
                return false;
            }
            return true;
        },
        getQueueWithRequiredPresence(cmd, lang) {
            const queue = queues.get(cmd.guild_id);
            if (!queue) {
                snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
                    content: langReplace(lang.GLOBAL.NOTHING_PLAYING, { username: cmd.author.username })
                });
                return null;
            }
            if (!queue.listeners.has(cmd.author.id)) {
                snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
                    content: langReplace(lang.GLOBAL.MUSIC_SEE_OTHER, { channel: `<#${queue.voiceChannelID}>` })
                });
                return null;
            }
            return queue;
        }
    }
};
function trackSelection(cmd, lang, trackss, label) {
    if (trackss.length === 0)
        return Promise.resolve(null);
    const component = new buttons.BetterComponent({
        type: 3,
        placeholder: lang.GLOBAL.HEADER_SONG_SELECTION,
        min_values: 1,
        max_values: 1,
        options: trackss.slice(0, 24).map((s, index) => ({ label: label(s).slice(0, 98), value: String(index), description: langReplace(lang.GLOBAL.TRACK_NUMBER, { "number": index + 1 }), default: false }))
    }, {});
    return new Promise(res => {
        const timer = new sharedUtils.BetterTimeout(() => {
            component.destroy();
            snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
                flags: MessageFlags.IsComponentsV2,
                components: [
                    {
                        type: ComponentType.Container,
                        components: [
                            {
                                type: ComponentType.TextDisplay,
                                content: lang.GLOBAL.SONG_SELECTION_CANCELLED
                            }
                        ]
                    }
                ]
            });
            return res(null);
        }, selectTimeout).run();
        component.setCallback((interaction) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (((_b = (_a = interaction.member) === null || _a === void 0 ? void 0 : _a.user) !== null && _b !== void 0 ? _b : interaction.user).id != cmd.author.id)
                return;
            const select = interaction;
            component.destroy();
            timer.clear();
            const selected = trackss[Number(select.data.values[0])];
            yield snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
                flags: MessageFlags.IsComponentsV2,
                components: [{
                        type: ComponentType.Container,
                        components: [
                            {
                                type: ComponentType.TextDisplay,
                                content: label(selected)
                            }
                        ]
                    }]
            });
            return res(selected);
        }));
        snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
            flags: MessageFlags.IsComponentsV2,
            components: [
                {
                    type: ComponentType.Container,
                    components: [
                        {
                            type: ComponentType.TextDisplay,
                            content: langReplace(lang.GLOBAL.SONG_SELECTION_FOOTER, { "timeout": sharedUtils.shortTime(selectTimeout) })
                        },
                        {
                            type: ComponentType.ActionRow,
                            components: [component.component]
                        },
                        {
                            type: ComponentType.Separator
                        },
                        {
                            type: ComponentType.TextDisplay,
                            content: langReplace(lang.GLOBAL.RESULTS_COUNT, { "count": trackss.length })
                        }
                    ]
                }
            ]
        });
    });
}
function decodedToTrack(track, info, input, requester, lang) {
    const trackTypes = require("./tracktypes");
    const type = sourceMap.get(info.sourceName);
    const TrackConstructor = (type ? trackTypes[type] : trackTypes["Track"]);
    return new TrackConstructor(track, info, input, requester, lang);
}
