# [**Click here for viewer**](https://r-surrected.github.io/division-database/viewer.html)

# The Division Database

https://discord.gg/MtFWkQdzru

## Why I made this 
This will be quite the yap so here's a shortened version:

I wanted to be able to track changes in divisions, so I made a website that does that.

Longer version here:

I've been in the City-17 community on and off since 2020 and I have always wanted something to track the changes in all of the divisions. It would always be "this person left" or "this person joined", but how do you track all that? It became a little annoying to do this.
I made this project to solve this problem. It tracks all divisional and OTA changes so that you don't have to. 

## How it works

The database uses a python script (not in the repo) that runs scheduled (12:00 PM EST daily) on a headless computer to fetch current Roblox group data using their API. It compares it against the previously made snapshot of the data and generates events (changes) for promotions, transfers, discharges, and username changes. The data is exported to JSON files and are pushed to this repo, automatically updating the github pages site that it runs on. The viewer html file allows user to view the static data, meaning that the website does none of the fetching and the backend runs somewhere else.

This may seem like I go in and manually update the json but it's purely done by a python script. I wouldn't wish manual json updating on anyone. 

Right now I'm working on automatically updating it. Currently the username change system is breaking, so any changes just break.
