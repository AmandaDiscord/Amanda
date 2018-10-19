module.exports = function(passthrough) {
	let { Discord, client, utils } = passthrough;

	const buttons = { // {(<:([a-z0-9_]+):[0-9]+>) ?} / {"\2": "\1",\n        }
		// Numbers
		"0": "<:bn_0:327896448081592330>",
		"1": "<:bn_1:327896448232325130>",
		"2": "<:bn_2:327896448505217037>",
		"3": "<:bn_3:327896452363976704>",
		"4": "<:bn_4:327896452464508929>",
		"5": "<:bn_5:327896454733627403>",
		"6": "<:bn_6:327896456369274880>",
		"7": "<:bn_7:327896458067968002>",
		"8": "<:bn_8:327896459070537728>",
		"9": "<:bn_9:327896459292704769>"
	}

	const waifuGifts = [
		["Flowers", 800],
		["Cupcakes", 2000],
		["Thigh highs", 5000],
		["Soft toy", 20000],
		["Fancy dinner", 40000],
		["Expensive pudding", 50000],
		["Trip to Timbuktu", 250000]
	]

	const commonActions = {
		purchaseWaifuItem: [{type: "js", data: async function(msg, emoji, user, name) {
			let info = await utils.getWaifuInfo(user.id);
			if (!info.waifu) return msg.channel.send(user.username+", you don't have a waifu to send the gift to!");
			let coins = await utils.coinsManager.get(user.id);
			let gift = waifuGifts.find(g => g[0] == name);
			if (coins < price[1]) return msg.channel.send(user.username+", you cannot afford that gift!");
			utils.coinsManager.award(user.id, -gift[1]);
			utils.sql.all("UPDATE waifu SET price = ? WHERE userID = ?", [info.waifuPrice + gift[2], user.id]);
			utils.sql.all("INSERT INTO WaifuGifts VALUES (NULL, ?, ?, ?)", [user.id, info.waifu.id, name]);
			msg.channel.send("Purchased the "+name.toLowerCase()+"!");
		}}]
	}

	const paths = [
		{
			name: "Waifu gifts",
			description: "Purchase gifts for your waifu",
			actions: [{
				type: "menu",
				data: [
					{
						name: "Flowers",
						price: 800,
						description: "What better way to show your affection? (+800 value)",
						actions: commonActions.purchaseWaifuItem
					},{
						name: "Cupcakes",
						price: 2000,
						description: "Yum! (+2100 value)",
						actions: commonActions.purchaseWaifuItem
					},{
						name: "Thigh highs",
						price: 5000,
						description: "Loved by catgirls everywhere. (+5500 value)",
						actions: commonActions.purchaseWaifuItem
					},{
						name: "Soft toy",
						price: 20000,
						description: "Something to snuggle up to. (+22500 value)",
						actions: commonActions.purchaseWaifuItem
					},{
						name: "Fancy dinner",
						price: 40000,
						description: "Table for two, please. (+46000 value)",
						actions: commonActions.purchaseWaifuItem
					},{
						name: "Expensive pudding",
						price: 50000,
						description: "Worth every penny. (+58000 value)",
						actions: commonActions.purchaseWaifuItem
					},{
						name: "Trip to Timbuktu",
						price: 250000,
						description: "Don't forget your camera! (+300000 value)",
						actions: commonActions.purchaseWaifuItem
					}
				]
			}]
		}
	]

	let commands = {
		"shop": {
			usage: "none",
			description: "Purchase things for yourself and others",
			aliases: ["shop", "store"],
			category: "interaction",
			process: async function(msg) {
				let menu = paths;
				let menuMsg;
				let selectedIndex = null;
				let alreadyReacted = [];
				async function menuReactionManager(msg, emoji, user) {
					let buttonIndex = parseInt(emoji.name.match(/\d+/)[0])-1;
					if (!menu[buttonIndex]) return;
					if (selectedIndex != buttonIndex) {
						selectedIndex = buttonIndex;
						displayMenu();
					} else {
						for (let action of menu[selectedIndex].actions) {
							if (action.type == "menu") {
								menu = action.data;
								selectedIndex = null;
								displayMenu();
							} else if (action.type == "js") {
								let promise = action.data(msg, emoji, user, menu[selectedIndex].name);
								if (promise.constructor.name == "Promise") await promise;
							}
						}
					}
				}
				async function displayMenu() {
					let items = [], prices = [], reactions = [];
					menu.map((item, index) => {
						items.push((selectedIndex == index ? "<:chevrons:501565146536345604> " : "<:bl:501565696132513792> ")+`${buttons[index+1]} ${item.name}`);
						prices.push(item.price ? "<a:Discoin:422523472128901140> "+item.price : "Submenu");
						if (!alreadyReacted.includes(buttons[index+1])) {
							alreadyReacted.push(buttons[index+1]);
							reactions.push(buttons[index+1]);
						}
					});
					let embed = new Discord.RichEmbed()
					.setTitle("Shop")
					.addField("Item", items.join("\n"), true)
					.addField("Price", prices.join("\n"), true)
					.addField("Description", selectedIndex != null ? menu[selectedIndex].description : "(no item selected)", false);
					if (menuMsg) menuMsg.edit(embed);
					else {
						menuMsg = await msg.channel.send(embed);
						let maxItemCount = (function searchSubpaths(menu) {
							return [menu.length].concat(...menu.map(item => item.actions.filter(action => action.type == "menu").map(action => searchSubpaths(action.data)))).sort((a, b) => (b - a))[0];
						}(menu));
						let reactionMenu = Array(maxItemCount).fill().map((_, i) => ({emoji: client.emojis.get(client.parseEmoji(buttons[i+1]).id), allowedUsers: [msg.author.id], remove: "user", actionType: "js", actionData: menuReactionManager}));
						menuMsg.reactionMenu(reactionMenu);
					}
				}
				displayMenu();
			}
		}
	}
	return commands;
}