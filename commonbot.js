const userEmojiMessage = {channelID: "434994415342321674", messageID: "434994502848217099"};

module.exports = function(input) {
    let {bot, cf, db, reloadEvent} = input;
    let userEmojis = {};
    let reactionMenus = {};
    let messageMenus = [];

    reloadEvent.once(__filename, function() {
        console.log("removed listener");
        bot.removeListener("message", messageHandler);
        bot.removeListener("messageReactionAdd", reactionHandler);
    });

    let availableFunctions = {
        messageCharacterLimit: 2000,
        // Button reactions.
        buttons: { // {(<:([a-z0-9_]+):[0-9]+>) ?} / {"\2": "\1",\n        }
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
            "9": "<:bn_9:327896459292704769>",
            // Words
            "end": "<:bn_en:327896461272678400>",
            // Punctuation
            "exclamation": "<:bn_ex:331164187831173120>",
            "question": "<:bn_qu:331164190267932672>",
            // Operators
            "plus": "<:bn_pl:328041457695064064>",
            "minus": "<:bn_mi:328042285704937472>",
            "times": "<:bn_ti:327986149203116032>",
            "plusminus": "<:bn_pm:327986149022760960>",
            // Arrows
            "left": "<:bn_ba:328062456905728002>",
            "down": "<:bn_do:328724374498836500>",
            "up": "<:bn_up:328724374540779522>",
            "right": "<:bn_fo:328724374465282049>",
            "redo": "<:bn_re:362741439211503616>",
            "point down": "<:cbn_ptd:389238901233025034>",
            // Other symbols
            "person": "<:cbn_person:362387757592739850>",
            "cards": "<:cbn_cards:362384965989826561>",
            "info": "<:cbn_info:377710017627029505>",
            "tick": "<:cbn_tick:378414422219161601>",
            "clock": "<:cbn_clock:381652491999117313>",
            "yes": "<:bn_yes:331164192864206848>",
            "no": "<:bn_no:331164190284972034>",
            "blank": "<:bn_bl:330501355737448450>",
            "green tick": "✅",
            "green cross": "❎"
        },
        // Given a userID and serverID, return the user's display name.
        userIDToNick: function(userID, serverID, prefer) {
            if (!bot.users[userID]) return "(unknown user: "+userID+")";
            if (!prefer) prefer = "";
            if (serverID && bot.servers[serverID].members[userID]) {
                if (bot.servers[serverID].members[userID].nick) {
                    if (prefer.startsWith("user")) {
                        return bot.users[userID].username+" ("+bot.servers[serverID].members[userID].nick+")";
                    } else if (prefer.startsWith("nick")) {
                        return bot.servers[serverID].members[userID].nick+" ("+bot.users[userID].username+")";
                    } else {
                        return bot.servers[serverID].members[userID].nick;
                    }
                }
            }
            return bot.users[userID].username;
        },
        // Given a userID and serverID, return the colour of the user's name.
        userIDToColour: function(userID, serverID) {
            let role = bot.servers[serverID].members[userID].roles.map(r => bot.servers[serverID].roles[r]).sort((a,b) => b.position-a.position).filter(r => r.color != 0)[0];
            return role ? role.color : 0x808080;
        },
        // Given a userID or channelID, return its display name.
        nameOfChannel: function(channelID) {
            let channelName = "an unnamed channel";
            if (bot.users[channelID]) {
                channelName = "@"+bot.users[channelID].username;
            } else if (bot.directMessages[channelID]) {
                /*if (bot.directMessages[channelID].recipients) { // Using LC's lib
                    channelName = "@"+bot.directMessages[channelID].recipients[0].username;
                } else { // Not using LC's lib*/
                    channelName = "@"+bot.directMessages[channelID].recipient.username;
                /*}*/
            } else {
                channelName = "#"+bot.channels[channelID].name;
            }
            return channelName;
        },
        // Actually not always to an object, but to a usable form.
        emojiToObject: function(emoji) {
            if (typeof(emoji) == "object" && !emoji.id) {
                return emoji.name;
            }
            if (typeof(emoji) != "string") return emoji;
            let customEmojiRegex = /^<:(\w{2,}):([0-9]{8,})>$/;
            if (emoji.match(customEmojiRegex)) {
                return {name: emoji.replace(customEmojiRegex, "$1"), id: emoji.replace(customEmojiRegex, "$2")};
            }
            return emoji;
        },
        // Send a message to a channel.
        sendMessage: function(channelID, message, callback, additional) {
            if (typeof(callback) == "object") {
                additional = callback;
                callback = new Function();
            } else if (typeof(callback) != "function") {
                callback = new Function(); // Create an empty callback function to use instead
            }
            if (!additional) additional = {};
            if (!channelID) { // Obviously a channelID is needed
                cf.log("Need a channelID to send a message to", "warning");
                return;
            }
            if (!message && !additional.embed) { // Empty messages don't work, so don't try
                cf.log("Cannot send empty message", "warning");
                return;
            }
            if (typeof(message) == "object") { // Convert objects to strings
                if (additional.largeObject) {
                    message = JSON.stringify(message, null, 4);
                } else {
                    message = JSON.stringify(message);
                }
            }
            new Promise(function(resolve, reject) {
                if (additional.mention) {
                    db.get("SELECT mention FROM Users WHERE userID = ?", additional.mention, function(err, dbr) {
                        if (dbr && dbr.mention == 1) {
                            message = "<@"+additional.mention+"> "+message;
                        }
                        delete additional.mention;
                        resolve();
                    });
                } else {
                    resolve();
                }
            }).then(function() {
                bot.sendMessage(Object.assign({to: channelID, message: message}, additional), function(err, res) { // Actually send the message
                    if (err) { // Handle various errors
                        if (err.statusMessage == "TOO MANY REQUESTS") { // Rate limit
                            cf.log("Message blocked by rate limit, retrying in "+err.response.retry_after, "info");
                            setTimeout(function() { // Try again after the timeout
                                availableFunctions.sendMessage(channelID, message, callback, additional);
                            }, err.response.retry_after);
                        } else if (err.response && err.response.content && typeof(err.response.content[0]) == "string" && err.response.content[0].match(/^Must be [1-9][0-9]* or fewer in length.$/)) { // Character limit
                            if (additional.characterLimit) {
                                let newMessage = additional.characterLimit;
                                delete additional.characterLimit; // Prevent the error message from hitting the character limit again
                                availableFunctions.sendMessage(channelID, newMessage, callback, additional);
                            } else {
                                availableFunctions.sendMessage(channelID, "Oops. I didn't manage to send a message because it exceeded Discord's character limit. This was probably your fault.", callback, additional);
                                cf.log("Message exceeded character limit", "warning");
                            }
                        } else if (err.response.message == "Missing Access") {
                            cf.log("No permission to send messages in that channel", "warning");
                        } else { // Unknown error
                            cf.log(cf.stringify(err, true), "error");
                            callback(err);
                        }
                    } else { // Success
                        if (additional.embed) {
                            cf.log(`Sent a message to ${availableFunctions.nameOfChannel(channelID)} (${channelID}).`, "spam"); // Log information about what happened
                        } else {
                            cf.log(`Sent a message to ${availableFunctions.nameOfChannel(channelID)} (${channelID}): ${message} (${res.id})`, "spam");
                        }
                        callback(err, res.id, res);
                    }
                });
            });
        },
        // Edit a message sent by the bot.
        editMessage: function(channelID, messageID, message, callback, additional) {
            if (!additional) additional = {};
            if (!channelID) {
                cf.log("Need a channelID to edit a message in", "warning");
                return;
            }
            if (!messageID) {
                cf.log("Need a messageID to edit", "warning");
                return;
            }
            if (!message && !additional.embed) {
                cf.log("Need a message to edit to", "warning");
                return;
            }
            if (!callback) callback = new Function();
            bot.editMessage(Object.assign({channelID: channelID, messageID: messageID, message: message}, additional), function(err, res) {
                if (err) {
                    if (err.statusCode == 50005) { // Sent by another user
                        cf.log("Message was sent by another user and cannot be edited", "info");
                        callback(err);
                    } else {
                        cf.log(cf.stringify(err, true), "error");
                        callback(err);
                    }
                } else {
                    cf.log(`Edited a message in ${availableFunctions.nameOfChannel(channelID)} (${channelID}) to: ${message}`, "spam"); // Log information about what happened
                    callback(err);
                }
            });
        },
        // React to a message.
        addReaction: function(channelID, messageID, reaction, callback, RSRBcheck) {
            if (!channelID) {
                cf.log("Need a channelID to react in", "warning");
                return;
            }
            if (!messageID) {
                cf.log("Need a messageID to react to", "warning");
                return;
            }
            if (!reaction) {
                cf.log("Need a reaction to react with", "warning");
                return;
            }
            if (!callback) callback = new Function();
            reaction = availableFunctions.emojiToObject(reaction); // Convert emoji strings to objects
            new Promise(function(resolve, reject) {
                if (!RSRBcheck) {
                    resolve();
                } else {
                    bot.getMessage({channelID: channelID, messageID: messageID}, function(err, res) { if (!err) {
                        //cf.log(res.author.id);
                        if (res.author.id == "309960863526289408") { // Don't add reactions to messages from RSRB
                            cf.log(`Skipping reacting to ${res.author.username} with ${reaction}`, "warning");
                            callback("RSRB");
                            reject();
                        } else {
                            resolve();
                        }
                    }});
                }
            }).then(function() {
                bot.addReaction({channelID: channelID, messageID: messageID, reaction: reaction}, function(err, res) {
                    if (err) {
                        if (err.statusMessage == "TOO MANY REQUESTS") {
                            cf.log("Reaction blocked by rate limit, retrying in "+err.response.retry_after, "spam");
                            setTimeout(function() {
                                availableFunctions.addReaction(channelID, messageID, reaction, callback);
                            }, err.response.retry_after);
                        } else {
                            cf.log(`${channelID}, ${messageID}, ${cf.stringify(reaction)}`, "error");
                            cf.log(cf.stringify(err, true), "error");
                            callback(err);
                        }
                    } else {
                        callback(err, res);
                    }
                });
            });
        },
        // Add multiple reactions to a message, in order.
        addReactions: function(channelID, messageID, reactions, callback) {
            if (!channelID) {
                cf.log("Need a channelID to react in", "warning");
                return;
            }
            if (!messageID) {
                cf.log("Need a messageID to react to", "warning");
                return;
            }
            if (!reactions.length) {
                cf.log("Need some reactions to react with", "warning");
                return;
            }
            if (!callback) callback = new Function();
            function addNextReaction() {
                if (reactions.length > 0) {
                    availableFunctions.addReaction(channelID, messageID, reactions.shift(), addNextReaction);
                } else {
                    callback();
                }
            }
            addNextReaction();
        },
        // Remove a reaction from a message.
        removeReaction: function(channelID, messageID, reaction, userID, callback) {
            if (!channelID) {
                cf.log("Need a channelID to remove reactions in", "warning");
                return;
            }
            if (!messageID) {
                cf.log("Need a messageID to remove reactions on", "warning");
                return;
            }
            if (!reaction) {
                cf.log("Need a reaction to remove", "warning");
                return;
            }
            if (!userID) userID = bot.id;
            if (!callback) callback = new Function();
            reaction = availableFunctions.emojiToObject(reaction); // Convert emoji strings to objects
            bot.removeReaction({channelID: channelID, messageID: messageID, reaction: reaction, userID: userID}, function(err, res) {
                if (err) {
                    if (err.statusMessage == "TOO MANY REQUESTS") {
                        cf.log("Reaction removal blocked by rate limit, retrying in "+err.response.retry_after, "spam");
                        setTimeout(function() {
                            availableFunctions.removeReaction(channelID, messageID, reaction, userID, callback);
                        }, err.response.retry_after);
                    } else {
                        //cf.log(`${channelID}, ${messageID}, ${cf.stringify(reaction)}`, "error");
                        cf.log(cf.stringify(err, true), "error");
                        callback(err);
                    }
                } else {
                    cf.log(`Removed the reaction ${reaction} from a message (${messageID}) in ${availableFunctions.nameOfChannel(channelID)} (${channelID})`, "spam");
                    callback(err, res);
                }
            });
        },
        // Remove multiple reactions from a message, with several filters available.
        removeReactions: function(channelID, messageID, reactions, users, callback) {
            if (!channelID) {
                cf.log("Need a channelID to remove reactions in", "warning");
                return;
            }
            if (!messageID) {
                cf.log("Need a messageID to remove reactions on", "warning");
                return;
            }
            if (!reactions) {
                cf.log("Need some reactions to remove", "warning");
                return;
            }
            reactions = reactions.map(r => availableFunctions.emojiToObject(r));
            function userIncludeFunction(userID) {
                if (users) return users.includes(userID);
                else return true;
            }
            if (!callback) callback = new Function();
            let remaining = 0;
            bot.getMessage({channelID: channelID, messageID: messageID}, function(err, res) {
                if (err) {
                    cf.log(cf.stringify(err, true), "error");
                } else {
                    res.reactions.filter(re => reactions.some(ar => cf.slimMatch([ar, availableFunctions.emojiToObject(re.emoji)]) || ar == re.emoji.name)).forEach(re => bot.getReaction({channelID: channelID, messageID: messageID, reaction: availableFunctions.emojiToObject(re.emoji)}, function(err, res) {
                        res.map(u => u.id).filter(id => userIncludeFunction(id)).forEach(id => {
                            remaining++;
                            availableFunctions.removeReaction(channelID, messageID, availableFunctions.emojiToObject(re.emoji), id, function() {
                                if (!--remaining) callback();
                            });
                            //cf.log("Now removing "+availableFunctions.emojiToObject(re.emoji)+channelID+messageID+id);
                        });
                    }));
                }
                //cf.log(r, "info");
            });
        },
        // Create a reaction menu
        reactionMenu: function(channelID, message, actions, callback) { // actions = [{emoji: {name: "", id: ""}, actionType: "(reply|js)", actionData: (Function|String)}, ...]
            let isID = false;
            if (!channelID) {
                cf.log("Need a channelID to put a menu in", "warning");
                return;
            }
            if (!message) {
                cf.log("Need a message to send or messageID to use", "warning");
                return;
            }
            if (!callback) callback = new Function();
            new Promise(function(resolve, reject) {
                if (message.match(/^[0-9]{16,}$/)) { // If message is actually a messageID
                    bot.getMessage({channelID: channelID, messageID: message}, function(e,r) { // Make sure it's valid
                        try { // If messageID is not valid,
                            if (e.response.message == "Unknown Message") {
                                resolve(); // continue
                            }
                        } catch (e) { // If messageID is valid
                            isID = r;
                            resolve();
                        }
                    });
                } else { // If message is a message,
                    resolve(); // continue
                }
            }).then(function() {
                new Promise(function(resolve, reject) {
                    if (isID) {
                        resolve();
                    } else if (bot.users[channelID]) {
                        bot.createDMChannel(channelID, function(err, res) {
                            if (err) callback(err);
                            else {
                                channelID = res.id;
                                resolve();
                            }
                        });
                    } else {
                        resolve();
                    }
                }).then(function() {
                    if (!isID) {
                        availableFunctions.sendMessage(channelID, message, function(err, messageID, res) {
                            if (messageID) {
                                availableFunctions.addReactions(channelID, messageID, actions.map(a => a.emoji), function() {
                                    callback(err, messageID, res);
                                });
                                reactionMenus[messageID] = {actions: actions, channelID: channelID};
                            } else {
                                callback(err);
                            }
                        });
                    } else {
                        reactionMenus[message] = {actions: actions, channelID: channelID};
                        if (isID.reactions) {
                            actions = actions.filter(action => {
                                let match = isID.reactions.map(r => r.emoji).find(r => {
                                    let t1 = availableFunctions.emojiToObject(r);
                                    let t2 = availableFunctions.emojiToObject(action.emoji);
                                    if (t1 == t2 || (t1.id && t2.id && t1.id == t2.id)) return true;
                                });
                                if (match) return false;
                                else return true;
                            });
                        }
                        if (actions.length) {
                            availableFunctions.addReactions(channelID, message, actions.map(a => a.emoji), function() {
                                callback(null, message);
                            });
                        }
                    }
                });
            });
        },
        // Create a message menu
        messageMenu: function(channelID, message, userID, pattern, action, callback) {
            let isID = false;
            if (!channelID) {
                cf.log("Need a channelID to put a menu in", "warning");
                return;
            }
            if (!message) {
                cf.log("Need a message to send", "warning");
                return;
            }
            if (!userID) {
                cf.log("Need a userID to detect a response from", "warning");
                return;
            }
            if (!pattern) pattern = /.*/;
            if (!action) {
                cf.log("Need an action to perform", "warning");
                return;
            }
            if (!callback) callback = new Function();
            new Promise(function(resolve, reject) {
                if (isID) {
                    resolve();
                } else if (bot.users[channelID]) {
                    bot.createDMChannel(channelID, function(err, res) {
                        if (err) callback(err);
                        else {
                            channelID = res.id;
                            resolve();
                        }
                    });
                } else {
                    resolve();
                }
            }).then(function() {
                new Promise(function(resolve, reject) {
                    if (message.match(/^[0-9]{16,}$/)) { // If message is actually a messageID
                        bot.getMessage({channelID: channelID, messageID: message}, function(e,r) { // Make sure it's valid
                            try { // If messageID is not valid,
                                if (e.response.message == "Unknown Message") {
                                    resolve(); // continue
                                }
                            } catch (e) { // If messageID is valid
                                isID = true;
                                resolve();
                            }
                        });
                    } else { // If message is a message,
                        resolve(); // continue
                    }
                }).then(function() {
                    messageMenus = messageMenus.filter(m => !(m.channelID == channelID && m.userID == userID));
                    if (!isID) {
                        availableFunctions.sendMessage(channelID, message, function(err, messageID) {
                            if (messageID) {
                                messageMenus.push({channelID: channelID, userID: userID, pattern: pattern, action: action});
                                callback(err, messageID);
                            } else {
                                callback(err);
                            }
                        });
                    } else {
                        messageMenus.push({channelID: channelID, userID: userID, pattern: pattern, action: action});
                        callback(null, message);
                    }
                });
            });
        },
        // Create a channel
        createChannel(serverID, name, type, parentID, callback) {
            if (!serverID) {
                cf.log("Need a serverID to create a channel in", "warning");
                return;
            }
            if (!name) {
                cf.log("Need a name to give to the new channel", "warning");
                return;
            }
            if (!["text", "voice"].includes(type)) {
                cf.log('Need a type of channel to create (either "text" or "voice")');
                return;
            }
            if (!parentID) parentID = undefined;
            if (!callback) callback = new Function();
            bot.createChannel({serverID: serverID, name: name, type: type, parentID: parentID}, function(err, res) {
                if (err) {
                    if ((err.response.name[0] || "").startsWith("Text channel names")) {
                        cf.log(err.response.name[0], "warning");
                        callback(err);
                    } else {
                        cf.log(cf.stringify(err, true), "error");
                        callback(err);
                    }
                } else {
                    cf.log(`Created a ${type} channel named ${name} in the server ${bot.servers[serverID].name} (${serverID})`+(parentID ? ` inside the category ${availableFunctions.nameOfChannel(parentID)} (${parentID})` : ""), "info");
                    callback(err, res.id, res);
                }
            });
        },
        // Delete a channel
        deleteChannel(channelID, callback) {
            if (!channelID) {
                cf.log("Need a channelID to delete", "warning");
                return;
            }
            if (!callback) callback = new Function();
            bot.deleteChannel(channelID, function(err) {
                if (err) {
                    cf.log(cf.stringify(err, true), "error");
                } else {
                    cf.log("Deleted the channel "+channelID, "info");
                }
                callback(err);
            });
        }
    }
    // Make reaction menus work
    bot.on("messageReactionAdd", reactionHandler);
    function reactionHandler(event) {
        if (event.d.user_id == bot.id) return;
        //cf.log(event, "info");
        if (reactionMenus[event.d.message_id]) {
            let menu = reactionMenus[event.d.message_id]; // "menu" is faster to type
            //cf.log(event.d.emoji.name+" // "+menu.actions[0].emoji+" // "+event.d.emoji.name==menu.actions[0].emoji);
            menu.actions.filter(a => cf.slimMatch([availableFunctions.emojiToObject(a.emoji), event.d.emoji]) || a.emoji == event.d.emoji.name).forEach(function(action) { // Only matching emojis
                if (!action.allowedUsers || action.allowedUsers.includes(event.d.user_id)) { // Only take action if the userID is allowed
                    switch (action.actionType) { // Do different things depending on the action type
                    case "reply": // Reply, mention the user in the same channel and give a message
                        availableFunctions.sendMessage(event.d.channel_id, `${action.actionData}`, {mention: event.d.user_id});
                        break;
                    case "edit": // Edit the message containing the menu reactions
                        bot.editMessage({channelID: event.d.channel_id, messageID: event.d.message_id, message: action.actionData});
                        break;
                    case "js": // Run JS code
                        action.actionData(event, reactionMenus);
                        break;
                    }
                    switch (action.ignore) { // Sometimes ignore repeat actions
                    case "that": // Disable actions for that emoji
                        menu.actions = menu.actions.map(a => {
                            if (cf.slimMatch([availableFunctions.emojiToObject(a.emoji), availableFunctions.emojiToObject(action.emoji)])) {
                                Object.assign(a, {actionType: "none"});
                            }
                            return a;
                        });
                        break;
                    case "all": // Disable actions for all emojis
                        menu.actions.map(a => Object.assign(a, {actionType: "none"}));
                        break;
                    case "total": // Stop treating the message as a menu
                        delete reactionMenus[event.d.message_id];
                        break;
                    }
                    switch (action.remove) { // Sometimes remove certain emojis after being clicked
                    case "user": // Remove the user's reaction only
                        availableFunctions.removeReaction(event.d.channel_id, event.d.message_id, action.emoji, event.d.user_id);
                        break;
                    case "bot": // Remove the bot's reaction that the user matched
                        availableFunctions.removeReaction(event.d.channel_id, event.d.message_id, action.emoji, bot.id);
                        break;
                    case "that": // Remove everyone's reactions that the user matched
                        availableFunctions.removeReactions(event.d.channel_id, event.d.message_id, [action.emoji]);
                        break;
                    case "menu": // Remove all reactions belonging to that menu
                        availableFunctions.removeReactions(event.d.channel_id, event.d.message_id, menu.actions.map(a => a.emoji));
                        break;
                    case "all": // Remove all reactions on that message
                        bot.removeAllReactions({channelID: event.d.channel_id, messageID: event.d.message_id});
                        break;
                    case "message": // Delete the message containing the menu reactions
                        bot.deleteMessage({channelID: event.d.channel_id, messageID: event.d.message_id});
                        break;
                    }
                } else if (action.remove == "user") { // If the user is not allowed, but their reaction should be removed
                    availableFunctions.removeReaction(event.d.channel_id, event.d.message_id, action.emoji, event.d.user_id); // Remove it.
                }
            });
        }
    }
    // Make message menus work
    bot.on("message", messageHandler);
    function messageHandler(user, userID, channelID, message, event) {
        let menu = messageMenus.filter(m => m.channelID == channelID && m.userID == userID && message.match(m.pattern))[0];
        if (menu) {
            menu.action(message, event);
            messageMenus = messageMenus.filter(m => !(m.channelID == channelID && m.userID == userID));
        }
    }
    return availableFunctions;
};
