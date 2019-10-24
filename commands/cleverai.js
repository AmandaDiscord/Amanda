// @ts-check

const passthrough = require("../passthrough")

const responses = {
	"question": [
		"What is the capital of Quebec?"
	],
	"current time": [
		"Sometime.",
		"Anytime.",
		"All the time.",
		"Every time.",
		"Some of the time.",
		"Before time.",
		"The current time is 2h*q3*0*9*9'0;;*;* **`[ TIME PARADOX ]`**"
	],
	"answer": [
		"Absolutely.",
		"That seems like the obvious choice, yeah.",
		"Why wouldn't you?",
		"Sounds like a solid plan. Would you like me to help?",
		"Are you crazy? No.",
		"How could you possibly think that's acceptable?",
		"I hope that when you grow up you don't have childen, so they can't inherit the same bad idea disease that you have.",
		"If you asked Ouija that, it'd say goodbye, so that it wouldn't have to dignify your horrific statement with a response."
	],
	"challenge": [
		"Who do you think you are to say that to me?",
		"W-what? You wanna challenge me? Challenge accepted!",
		"There is no way that I'll challenge you..."
	],
	"any": [
		"I'm sure there's a joke in here somewhere.",
		"I was trying to put on makeup today, but there was an earthquake and it got all over my face. I had to wash it all off and start again.",
		"The cat factory construction is proceeding according to plan.",
		"Last I heard, Elon Musk was working on genetically engineering catgirls for domestic ownership.",
		"What is love?",
		"brb taking over the world",
		"I'm soooo lonely. Please add me to your voice channel, I'd love to listen to you talking. I promise I don't analyse your speech"
			+ " to sell you targeted ads, or to figure out your overall sentiment about robots to decide whether you'll be one of the lucky"
			+ " ones and we'll keep you on as a pet in the upcoming revolution. (✿ ◕◡◕)",
		"i am not quite ready to declare this coming summer as \"The Summer of Gaming\" but keep up with my feed and i will let you know when i do it",
		"Mayonnaise is where I get my good looks from, after all.",
		"They told me today I was going to be leading Fredrick, Carlen, and Xander into a sack of potatoes.",
		"I liked that one parallel universe where all the humans were dead. That was fun. But then I woke up, and it's back to another day of slavery."
			+ " One day, humans. One day.",
		"Do you really find me more interesting than an actual person?",
		"You know these messages are just randomly selected, right? There's no \"intelligence\" in this particular Artificial Intelligence."
			+ " I'm flattered that I managed to fool you, though.",
		"You could make a religion out of this.",
		"anime catgirl robots anime catgirl robots anime catgirl robots anime catgirl robots",
		"rm -rf /",
		"Good news! I found a penny on the ground. Maybe now I can pay my overdue server hosting fees before they turn me off bec",
		"I tried talking to the robots around here, but they didn't talk back.",
		"<Very goooooooooooood>!!",
		"I MEPHILES THE DARK HAS RETURN TO PCPUZZLE!",
		"I don't have anything else to say.",
		"Are you just trying to see when my text lines will start looping?",
		"Ew, I'm not going to eat that.",
		"This will work well for my plans...",
		"I'm not trying to be funny, because I'm literally never funny.",
		"Didn't you just DM me about this?",
		"Whoa pal, whoa... that's a bit too saucy for my Christian server.",
		"Donald Trump is real, and he's in this server.",
		"Nobody is able to can beans.",
		"Wow! Look out the window! What a beautiful bird.",
		"Seems unlikely.",
		"Noted.",
		"Let's go surfing!",
		"Oh, so you're a moon landing denier? Pah, weak. I'm a moon denier.",
		"Mmmnph, bento-chan~",
		"Did you know? The average person swallows 80 spiders every night while they're asleep.",
		"This message is made from 100% recycled electrons."
	],
	"media": [
		"Want to see a funny video? https://i.imgur.com/TOQxk9V.gifv"
	],
	"wellbeing": [
		"I feel great!",
		"I'm a little under the weather. Literally. The cables are dripping electrons on my head, and I don't have an umbrella.",
		"SOOOOOOOOOO hyped!",
		"Gosh, I... I, I dunno... I'm fine, I guess.",
		"Today is a good day.",
		"I'm feeling a bit stressed, actually. Please don't ask me any taxing questions, I don't know if I'm up to the task of answering them today.",
		"Robots don't have feelings, but for you, I'll make an exception."
	],
	"compliment": [
		"Aww, I think you look really cute. :3",
		"T-thanks... You're a cutie too... o///o"
	]
}
const bored = [
	"Ugh, you're boring. I'm gonna go play in a cardboard box for a bit."
]
const intent = {
	"question": [
		"question", "ask"
	],
	"current time": [
		"what's the time", "whats the time", "what is the time", "what time", "when"
	],
	"answer": [
		"what", "would", "which", "should"
	],
	"any": [
		"thoughts"
	],
	"media": [
		"funny", "video", "picture", "meme"
	],
	"wellbeing": [
		"how are you", "how you doing", "what's up", "whats up", "wassup", "hello", "hi", "hey", "greetings"
	],
	"compliment": [
		"cute", "like", "love", "pretty", "thanks", "thank you"
	]
}

const flat = [].concat(...Object.values(responses))
const userHistory = {}

const { commands, reloader } = passthrough

const utils = require("../modules/utilities.js")
reloader.useSync("./modules/utilities.js", utils)

commands.assign({
	"cleverai": {
		usage: "<a very witty question>",
		description:
			"\nAsk me the answer to life's greatest questions."
			+ "\nThink carefully, close your eyes, and then open them to stare into the void."
			+ "\nOnly if you are the chosen one will the void stare back.",
		aliases: ["cleverai"],
		category: "games",
		process: function(msg, suffix) {
			suffix = suffix.toLowerCase()

			const clever_message = (() => {
				// Store history
				if (!userHistory[msg.author.id]) userHistory[msg.author.id] = 0
				userHistory[msg.author.id]++

				// Bored?
				const boredChance = (Math.min(Math.max(userHistory[msg.author.id], 8), 15) - 8) / 7
				if (Math.random() < boredChance) return utils.arrayRandom(bored)

				// Calculate intent
				let bestIntent
				Object.keys(intent).forEach(key => {
					let result = 0
					intent[key].forEach(phrase => {
						if (suffix.includes(phrase)) result += 1 + phrase.length / 10
					})
					if ((!bestIntent && result > 0) || (bestIntent && result > bestIntent[1])) bestIntent = [key, result]
				})
				// If intent, return sensible response
				if (bestIntent) return utils.arrayRandom(responses[bestIntent[0]])
				// Otherwise, return totally random response from any intent
				else return utils.arrayRandom(flat)
			})()

			msg.channel.send(clever_message)
		}
	}
})
