# Selfhosting Amanda

## NOTICE

Amanda was not originally designed as an open-source project. Amanda's code is published for
transparency, rather than to encourage people to run her themselves.
You should use the official Amanda (https://amanda.moe/to/add) for day-to-day
use as it is against the license to self host Amanda for public use.
Nevertheless, the process to get a copy of Amanda up and
running on your own machines is documented here, for those who want it.

Please read the entire file before actually doing anything. You may find
that a later step, and as such the entire guide, is impossible for you
to complete; Therefore, reading it first will save you time by not attempting
the previous steps first.

# Register

Amanda depends on these services which are already hosted by other
people. You'll need to sign up for them.

## Bot application

[Create an application on Discord,](https://discord.com/developers/applications) then create a bot
account with it. Note the token.

## Chewey API

[Sign up for the Chewey API and claim an API key.](https://api.chewey-bot.top/random)

## weeb.sh API

Get a [weeb.sh](https://weeb.sh/) API token, somehow.

# Services

Amanda requires several components which must all be installed
first. Not all of them need to be installed on the same machine.

## Database

Amanda stores all data in Postgres which includes arbitrary settings and other user related data and select data emitted by Discord's gateway.

## Lavalink

Amanda uses Volcano (a Lavalink rewrite) as its audio processor. [Download an appropriate
version](https://github.com/lavalink-devs/Lavalink/blob/master/README.md#server-configuration) of Lavalink or any Lavalink compatible replacement such as [Volcano](https://github.com/AmandaDiscord/Volcano), or build your own, and run it on a server. You should put it
close to the Discord voice regions that you want to stream to.

You may use the provided `application.yml` file.

## Yarn
Amanda uses Yarn as a package manager instead of NPM, though to install it, you need to `npm install -g yarn`

## Bot

Clone Amanda's repo.

Run `yarn install`.

# Setup

With everything installed and running, you now have to configure it.

## Bot config files

Open `config.sample.js` in the bot repo and fill in the details. You
must fill in everything. Rename the file to just `config.js`

## Lavalink config

Again, use the `application.yml` file from this repo.

Create a password for the Lavalink server, and put it in the file
where directed.

Restart Lavalink to apply changes.

## Database setup

Ensure a user with the name amanda is created. The password can be whatever you chose earlier when setting up the bot config

You can import the Postgres schema you can find in the pgsql.dmp

It does contain some legacy tables that are no longer used at the moment that you can safely delete.
