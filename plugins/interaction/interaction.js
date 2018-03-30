exports.commands = [
  "hug",
  "kiss",
  "cuddle",
  "poke",
  "slap",
  "boop",
  "pat",
  "stab",
]

const Discord = require("discord.js");

exports.hug = {
    usage: "<@user>",
    description: "Gives someone a hug",
    process: function(djs, dio, msg, args) {
	if(msg.channel.type !== 'text'){
		msg.channel.send("Why would you wanna hug someone in DMs?");
		return
	}
        var argArr = args.split(' ');
        var toHug = argArr[0];
        var toFilter = argArr[1];
        if(!toHug) {
            msg.channel.send(`${msg.author.username}, you need to specify someone to hug`);
            return
        }
            if(toHug.match(new RegExp(`<@!?${djs.user.id}>`))) {
            	msg.channel.send(`**Hugs ${msg.author.username} back** :heart:`);
            	return
            }else if(toHug.match(new RegExp(`<@!?${msg.author.id}>`))) {
               msg.channel.send("That's not strange at all...");
               return
            }
        if(toFilter) {
            msg.channel.send(`${msg.author.username}, this command doesn't take any arguments other than someone to hug`);
            return
        }
        else {
        	var hug1 = 'https://cdn.rawgit.com/bitsnake/RandomResources/67981444/hug1.png';
        	var hug2 = 'https://cdn.rawgit.com/bitsnake/RandomResources/ae6b68ef/hug2.PNG';
        	var hug3 = 'https://cdn.rawgit.com/bitsnake/RandomResources/ae6b68ef/hug3.PNG';
        	var hug4 = 'https://cdn.rawgit.com/bitsnake/RandomResources/ae6b68ef/hug4.png';
        	var hug5 = 'https://cdn.rawgit.com/bitsnake/RandomResources/67981444/hug5.jpg';
        	var hug6 = 'https://cdn.rawgit.com/bitsnake/RandomResources/67981444/hug6.jpg';
        	var hugIMGArray = [hug1, hug2, hug3, hug4, hug5, hug6];
        	var randHugIMG = hugIMGArray[Math.floor(Math.random() * hugIMGArray.length)];
        	const embed = new Discord.RichEmbed()
        		.setDescription(`**${msg.author.username} gave a hug to ${toHug}**`)
        		.setImage(randHugIMG)
            msg.channel.send({embed});
            return
        }
    }
},

exports.kiss = {
	usage: "<@user>",
	description: "Gives someone a kiss",
	process: function(djs, dio, msg, args) {
		if(msg.channel.type !== 'text'){
		msg.channel.send("Why would you wanna kiss someone in DMs?");
		return
	}
		var argArr = args.split(' ');
		var toKiss = argArr[0];
		var toFilter = argArr[1];
		if(!toKiss) {
			msg.channel.send(`${msg.author.username}, you need to specify someone to kiss`);
			return
		}
			if(toKiss.match(new RegExp(`<@!?${djs.user.id}>`))) {
				msg.channel.send(`**Kisses ${msg.author.username} back** :heart:`);
				return
			}else if(toKiss.match(new RegExp(`<@!?${msg.author.id}>`))) {
               msg.channel.send(`W-What? Why, ${msg.author.username}?`);
               return
            }
		if(toFilter) {
			msg.channel.send(`${msg.author.username}, this command doesn't take any arguments other than someone to kiss`);
			return
		}
		else {
			var kiss1 = 'https://cdn.rawgit.com/bitsnake/RandomResources/67981444/kiss1.png';
			var kiss2 = 'https://cdn.rawgit.com/bitsnake/RandomResources/ae6b68ef/kiss2.png';
			var kiss3 = 'https://cdn.rawgit.com/bitsnake/RandomResources/67981444/kiss3.jpg';
			var kissIMGArray = [kiss1, kiss2, kiss3];
			var randKissIMG = kissIMGArray[Math.floor(Math.random() * kissIMGArray.length)];
        	const embed = new Discord.RichEmbed()
        		.setDescription(`**${msg.author.username} kissed ${toKiss}**`)
        		.setImage(randKissIMG)
            msg.channel.send({embed});
			return
		}
	}
},

exports.cuddle = {
	usage: "<@user>",
	description: "Cuddles someone",
	process: function(djs, dio, msg, args) {
		if(msg.channel.type !== 'text'){
		msg.channel.send("Why would you wanna cuddle someone in DMs?");
		return
	}
		var argArr = args.split(' ');
		var toCuddle = argArr[0];
		var toFilter = argArr[1];
		if(!toCuddle) {
			msg.channel.send(`${msg.author.username}, you need to specify someone to cuddle`);
			return
		}
			if(toCuddle.match(new RegExp(`<@!?${djs.user.id}>`))) {
				msg.channel.send(`**Cuddles ${msg.author.username} back** :heart:`);
				return
			}else if(toCuddle.match(new RegExp(`<@!?${msg.author.id}>`))) {
               msg.channel.send("I find it strange that you tried to do that...");
               return
            }
		if(toFilter) {
			msg.channel.send(`${msg.author.username}, this command doesn't take any arguments other than someone to cuddle`);
			return
		}
		else {
			var cuddle1 = 'https://cdn.rawgit.com/bitsnake/RandomResources/ae6b68ef/cuddle1.png';
        	var cuddle2 = 'https://cdn.rawgit.com/bitsnake/RandomResources/ae6b68ef/cuddle2.PNG';
        	var cuddle3 = 'https://cdn.rawgit.com/bitsnake/RandomResources/67981444/cuddle3.jpg';
        	var cuddleIMGArray = [cuddle1, cuddle2, cuddle3]
        	var randCuddleIMG = cuddleIMGArray[Math.floor(Math.random() * cuddleIMGArray.length)];
        	const embed = new Discord.RichEmbed()
        		.setDescription(`**${msg.author.username} cuddled ${toCuddle}**`)
        		.setImage(randCuddleIMG)
            msg.channel.send({embed});
			return
		}
	}
},

exports.poke = {
	usage: "<@user>",
	description: "Pokes someone",
	process: function(djs, dio, msg, args) {
		if(msg.channel.type !== 'text'){
		msg.channel.send("Why would you wanna poke someone in DMs?");
		return
	}
		var argArr = args.split(' ');
		var toPoke = argArr[0];
		var toFilter = argArr[1];
		if(!toPoke) {
			msg.channel.send(`${msg.author.username}, you need to specify someone to poke`);
			return
		}
			if(toPoke.match(new RegExp(`<@!?${djs.user.id}>`))) {
				msg.channel.send("Don't poke me ; ^ ;");
				return
			}else if(toPoke.match(new RegExp(`<@!?${msg.author.id}>`))) {
               msg.channel.send("Ok then...");
               return
            }
		if(toFilter) {
			msg.channel.send(`${msg.author.username}, this command doesn't take any arguments other than someone to poke`);
			return
		}
		else {
			var poke1 = 'https://cdn.rawgit.com/bitsnake/RandomResources/ae6b68ef/poke1.png';
        	var poke2 = 'https://cdn.rawgit.com/bitsnake/RandomResources/ae6b68ef/poke2.png';
        	var poke3 = 'https://cdn.rawgit.com/bitsnake/RandomResources/ae6b68ef/poke3.PNG';
        	var poke4 = 'https://cdn.rawgit.com/bitsnake/RandomResources/67981444/poke4.gif';
        	var pokeIMGArray = [poke1, poke2, poke3, poke4]
        	var randPokeIMG = pokeIMGArray[Math.floor(Math.random() * pokeIMGArray.length)];
        	const embed = new Discord.RichEmbed()
        		.setDescription(`**${msg.author.username} poked ${toPoke}**`)
        		.setImage(randPokeIMG)
            msg.channel.send({embed});
			return
		}
	}
},

exports.slap = {
	usage: "<@user>",
	description: "Slaps someone",
	process: function(djs, dio, msg, args) {
		if(msg.channel.type !== 'text'){
		msg.channel.send("Why would you wanna slap someone in DMs?");
		return
	}
		var argArr = args.split(' ');
		var toSlap = argArr[0];
		var toFilter = argArr[1];
		if(!toSlap) {
			msg.channel.send(`${msg.author.username}, you need to specify someone to slap`);
			return
		}
			if(toSlap.match(new RegExp(`<@!?${djs.user.id}>`))) {
				msg.channel.send(`**Slaps ${msg.author.username} back** That hurt me ; ^ ;`);
				return
			}else if(toSlap.match(new RegExp(`<@!?${msg.author.id}>`))) {
               msg.channel.send("Come on... Don't make yourself look like an idiot...");
               return
            }
		if(toFilter) {
			msg.channel.send(`${msg.author.username}, this command doesn't take any arguments other than someone to slap`);
			return
		}
		else {
			var slap1 = 'https://cdn.rawgit.com/bitsnake/RandomResources/ae6b68ef/slap1.PNG';
        	var slap2 = 'https://cdn.rawgit.com/bitsnake/RandomResources/ae6b68ef/slap2.png';
        	var slap3 = 'https://cdn.rawgit.com/bitsnake/RandomResources/67981444/slap4.jpg';
        	var slap4 = 'https://cdn.rawgit.com/bitsnake/RandomResources/67981444/slap5.jpg';
        	var slapIMGArray = [slap1, slap2, slap3, slap4]
        	var randSlapIMG = slapIMGArray[Math.floor(Math.random() * slapIMGArray.length)];
        	const embed = new Discord.RichEmbed()
        		.setDescription(`**${msg.author.username} slapped ${toSlap}**`)
        		.setImage(randSlapIMG)
            msg.channel.send({embed});
			return
		}
	}
},

exports.boop = {
	usage: "<@user>",
	description: "Boop someone",
	process: function(djs, dio, msg, args) {
		if(msg.channel.type !== 'text'){
		msg.channel.send("Why would you wanna boop someone in DMs?");
		return
	}
		var argArr = args.split(' ');
		var toBoop = argArr[0];
		var toFilter = argArr[1];
		if(!toBoop) {
			msg.channel.send(`${msg.author.username}, you need to specify someone to boop`);
			return
		}
			if(toBoop.match(new RegExp(`<@!?${djs.user.id}>`))) {
				msg.channel.send("Dun boop me ; ^ ;");
				return
			}else if(toBoop.match(new RegExp(`<@!?${msg.author.id}>`))) {
               msg.channel.send("Why even try?");
               return
            }
		if(toFilter) {
			msg.channel.send(`${msg.author.username}, this command doesn't take any arguments other than someone to boop`);
			return
		}
		else {
			var randBoopIMG = Math.floor(Math.random() * (4 - 1) + 1);
        	const embed = new Discord.RichEmbed()
        		.setDescription(`**${msg.author.username} booped ${toBoop}**`)
        		.setImage("https://cdn.rawgit.com/bitsnake/RandomResources/ae6b68ef/boop" + randBoopIMG + ".png")
            msg.channel.send({embed});
			return
		}
	}
},

exports.pat = {
	usage: "<@user>",
	description: "Pat someone",
	process: function(djs, dio, msg, args) {
		if(msg.channel.type !== 'text'){
		msg.channel.send("Why would you wanna Pat someone in DMs?");
		return
	}
		var argArr = args.split(' ');
		var toPat = argArr[0];
		var toFilter = argArr[1];
		if(!toPat) {
			msg.channel.send(`${msg.author.username}, you need to specify someone to pat`);
			return
		}
			if(toPat.match(new RegExp(`<@!?${djs.user.id}>`))) {
				msg.channel.send("≥ w ≤");
				return
			}else if(toPat.match(new RegExp(`<@!?${msg.author.id}>`))) {
               msg.channel.send("<:NotLikeCat:411364955493761044>");
               return
            }
		if(toFilter) {
			msg.channel.send(`${msg.author.username}, this command doesn't take any arguments other than someone to pat`);
			return
		}
		else {
			var pat1 = 'https://cdn.rawgit.com/bitsnake/RandomResources/ae6b68ef/pat1.png';
        	var pat2 = 'https://cdn.rawgit.com/bitsnake/RandomResources/ae6b68ef/pat2.png';
        	var pat3 = 'https://cdn.rawgit.com/bitsnake/RandomResources/ae6b68ef/pat3.PNG';
        	var pat4 = 'https://cdn.rawgit.com/bitsnake/RandomResources/ae6b68ef/pat4.PNG';
        	var patIMGArray = [pat1, pat2, pat3, pat4]
        	var randPatIMG = patIMGArray[Math.floor(Math.random() * patIMGArray.length)];
        	const embed = new Discord.RichEmbed()
        		.setDescription(`**${msg.author.username} patted ${toPat}**`)
        		.setImage(randPatIMG)
            msg.channel.send({embed});
			return
		}
	}
},

exports.stab = {
    usage: "<@user>",
    description: "Gives someone a nice little stab",
    process: function(djs, dio, msg, args) {
	if(msg.channel.type !== 'text'){
		msg.channel.send("Why would you wanna stab someone in DMs?");
		return
	}
        var argArr = args.split(' ');
        var toStab = argArr[0];
        var toFilter = argArr[1];
        if(!toStab) {
            msg.channel.send(`${msg.author.username}, you need to specify someone to stab`);
            return
        }
            if(toStab.match(new RegExp(`<@!?${djs.user.id}>`))) {
            	msg.channel.send("<:rip:401656884525793291>");
            	return
            }else if(toStab.match(new RegExp(`<@!?${msg.author.id}>`))) {
               msg.channel.send("Oh...");
               return
            }
        if(toFilter) {
            msg.channel.send(`${msg.author.username}, this command doesn't take any arguments other than someone to stab`);
            return
        }
        else {
        	const embed = new Discord.RichEmbed()
        		.setDescription(`**${msg.author.username} stabbed ${toStab}**`)
        		.setImage("http://i0.kym-cdn.com/photos/images/original/000/934/866/c5b.gif")
            msg.channel.send({embed});
            return
        }
    }
}
