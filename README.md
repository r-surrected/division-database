# [Click here for the viewer](https://r-surrected.github.io/division-database/viewer.html)

# The Division Database

Discord: https://discord.gg/MtFWkQdzru

## What this is

A public, static database + viewer that tracks division and OTA roster changes over time for City-17 HL2RP Roblox groups, without requiring anyone to manually maintain logs.

## Why I made this

I’ve been around the City-17 community on and off since 2020, and division history has always been messy to keep up with. You’ll hear:

- “They joined JURY”
- “They transferred to RAZOR”
- “They got promoted”
- “They discharged”

This was always difficult to track and too much to stay on top of.

So I built a system that automatically records those changes and publishes them in a browsable format.

## How it works

This repo is the frontend + data storage. The “backend” is a separate Python script (not included in this repo) that runs on a schedule and does the heavy lifting.

Functionality Overview:

1. A Python script runs daily (12:00 PM Eastern Standard Time).
2. It fetches current group data from Roblox using their API.
3. It compares the new snapshot to the previous snapshot.
4. It generates change events such as:
   - promotions and demotions
   - division transfers
   - discharges
   - username changes
5. It exports everything to JSON.
6. It pushes the updated JSON to this repo.
7. GitHub Pages serves the viewer, which reads the JSON and displays it.

The website itself is static. It does not fetch Roblox data directly. It only displays the already-generated JSON.
