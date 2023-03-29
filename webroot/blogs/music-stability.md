Let me be real with you; Amanda's music experience hasn't been the most stable like I want it to be lately. I *really do* want it to be stable and reliable which is why I have invested multiple consecutive sleepless nights into attempting to improve reliability of track extraction as well as playback. I've also been listening to a lot more music as a consequence which lets me discover more tracks. Previously, I haven't been using Amanda as often and the things a developer does is usually as intended and isn't representative of how the users... well... use. You could call it being out of touch.

Why these issues occurred in the first place is mostly my fault and also boils down to bugs when it comes to Amanda's main track extractor backing lib. Amanda uses a custom LavaLink compatible node called [Volcano](https://github.com/AmandaDiscord/Volcano) which is built by me. I may not be the smartest developer ever when it comes to audio related stuff, but it is still my mission to make Amanda the best she can be and if possible, the best around.

LavaLink is its own software which handles track info extraction and playback and Amanda used to use LavaLink before, but has moved away from it due to performance targets I strive for and that LavaLink fell short on, although LavaLink itself isn't to blame and is stupid optimized for what it is.
Volcano tries to take this a step further while possibly adding in my own improvements.

Of course, I am not an expert on all of the websites Amanda supports playing music from and they all have their own methods to extract info from them, some of which are too complex for me. Volcano makes use of multiple libraries which extract information. One of them is not actively maintained and seldomly receives updates which Volcano heavily depends on. Some bugs that have existed in Amanda's music for a while are mostly because of this one library and I have had to make many work arounds with varying levels of success, some of which didn't improve things at all and some which in the long term made things worse.

The maintainer has publicly stated some bugs have been fixed in development and it is in hope that these fixes are available soon. As for what I've done on my end, I've been researching what causes these issues and how I can work around them, although this time in a more sensible and effective manner rather than what was quite frankly nothing short of jank previously. The result is very good and almost everything works as you'd expect. Some issues I legitimately cannot fix myself, but most issues everyday users will experience have been fixed.

Here's a list of issues I've fixed you can see here if you're really curious:
- Some URLs link to both playlists and videos and it was expected to be in a specific order and if they weren't in the order, the extractor would say it isn't a valid URL.
- Search terms and URLs were having some characters incorrectly stripped from them because of previous issues related to invalid characters.
- Some URLs were just fancy redirects and weren't being properly handled or weren't handled at all which added complexity. All redirects are now followed and common handling of a specific URL format is now in place.
- Some URLs couldn't be extracted because of the presence of some URL search parameters and were being handled differently than intended.
- Some extractors referenced old data that was no longer being sent and caused extraction to fail.
- Players wouldn't unpause because of how JS handles falsy values.
- Some errors were too generic and weren't helpful.

There's more for me to do as new issues pop up and I know they will. It's just a matter of time, but I'm committed to making sure they get fixed.
