# A new beginning
In May, I deleted Amanda's and Tsukiko's Discord accounts. How much work I had to put in for diminishing returns on stability was starting to get to me, though that wasn't the reason I deleted Amanda. It's personal. After I realized how dumb it was of me to delete Amanda, I decided that I should try to do things better this time.

Fast forward a few weeks and Amanda's code base had received a major overhaul under, effectively, a total restart of the core structure. Amanda is now split up into "packages" which are their own modules and are referenced similar to if I had just installed them from the web. A lot of code was under different repositories on the GitHub as well and are now included in Amanda's monorepo, that way I can update things faster and more efficiently and make use of the tooling already set up such as building and generating assets versus hand crafting everything.

One example is Amanda's language package which can make use of automatically generated docs and main file based off the current state of the localizations as a whole. It also recently got a script I can use to check for which language keys are and aren't being used so that I can either remove stuff that isn't being used anymore or if I forgot to make use of a translation, I will know. The script was super helpful recently since I start off coding new features in English and add the translations later since I am a native English speaker with very limited knowledge of other languages. What are now old features were still using hard coded English strings, but translations for them had been available for a while; Checking this type of thing had been *possible* before, but wasn't very practical since it would require referencing another git repo folder which may not always be in the same place or even on the same machine which would make things like CI fail.

Of course, I have ran into jank I have to create solutions to. TypeScript isn't the most intuitive thing, but it does provide means to make code safer through types. Waiting for JS to implement build-in inline type comments so that I can reduce the amount of tooling Amanda requires. I could also do without TSUP since it's also quite jank. Only really using it for minification or fixing the issue that comes with TypeScript including folders in builds when importing which might not always be intended and there's no way to exclude them.

Amanda also now isn't using Volcano anymore and Volcano won't receive any more updates from me. I've left the future of Volcano up to someone who I trust can do a lot better than I can. Amanda is now just using regular LavaLink again. Some plugins from Volcano aren't available for LavaLink yet which kinda sucks, but not much I can do about that. Java isn't my most favorite language to work with.

The result of all of these changes are that Amanda is a lot more stable and predictable, to me at least, while the user experience hasn't suffered and may have improved. Some commands are missing while I work to figure out how I want to develop those things, but will return. No timeline for that.

That's about it.

Shout out to the Donut for always making spectacular art <3

<blockquote class="twitter-tweet" data-lang="en" data-dnt="true" data-theme="dark">
	<p lang="zxx" dir="ltr">
		<a href="https://t.co/QxPmQ0cKbY">pic.twitter.com/QxPmQ0cKbY</a>
	</p>
	&mdash; SirDonutDan (@SirDonutDan1)
	<a href="https://twitter.com/SirDonutDan1/status/1673036911487733767?ref_src=twsrc%5Etfw">June 25, 2023</a>
</blockquote>
<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
