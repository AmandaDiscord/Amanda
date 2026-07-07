var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const { sync, confprovider } = passthrough;
const common = sync.require("./utils");
const sharedUtils = sync.require("@amanda/shared-utils");
const feelingFrisky = "Feeling Frisky?";
const friskyLyrics = "[Intro]\nFeeling frisky?\n\n[Verse ∞]\nFrisky...\n\n[Chorus]\n<other lyrics and bloops>\n\n";
const radioStations = new Map([
    ["frisky", {
            "original": {
                title: "Frisky Radio: Original",
                author: feelingFrisky,
                url: "http://stream.friskyradio.com/frisky_mp3_hi",
                viewURL: "https://frisky.fm",
                lyrics: friskyLyrics
            },
            "deep": {
                title: "Frisky Radio: Deep",
                author: feelingFrisky,
                url: "http://deep.friskyradio.com/friskydeep_aachi",
                viewURL: "https://frisky.fm",
                lyrics: friskyLyrics
            },
            "chill": {
                title: "Frisky Radio: Chill",
                author: feelingFrisky,
                url: "http://chill.friskyradio.com/friskychill_mp3_high",
                viewURL: "https://frisky.fm",
                lyrics: friskyLyrics
            },
            "classics": {
                title: "Frisky Radio: Classics",
                author: feelingFrisky,
                url: "https://stream.classics.friskyradio.com/mp3_high",
                viewURL: "https://frisky.fm",
                lyrics: friskyLyrics
            }
        }],
    ["listenmoe", {
            "japanese": {
                title: "Listen.moe: Japanese",
                author: "Delivering the best JPOP and KPOP music around!",
                url: "https://listen.moe/opus",
                viewURL: "https://listen.moe"
            },
            "korean": {
                title: "Listen.moe: Korean",
                author: "Delivering the best JPOP and KPOP music around!",
                url: "https://listen.moe/kpop/opus",
                viewURL: "https://listen.moe"
            }
        }],
    ["radionet", {
            "absolutechillout": {
                title: "Absolute Chillout",
                author: "Absolute Chillout",
                url: "https://streaming.live365.com/b05055_128mp3",
                viewURL: "https://www.radio.net/s/absolutechillout"
            },
            "swissjazz": {
                title: "Radio Swiss Jazz",
                author: "Radio Swiss Jazz",
                url: "https://stream.srg-ssr.ch/m/rsj/mp3_128",
                viewURL: "https://www.radio.net/s/swissjazz"
            },
            "yogachill": {
                title: "Yoga Chill",
                author: "VIP Chill",
                url: "https://radio4.vip-radios.fm:18027/stream-128kmp3-YogaChill",
                viewURL: "https://www.radio.net/s/vipyoga"
            },
            "therock": {
                title: "95.7 The Rock",
                author: "KMKO-FM",
                url: "https://live.wostreaming.net/direct/alphacorporate-kmkofmaac-imc4",
                viewURL: "https://www.radio.net/s/kmkofm"
            },
            "classiccountry": {
                title: "104.9 Classic Country",
                author: "Classic Country",
                url: "https://ice10.securenetsystems.net/OZARK",
                viewURL: "https://www.radio.net/s/classiccountry1049"
            },
            "thesurf": {
                title: "94.9 The Surf FM",
                author: "The Surf FM",
                url: "https://ice24.securenetsystems.net/WVCO",
                viewURL: "https://www.radio.net/s/949thesurffm"
            },
            "gayfm": {
                title: "Gay FM",
                author: "Gay FM",
                url: "https://icepool.silvacast.com/GAYFM.mp3",
                viewURL: "https://www.radio.net/s/gayfm"
            },
            "aardvarkblues": {
                title: "Aardvark Blues",
                author: "BluesFM",
                url: "https://streaming.live365.com/b77280_128mp3",
                viewURL: "https://www.radio.net/s/aardvarkblues"
            }
        }]
]);
const radioStationGenres = new Map([
    ["jpop", ["listenmoe/japanese"]],
    ["kpop", ["listenmoe/korean"]],
    ["chillout", ["frisky/chill", "radionet/absolutechillout", "radionet/yogachill"]],
    ["house", ["frisky/deep"]],
    ["jazz", ["radionet/swissjazz"]],
    ["rock", ["radionet/therock"]],
    ["country", ["radionet/classiccountry"]],
    ["oldies", ["radionet/thesurf"]],
    ["electro", ["radionet/gayfm"]],
    ["blues", ["radionet/aardvarkblues"]]
]);
export class Track {
    constructor(track, info, input, requester, lang) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        this.track = track;
        this.input = input;
        this.requester = requester;
        this.lang = lang;
        this.npUpdateFrequency = 15000;
        this.noPauseReason = "";
        this.error = "";
        this.thumbnail = { src: confprovider.config.unknown_placeholder, width: 128, height: 128 };
        this.complete = true;
        this._filledBarOffset = 0;
        this.title = (_a = info.title) !== null && _a !== void 0 ? _a : lang.GLOBAL.UNKNOWN_TRACK;
        this.author = (_b = info.author) !== null && _b !== void 0 ? _b : lang.GLOBAL.UNKNOWN_AUTHOR;
        this.lengthSeconds = Math.round(Number((_c = info.length) !== null && _c !== void 0 ? _c : 0) / 1000);
        this.id = (_d = info.identifier) !== null && _d !== void 0 ? _d : "!";
        this.live = (_e = info.isStream) !== null && _e !== void 0 ? _e : false;
        this.canSeek = (_f = info.isSeekable) !== null && _f !== void 0 ? _f : !info.isStream;
        this.source = (_g = info.sourceName) !== null && _g !== void 0 ? _g : lang.GLOBAL.HEADER_UNKNOWN;
        this.uri = (_h = info.uri) !== null && _h !== void 0 ? _h : null;
        this.isrc = (_j = info.isrc) !== null && _j !== void 0 ? _j : null;
        this.queueLine = `**${this.title}** (${sharedUtils.prettySeconds(this.lengthSeconds)})`;
        if (info.artworkUrl)
            this.thumbnail.src = info.artworkUrl;
    }
    showLink() {
        var _a;
        return Promise.resolve((_a = this.uri) !== null && _a !== void 0 ? _a : `${confprovider.config.website_protocol}://${confprovider.config.website_domain}`);
    }
    showInfo() {
        var _a, _b, _c;
        return Promise.resolve((_a = this.uri) !== null && _a !== void 0 ? _a : ((_c = (_b = this.queue) === null || _b === void 0 ? void 0 : _b.lang) !== null && _c !== void 0 ? _c : this.lang).GLOBAL.SONG_INFO_GENERIC);
    }
    prepare() {
        return Promise.resolve(void 0);
    }
    resume() {
        return void 0;
    }
    destroy() {
        return void 0;
    }
    toObject() {
        return {
            class: this.constructor.name,
            track: this.track,
            id: this.id,
            title: this.title,
            length: this.lengthSeconds,
            thumbnail: this.thumbnail,
            live: this.live,
            uri: this.uri,
            source: this.source,
            author: this.author,
            isrc: this.isrc,
            input: this.input,
            seekable: this.canSeek,
            complete: this.complete
        };
    }
    getProgress(time, paused) {
        var _a, _b;
        const lang = (_b = (_a = this.queue) === null || _a === void 0 ? void 0 : _a.lang) !== null && _b !== void 0 ? _b : this.lang;
        if (this.live) {
            const part = "= ⋄ ==== ⋄ ===";
            const fragment = sharedUtils.substr(part, 7 - this._filledBarOffset, 7);
            const bar = `${fragment.repeat(3)}`;
            this._filledBarOffset++;
            if (this._filledBarOffset >= 7)
                this._filledBarOffset = 0;
            return `\`[ ${sharedUtils.prettySeconds(time)} ​${bar}​ ${lang.GLOBAL.HEADER_LIVE} ]\``;
        }
        else {
            const max = this.lengthSeconds;
            const rightTime = sharedUtils.prettySeconds(max);
            if (time > max)
                time = max;
            const leftTime = sharedUtils.prettySeconds(time);
            const bar = sharedUtils.progressBar(18, time, max, paused ? ` [${lang.GLOBAL.HEADER_PAUSED}] ` : "");
            return `\`[ ${leftTime} ${bar} ${rightTime} ]\``;
        }
    }
    getLyrics() {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof this.lyricsCache === "string" || this.lyricsCache === null)
                return this.lyricsCache;
            const picked = common.genius.pickApart(this);
            if (!picked.artist || !picked.title)
                return this.assignLyrics(null);
            let lyrics;
            try {
                lyrics = yield common.genius.getLyrics(picked.title, picked.artist);
                if (!lyrics && picked.artist && picked.confidence === 1)
                    lyrics = yield common.genius.getLyrics(picked.artist, picked.title);
            }
            catch (_a) {
                lyrics = null;
            }
            return this.assignLyrics(lyrics);
        });
    }
    assignLyrics(lyrics) {
        this.lyricsCache = lyrics;
        return lyrics;
    }
}
export class RequiresSearchTrack extends Track {
    constructor(track = null, info, input, requester, lang) {
        var _a, _b, _c;
        super(track !== null && track !== void 0 ? track : "!", info, input, requester, lang);
        this.complete = false;
        this.searchString = (_b = (_a = info.uri) !== null && _a !== void 0 ? _a : info.identifier) !== null && _b !== void 0 ? _b : ((info.author && info.title) ? `${info.author} - ${info.title}` : (_c = info.title) !== null && _c !== void 0 ? _c : "");
        this.queueLine = `**${this.title}** (${sharedUtils.prettySeconds(this.lengthSeconds)})`;
        this.prepareCache = new sharedUtils.AsyncValueCache(() => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            if (this.complete)
                return;
            let tracks;
            try {
                if (!this.searchString.length)
                    throw new Error("Cannot search track by empty string");
                tracks = yield common.loadtracks(this.searchString, this.lang, (_a = this.queue) === null || _a === void 0 ? void 0 : _a.node);
            }
            catch (e) {
                this.error = e.message;
                return;
            }
            let chosen;
            if (tracks.loadType === "track")
                chosen = tracks.data;
            else if (tracks.loadType === "playlist")
                chosen = tracks.data.tracks[0];
            else if (tracks.loadType === "search")
                chosen = tracks.data[0];
            if (chosen === null || chosen === void 0 ? void 0 : chosen.encoded) {
                this.track = chosen.encoded;
                if (this.author === lang.GLOBAL.UNKNOWN_AUTHOR)
                    this.author = chosen.info.author;
                if (chosen.info.artworkUrl)
                    this.thumbnail.src = chosen.info.artworkUrl;
                this.complete = true;
                if (this.queue)
                    this.queue.sendToSubscribedSessions("onTrackUpdate", this, this.queue.tracks.indexOf(this));
            }
            else if (chosen && !chosen.encoded)
                this.error = langReplace(((_c = (_b = this.queue) === null || _b === void 0 ? void 0 : _b.lang) !== null && _c !== void 0 ? _c : this.lang).GLOBAL.MISSING_TRACK, { "id": this.searchString });
            else
                this.error = ((_e = (_d = this.queue) === null || _d === void 0 ? void 0 : _d.lang) !== null && _e !== void 0 ? _e : this.lang).GLOBAL.NO_RESULTS;
        }));
    }
    prepare() {
        return this.prepareCache.get();
    }
}
const pathnamereg = /\/?(\w+)\.\w+$/;
const underscoreRegex = /_/g;
export class ExternalTrack extends Track {
    constructor(track, info, input, requester, lang) {
        var _a, _b, _c;
        super(track, info, input, requester, lang);
        this.id = String(Date.now());
        this.thumbnail = { src: confprovider.config.local_placeholder, width: 512, height: 512 };
        if (!info.title || info.title === "Unknown title") {
            const to = new URL(info.uri);
            const match = pathnamereg.exec(to.pathname);
            this.title = decodeEntities(((_b = (_a = match === null || match === void 0 ? void 0 : match[1]) === null || _a === void 0 ? void 0 : _a.replaceAll(underscoreRegex, " ")) !== null && _b !== void 0 ? _b : lang.GLOBAL.UNKNOWN_TRACK).replaceAll(underscoreRegex, " "));
        }
        this.live = (_c = info.isStream) !== null && _c !== void 0 ? _c : true;
        this.queueLine = this.live
            ? `**${this.title}** (${this.lang.GLOBAL.HEADER_LIVE})`
            : `**${this.title}** (${sharedUtils.prettySeconds(this.lengthSeconds)})`;
        this.noPauseReason = this.live ? this.lang.GLOBAL.CANNOT_PAUSE_LIVE : this.noPauseReason;
    }
    showLink() {
        return this.uri ? Promise.resolve(this.uri) : super.showLink();
    }
}
export class RadioTrack extends RequiresSearchTrack {
    constructor(track, _info, _input, requester, lang, station) {
        var _a;
        if (station)
            _input = station;
        const [namespace, substation] = _input.split("/");
        const stationData = (_a = radioStations.get(namespace)) === null || _a === void 0 ? void 0 : _a[substation];
        if (!stationData)
            throw new Error("Invalid radio station");
        const newInfo = {
            sourceName: "http",
            identifier: stationData.url,
            length: 0,
            isStream: true,
            position: 0,
            title: stationData.url,
            uri: stationData.url,
            isSeekable: false,
            author: stationData.author
        };
        super(track, newInfo, _input, requester, lang);
        this.thumbnail = { src: confprovider.config.local_placeholder, width: 512, height: 512 };
        this.canSeek = false;
        this.title = stationData.title;
        this.author = stationData.author;
        this.stationData = stationData;
        this.queueLine = `**${this.stationData.title}** (${this.lang.GLOBAL.HEADER_LIVE})`;
        this.noPauseReason = this.live ? this.lang.GLOBAL.CANNOT_PAUSE_LIVE : this.noPauseReason;
        this.searchString = stationData.url;
    }
    showLink() {
        return Promise.resolve(this.stationData.viewURL);
    }
    showInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            return `Try finding more radio stations like this one on ${yield this.showLink()}`;
        });
    }
    getLyrics() {
        var _a;
        return Promise.resolve((_a = this.stationData.lyrics) !== null && _a !== void 0 ? _a : null);
    }
    static randomFromGenre(genre, requester, lang) {
        const fromGenre = radioStationGenres.get(genre);
        if (!(fromGenre === null || fromGenre === void 0 ? void 0 : fromGenre.length))
            return null;
        return new RadioTrack("!", {}, "", requester, lang, sharedUtils.arrayRandom(fromGenre));
    }
    static random(requester, lang) {
        const keys = Array.from(radioStationGenres.keys());
        const genre = sharedUtils.arrayRandom(keys);
        return RadioTrack.randomFromGenre(genre, requester, lang);
    }
}
export class SecondTrack extends RequiresSearchTrack {
    constructor(track, info, input, requester, lang, secondData) {
        super(track, info, input, requester, lang);
        this.completeData = null;
        this.canSeek = false;
        if (secondData) {
            if ("adaptiveFormats" in secondData)
                this.processSecondData(secondData);
        }
        this.secondDataPrepareCache = new sharedUtils.AsyncValueCache(() => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            if (this.completeData || this.complete)
                return;
            const node = (_c = (_b = (((_a = this.queue) === null || _a === void 0 ? void 0 : _a.node) ? common.nodes.byID(this.queue.node) : void 0)) !== null && _b !== void 0 ? _b : common.nodes.byIdeal()) !== null && _c !== void 0 ? _c : common.nodes.random();
            let data;
            try {
                data = yield common.second.byID(this.id, node.invidious_origin);
            }
            catch (e) {
                this.error = e.message;
                return;
            }
            this.processSecondData(data);
        }));
    }
    processSecondData(data) {
        var _a, _b;
        const audioOnly = data.adaptiveFormats
            .filter(f => f.second__mime.startsWith("audio/"));
        const selected = (_b = (_a = audioOnly.find(f => f.qualityLabel === "medium" || f.qualityLabel === "medium, DRC")) !== null && _a !== void 0 ? _a : audioOnly.find(f => f.qualityLabel === "low" || f.qualityLabel === "low, DRC")) !== null && _b !== void 0 ? _b : data.adaptiveFormats[0];
        this.searchString = selected.url;
        this.completeData = data;
    }
    prepare() {
        const _super = Object.create(null, {
            prepare: { get: () => super.prepare }
        });
        return __awaiter(this, void 0, void 0, function* () {
            if (this.completeData || this.complete)
                return _super.prepare.call(this);
            yield this.secondDataPrepareCache.get();
            return _super.prepare.call(this);
        });
    }
    getLyrics() {
        const _super = Object.create(null, {
            getLyrics: { get: () => super.getLyrics }
        });
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            if (typeof this.lyricsCache === "string" || this.lyricsCache === null)
                return this.lyricsCache;
            const preferred = (_c = (_b = (_a = this.completeData) === null || _a === void 0 ? void 0 : _a.captions.find(c => { var _a, _b; return c.languageCode === ((_b = (_a = this.queue) === null || _a === void 0 ? void 0 : _a.lang.CODE) !== null && _b !== void 0 ? _b : this.lang.CODE); })) === null || _b === void 0 ? void 0 : _b.second__remoteUrl) !== null && _c !== void 0 ? _c : null;
            const english = (_f = (_e = (_d = this.completeData) === null || _d === void 0 ? void 0 : _d.captions.find(c => c.languageCode === "en")) === null || _e === void 0 ? void 0 : _e.second__remoteUrl) !== null && _f !== void 0 ? _f : null;
            const chosen = preferred !== null && preferred !== void 0 ? preferred : english;
            if (chosen) {
                const remote = yield fetch(chosen).then(r => r.text());
                if (!remote.startsWith("WEBVTT")) {
                    console.error(remote);
                    return _super.getLyrics.call(this);
                }
                const split = remote.split("\n");
                const sliced = split.slice(4);
                let result = "";
                for (let i = 0; i < sliced.length / 3; i++) {
                    result += sliced[(i * 3) + 1] + "\n";
                }
                return this.assignLyrics(result);
            }
            else
                return _super.getLyrics.call(this);
        });
    }
}
const translateRegex = /&(nbsp|amp|quot|lt|gt);/g;
const entityCodeRegex = /&#(\d+);/gi;
function decodeEntities(encodedString) {
    const translate = {
        "nbsp": " ",
        "amp": "&",
        "quot": "\"",
        "lt": "<",
        "gt": ">"
    };
    return encodedString.replace(translateRegex, function (_, entity) {
        return translate[entity];
    }).replace(entityCodeRegex, function (_, numStr) {
        const num = Number.parseInt(numStr, 10);
        return String.fromCodePoint(num);
    });
}
