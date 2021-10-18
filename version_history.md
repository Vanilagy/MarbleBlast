# Version History

## 2.0.8
- Added support for Safari again

## 2.0.7
- Added 54 missing MBP customs
- Added support for NoRespawnAntiGravityItem

## 2.0.6
- Fixed random power-up not respawning
- Fixed power-up effects not disappearing upon checkpoint respawn
- Fixed particle rendering bug

## 2.0.5
- Fixed old replays not loading correctly

## 2.0.4
- Fixed checkpoints not storing power-ups correctly

## 2.0.3
- Fixed checkpoint spawn points in different gravities
- Fixed teleport triggers in certain situations
- Fixed missing skyboxes/assets in some customs
- Fixed Pianoforte.ogg playing in levels
- Fixed free-look setting not being respected with controllers
- Fixed minor UI bugs

## 2.0.2
- Added custom friction support
- Fixed MBG volume slider bug
- Removed some unsupported customs

## 2.0.1
- Fixed broken instancing on Macs
- Fixed sometimes-janky marble interpolation

## 2.0.0
To celebrate one year of the web port, we're bumping up its major version number to 2 and changing its name to "Marble Blast Web" with by far its biggest update yet. There are too many changes to be able to list them all, but here are the main ones:

- **Implemented Marble Blast Platinum.** Well, at least the single-player part of it. This includes a completely new menu, new levels, new options, new sounds, new music and new gameplay elements. The added gameplay elements are checkpoints, teleporters, nukes, magnets, MBP frictions, bouncy floor, random power-ups and easter eggs.
- **Added 1608 new levels.** This includes the 120 MBP default levels as well as 1488 MBP customs taken from Marbleland.
- **Implemented game switching.** To still be able to play the pure Marble Blast Gold, you can now quickly switch between the two games in the main menu.
- **Made physics more consistent.** Continuous collision detection got a makeover, so all collision (including edge-hits) should be way more accurate and reliable now. Hitting internal edges should also happen much more rarely now.
- **Added a fancy new particle renderer.** Tens of thousands of particles on screen at one time will now run smooth like butter. Like a criminal undercover.
- **Many bugfixes and improvements.** Tons of smaller bugs and inconsistencies were fixed and the game was optimized and improved in many places.

## 1.5.8
- Added an additional 387 custom levels from Marbleland
- Fixed marble texture being flipped
- Added viewable changelog

## 1.5.7
- Improved level select image loading some more

## 1.5.6
- Improved level select image loading
- Added shuffle button to level select
- Fixed button bugs
- Fixed untrimmed level names in webhook announcements

## 1.5.5
- Increased online leaderboard performance for a lot of scores

## 1.5.4
- Added the ability to search for levels by their level number

## 1.5.3
- Added graceful database shutdown
- Fixed custom level archives having more files than necessary

## 1.5.2
- Added unfinished replays: You can now watch and download replays from within the pause menu, even if you haven't finished the level yet.

## 1.5.1
- Fixed call stack error for large array concatenation

## 1.5.0
This patch focuses on a full backend rewrite. The client is mostly the same.
- Ditched PHP for a Node.js server
- Added a proper SQLite database (byebye, JSON)
- Leaderboard updates are now lazy: The client requests only the parts of the leaderboard that it can currently display.
- Score submission is similarly optimized, only new scores are sent instead of all local scores. Additionally, replay upload happens concurrently with score submission to avoid multiple requests.
- Sped up large leaderboard lists loading
- Fixed a bug where the username wouldn't be stored on the client

## 1.4.34
- Finishing a level while OOB for longer than 0.5 seconds now stops the time and shows fireworks as usual, but doesn't actually complete the level

## 1.4.33
- Fixed pathed interiors crashing levels under certain conditions

## 1.4.32
- Added support for pathed interior sounds

## 1.4.31
- Added ability to download .wrec right from the finish screen

## 1.4.30
- Fixed bugs regarding pathed interiors and camera positioning

## 1.4.29
- Added support for showHelpOnPickup flag on power-ups
- Fixed help and alert text fading out even when game is paused

## 1.4.28
- Fixed broken trigger hitboxes breaking collision

## 1.4.27
- Fixed certain custom levels crashing on load
- Fixed buttons not correctly returning to hovered state

## 1.4.26
- Fixed the game state text ("Go!") not disappearing when level already finished

## 1.4.25
- Fixed all trapdoors opening at the beginning of a replay under certain circumstances

## 1.4.24
- Fixed flickering loading bar when loading two levels simultaneously

## 1.4.23
- Fixed mismatched replays showing up in level select under certain conditions

## 1.4.22
- Made gyrocopter work correctly with different gravity intensities

## 1.4.21
- Added special outdated local score handling
- Fixed crash when holding down the restart button while loading a level
- Fixed Time Travel sound not stopping when finishing the level

## 1.4.20
- Fixed IndexedDB transaction expiration bug on Safari

## 1.4.19
- Implemented proper GPU memory disposing upon closing a level

## 1.4.18
- Fixed a bug where PushButtons would share their button position

## 1.4.17
- Fixed .mis parsing error

## 1.4.16
- Fixed incorrect .mis text encoding

## 1.4.15
- Fixed pathed interior collision detection memory leak

## 1.4.14
- Fixed pathed interiors with less than two markers in its path
- Fixed shapes incorrectly sharing data with shapes of a different DTS path ("shockcopter")
- Fixed gyrocopter spinning too quickly in the powerup box
- Gyrocopter now has a 0.1% chance of looking like a shock absorber instead

## 1.4.13
- Fixed levels with both DuctFans and SmallDuctFans
- Special characters are now ignored in level search

## 1.4.12
- Fixed mission file number parsing issue

## 1.4.11
- Fixed horrible webhook exploits 😂
- Fixed replays not uploading immediately after achieving a play

## 1.4.10
- Added support for webhook integration for announcing records
- Fixed custom level gold and qualify times not showing up

## 1.4.9
- Added gamepad support (thanks, [Whirligig](https://github.com/Whirligig231)!)

## 1.4.8
- Exclude incorrect triggers from pathed interiors
- Fixed PathedInterior.prevPosition

## 1.4.7
- Fixed incorrect position, scale and rotation values in .mis files not resolving correctly

## 1.4.6
- Fixed old non-recorded scores crashing the .wrec uploader (thx c0wmanglr for the debug)

## 1.4.5
- Replay upload hotfix

## 1.4.4
- Added automatic .wrec upload to server (if #1 score)
- Fixed data corruption bug when having no scores

## 1.4.3
- Fixed clock inaccuracies

## 1.4.2
- Added a maximum time cap
- Fixed negative elapsed time

## 1.4.1
- Fixed old replays not downloading into the correct format
- Fixed instancing bugs on Mac

## 1.4.0
This patch is meant to be an overall "quality of life" update to the port, rounding off the experience. Major changes are:
- **Replays can now be downloaded and saved as .wrec files.** To do this, simply Alt-Click the replay icon in the scores. .wrecs can be played back using the small play icon in the corner of the level selector.
- **Fan physics have been reworked.** With the help of RandomityGuy, they should be much closer to the original now. This means that Battlements and Airwalk will now be somewhat more enjoyable to play.
- Speaking of Airwalk, **positional sounds now get their volume reduced if they appear in clumps.** So, no more earrape from fans.
- **Sliding has been adjusted**. Now just requires any movement buttons to be pressed and an angle of 30° or less, instead of the previous 45°.
- **Tons of bugfixes regarding broken custom levels.** Fixes include levels not loading, MBP textures not loading, not being able to finish when OOB, missing qualifying times, going negative with Time Travels, falling through terrain, and other things.
- **Shape hitboxes have been fixed**. So no more glitchy trapdoors.
- **Interiors are now smoothly shaded and instanced**. Basically, this means that curved surfaces now look smoother and lots of the same interior in one level should be more performant now.
- **The marble can now be made reflective** in the graphics options.
- **Safari finally gets music**. Yes.
- **Migrated to IndexedDB entirely**, ditching localStorage.

## 1.3.0
### Main changes:
- Added all 1897 CLA gold custom levels
- Added level search
- Added support for Push Buttons, TSStatic, quicksand, octahedron, colmesh and ParticleEmitterNode
### Other changes:
- Improved texture rendering
- Improved mine explosion strength calculation (they're a bit stronger now)
- Added support for a bindable level restart button
- Rewrote the .dts parser to now support all versions from 18 to 24 (instead of just 24)
- Rewrote the .mis parser to now be line-independent, support simple variables and custom marble attribute overrides
- Rewrote pathed interior movement logic, should be much more stable now
- Switched to a custom capsule geometry binary search algorithm for CCD, leading to much more accurate and reliable calculation of time of impact for finish areas and time travels (accuracy of ~0.24 ms)
- Shapes now support animated translation in addition to animated rotation
- Rewrote mission resource management
- Added version history, lol

## 1.2.0
- Added replays

## 1.1.0
- Added leaderboards

## 1.0.0
- Initial release