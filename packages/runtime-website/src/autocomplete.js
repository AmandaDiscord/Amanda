var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const { confprovider, sync } = passthrough;
const sharedUtils = sync.require("@amanda/shared-utils");
import { en_us as English } from "@amanda/lang";
const likeEscapeRegex = /[%_\\]/g;
export const handlers = new Map();
const ownerOnlyActions = new Set([
    English.playlists.options.add.name,
    English.playlists.options.remove.name,
    English.playlists.options.move.name,
    English.playlists.options.lists.options.delete.name
]);
handlers.set(English.playlists.name, (interaction) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    if (!confprovider.config.db_enabled)
        return [];
    const focused = sharedUtils.findFocusedOption(interaction.data.options);
    if (typeof (focused === null || focused === void 0 ? void 0 : focused.value) !== "string")
        return [];
    const topOption = (_a = interaction.data.options) === null || _a === void 0 ? void 0 : _a[0];
    const action = (topOption === null || topOption === void 0 ? void 0 : topOption.name) === English.playlists.options.lists.name ? focused.name : topOption === null || topOption === void 0 ? void 0 : topOption.name;
    const escaped = focused.value.replace(likeEscapeRegex, "\\$&");
    let matches;
    if (ownerOnlyActions.has(action !== null && action !== void 0 ? action : "")) {
        const userID = (_d = ((_c = (_b = interaction.member) === null || _b === void 0 ? void 0 : _b.user) !== null && _c !== void 0 ? _c : interaction.user)) === null || _d === void 0 ? void 0 : _d.id;
        if (!userID)
            return [];
        matches = yield sql.all("SELECT name FROM playlists WHERE author = $1 AND name ILIKE $2 || '%' ORDER BY name LIMIT 25", [userID, escaped]);
    }
    else {
        matches = yield sql.all("SELECT name FROM playlists WHERE name ILIKE $1 || '%' ORDER BY name LIMIT 25", [escaped]);
    }
    return matches.map(row => ({ name: row.name, value: row.name }));
}));
handlers.set(English.settings.name, (interaction) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const focused = sharedUtils.findFocusedOption(interaction.data.options);
    if ((focused === null || focused === void 0 ? void 0 : focused.name) !== English.settings.options.modify.name || typeof focused.value !== "string")
        return [];
    const settingOption = (_a = interaction.data.options) === null || _a === void 0 ? void 0 : _a.find(option => option.name === English.settings.options.setting.name);
    const settingName = settingOption === null || settingOption === void 0 ? void 0 : settingOption.value;
    const setting = sharedUtils.profileSettings[settingName !== null && settingName !== void 0 ? settingName : ""];
    if (!(setting === null || setting === void 0 ? void 0 : setting.allowedValues))
        return [];
    const search = focused.value.toLowerCase();
    return setting.allowedValues
        .map(String)
        .concat(setting.nullable ? ["null"] : [])
        .filter(value => value.toLowerCase().startsWith(search))
        .slice(0, 25)
        .map(value => ({ name: value, value }));
}));
