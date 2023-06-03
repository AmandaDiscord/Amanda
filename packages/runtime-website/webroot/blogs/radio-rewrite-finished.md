# Here we are!
This rewrite has been very enlightening on some things I was doing wrong this whole time as well as what I was doing right. Some bugs were definitely squashed as a result of this enlightenment as well as some improvements I needed to do for the longest time beyond just the radio rewrite itself.

## Caveats
The radio stations I've selected sometimes play ads which I hope is okay. Amanda isn't choosing to play these ads and never will play her own ads. The ad rolls I've listened to only last about 30sec.

## What stations are there?
Quite a few genres actually. I didn't get to add too much because there aren't many online radio stations I can just cleanly link an audio url to playback and call it a day which is how I currently have everything setup.

I ended up using a lot of stations you can discover on radio.net and all of them are bangers! I'm not much of a country fan and tend to strongly dislike it, but personal preferences aside, there were some oldies I liked on it like Johnny Cash.

If you used Amanda's `/radio` command, then you'd see quite a list of stations to choose from, a lot of which existed before.
Frisky and Listen.moe remain unchanged except now their info is static instead of fetched via a websocket. ListenSomeMoe, the gateway only library for listen.moe we develop, will still be supported as long as possible, but listen.moe's API is stable in that regard.

New stations include Absolute Chillout, Radio Swiss Jazz, 95.7 The Rock, 104.9 Classic Country, Gay FM (really good Electro actually)

That wasn't all of the stations, but those are some of them with different genres to try to fill as many as possible without too many duplications as I can only have 25 stations with the current system (Discord choice limitation)

A random option was also included for those trying to explore. First it chooses a random genre and then a random entry from the random genre.
I don't think you can really go wrong with random unless you REALLY hate a specific genre that's selectable.

While listening to Absolute Chillout, I found this really good song https://www.youtube.com/watch?v=jqtMn4km7VE (The official YT topic album has a mildly suggestive thumbnail, so here's one that isn't. I find this song gets really good after about 1:10)

## More is to come
The system I've implemented is super simple to extend and adding new radio stations is trivial, so if you have suggestions, leave a comment and I'll figure something out!

Until next blog
- PapiOphidian
