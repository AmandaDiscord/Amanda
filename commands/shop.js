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

	let messageMenus = [];

	const commonActions = {
		purchaseWaifuItem: [{type: "js", data: async function(msg, emoji, user, name) {
			let info = await utils.waifu.get(user.id);
			if (!info.waifu) return msg.channel.send(user.username+", you don't have a waifu to send the gift to!");
			let coins = await utils.coinsManager.get(user.id);
			let gift = waifuGifts.find(g => g[0] == name);
			if (coins < price[1]) return msg.channel.send(user.username+", you cannot afford that gift!");
			utils.coinsManager.award(user.id, -gift[1]);
			utils.waifu.transact(user.id, gift[2]);
			utils.sql.all("INSERT INTO WaifuGifts VALUES (NULL, ?, ?, ?)", [user.id, info.waifu.id, name]);
			msg.channel.send("Purchased the "+name.toLowerCase()+"!");
		}}]
	}

	const paths = [
		{
			name: "Waifu gifts",
			description: "Purchase gifts for your waifu",
			actions: [{
				type: "reactionMenu",
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
					}
				]
			}]
		},
		{
			name: "Waifu gifts message menu",
			description: "Electric Boogaloo",
			actions: [{
				type: "messageMenu",
				data: [
					[
						{
							name: "Page 1 item 1",
							price: 800,
							description: "blah",
							actions: commonActions.purchaseWaifuItem
						},{
							name: "Page 1 item 2",
							price: 800,
							description: "blah",
							actions: commonActions.purchaseWaifuItem
						}
					],
					[
						{
							name: "Page 2 item 1",
							price: 800,
							description: "blah",
							actions: commonActions.purchaseWaifuItem
						},{
							name: "Page 2 item 2",
							price: 800,
							description: "blah",
							actions: commonActions.purchaseWaifuItem
						}
					]
				]
			}]
		}
	]

	utils.addTemporaryListener(client, "message", __filename, msg => {
		let menu = messageMenus.find(menu => menu.channel == msg.channel && menu.user == msg.author);
		if (!menu) return;
		let item = menu.page.find(item => item.name.toLowerCase() == msg.content.toLowerCase());
		if (!item) return msg.channel.send("That item doesn't exist. Did you spell it correctly?");
		messageMenus = messageMenus.filter(m => m != menu);
		menu.actionManager(item, msg.content, msg.author);
	});

	let commands = {
		"shop": {
			usage: "none",
			description: "Purchase things for yourself and others",
			aliases: ["shop", "store"],
			category: "interaction",
			process: async function(msg) {
				messageMenus = messageMenus.filter(m => !(m.channel == msg.channel && m.user == msg.author));
				let menu = paths;
				let menuType = "reactionMenu";
				let menuMsg;
				let selectedIndex = null;
				let alreadyReacted = [];
				async function actionManager(item, emoji, user) {
					for (let action of item.actions) {
						if (action.type == "reactionMenu") {
							menu = action.data;
							menuType = "reactionMenu";
							selectedIndex = null;
							displayMenu();
						} else if (action.type == "messageMenu") {
							menu = action.data;
							menuType = "messageMenu";
							selectedIndex = 0;
							messageMenus.push({channel: msg.channel, user: msg.author, page: menu[selectedIndex], actionManager});
							displayMenu();
						} else if (action.type == "js") {
							let promise = action.data(msg, emoji, user, item);
							if (promise.constructor.name == "Promise") await promise;
						}
					}
				}
				async function menuReactionManager(msg, emoji, user) {
					if (["bn_ba", "bn_fo"].includes(emoji.name)) { // arrows
						if (menuType != "messageMenu") return;
						if (emoji.name == "bn_ba") {
							selectedIndex--;
							if (selectedIndex < 0) selectedIndex = menu.length-1;
						} else if (emoji.name == "bn_fo") {
							selectedIndex++;
							if (selectedIndex >= menu.length) selectedIndex = 0;
						}
						messageMenus = messageMenus.filter(m => !(m.channel == msg.channel && m.user == user));
						messageMenus.push({channel: msg.channel, user: user, page: menu[selectedIndex], actionManager});
						displayMenu();
					} else { // numbers
						if (menuType != "reactionMenu") return;
						let buttonIndex = parseInt(emoji.name.match(/\d+/)[0])-1;
						if (!menu[buttonIndex]) return;
						if (selectedIndex != buttonIndex) {
							selectedIndex = buttonIndex;
							displayMenu();
						} else {
							return actionManager(menu[selectedIndex], emoji, user);
						}
					}
				}
				async function displayMenu() {
					let embed;
					if (menuType == "reactionMenu") {
						let items = [], prices = [], reactions = [];
						menu.forEach((item, index) => {
							items.push((selectedIndex == index ? "<:chevrons:501565146536345604> " : "<:bl:501565696132513792> ")+`${buttons[index+1]} ${item.name}`);
							prices.push(item.price ? "<a:Discoin:422523472128901140> "+item.price : "Submenu");
							if (!alreadyReacted.includes(buttons[index+1])) {
								alreadyReacted.push(buttons[index+1]);
								reactions.push(buttons[index+1]);
							}
						});
						embed = new Discord.RichEmbed()
						.setTitle("Shop")
						.addField("Item", items.join("\n"), true)
						.addField("Price", prices.join("\n"), true)
						.addField("Description", selectedIndex != null ? menu[selectedIndex].description : "(no item selected)", false)
						.setFooter("Click a reaction to highlight a menu item. Click again to accept.")
					} else if (menuType == "messageMenu") {
						embed = new Discord.RichEmbed()
						let items = [], prices = [];
						menu[selectedIndex].forEach(item => {
							items.push(item.name);
							prices.push(item.price ? "<a:Discoin:422523472128901140> "+item.price : "Submenu");
						});
						embed = new Discord.RichEmbed()
						.setTitle(`Shop (page ${selectedIndex+1} of ${menu.length})`)
						.addField("Item", items.join("\n"), true)
						.addField("Price", prices.join("\n"), true)
						.setFooter("Use the arrows to change pages. To select an item, type its name in chat.")
					}
					if (menuMsg) menuMsg.edit(embed);
					else {
						menuMsg = await msg.channel.send(embed);
						let reactionMenu = ["<:bn_ba:328062456905728002>", "<:bn_fo:328724374465282049>"].map(b => ({emoji: client.emojis.get(client.parseEmoji(b).id), allowedUsers: [msg.author.id], remove: "user", actionType: "js", actionData: menuReactionManager}));
						if (menuType == "reactionMenu") {
							let maxItemCount = (function searchSubpaths(menu) {
								return [menu.length].concat(...menu.map(item => item.actions.filter(action => action.type == "menu").map(action => searchSubpaths(action.data)))).sort((a, b) => (b - a))[0];
							}(menu));
							reactionMenu.push(...Array(maxItemCount).fill().map((_, i) => ({emoji: client.emojis.get(client.parseEmoji(buttons[i+1]).id), allowedUsers: [msg.author.id], remove: "user", actionType: "js", actionData: menuReactionManager})));
						}
						menuMsg.reactionMenu(reactionMenu);
					}
				}
				displayMenu();
			}
		}
	}
	return commands;
}