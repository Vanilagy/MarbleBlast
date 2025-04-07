# Version History

## 2.6.14
This update reverts the 2025 April Fools' changes. Thanks for grinding!

## 2.6.13
Once again, Marble Blast Web is more platformer than ever - even more than last time! These are the mechanics:
- **Dashing:** While you're in the air, you can dash once in the direction you're looking by clicking. Dashing overrides your velocity entirely, so it's perfect for performing tight curves.
- **Air hopping:** While you're in the air, you can now jump an additional three times. Jumping completely cancels any downward motion. Air hops are slightly buffed compared to last time.
- **Removed some bits:** To support the faster gameplay, video and audio now use *even less* bits. This was *definitely* done for performance reasons. The audio is especially crunchy this time around.

## 2.6.12
- Fixed asset resolution logic for custom shapes

## 2.6.11
- Fixed the Marbleland leaderboard endpoint for non-MBG levels

## 2.6.10
- Added tighter integration with Marbleland: You can now launch Marble Blast Web directly from Marbleland.
- Fixed a bug where MBU replays could be launched from the MBG UI

## 2.6.9
This update reverts the 2024 April Fools' changes. Thanks for grinding it out!

## 2.6.8
Marble Blast Web is now more platformer than ever! The following things have changed:
- **Dashing:** While you're in the air, you can dash once in the direction you're looking by clicking. Dashing overrides your velocity entirely, so it's perfect for performing tight curves.
- **Air hopping:** While you're in the air, you can now jump an additional three times. Jumping completely cancels any downward motion.
- **Removed some bits:** To support the faster gameplay, video and audio now use less bits. This was *definitely* done for performance reasons.

## 2.6.7
- Site can now be launched directly into MBG/MBP by appending ?mbg or ?mbp to the end of the URL

## 2.6.6
- Fixed some video renderer bugs and made configuration errors more clear

## 2.6.5
- Improved replay loading
- Improved WR announcement messages

## 2.6.4
- Fixed some levels being stuck on load
- Fixed some levels missing a skybox
- Small performance improvements and fixes

## 2.6.3
- Fixed leaderboard bugs
- Fixed incorrect "Next level" button in the MBP finish screen

## 2.6.2
- Fixed a few minor bugs

## 2.6.1
- Fixed local scores vanishing on reload

## 2.6.0
On September 20, the datacenter that Marble Blast Web ran on experienced a catastrophic failure resulting in the loss of all data. This site now runs on a new, much more reliable machine. It does, however, mean that all leaderboard data is gone. For this, I can't apologize enough. But it's time to move on; time for a fresh start.

With this update, the leaderboards are empty again and so are all local scores. For a long time, the leaderboards have been plagued by inconsistencies caused by physics differences in older versions. This time around, let's get it right.

In addition to the game being up again, I've refreshed the game with some new goodies:

- **Full [Marbleland](https://marbleland.vaniverse.io/) integration.** Custom levels on this site are now automatically kept up-to-date with those on Marbleland, meaning new levels will automatically appear every few days.
- **Level select sorting.** To better navigate the influx of new levels, you can now sort levels both alphabetically and by their release date.
- **Tracking more stuff.** The server now keeps a record of everybody's level finishes ever, not just their top score, which will allow for some very powerful data analysis. This also means that world record replays are now stored and viewable for all custom levels.
- Other small fixes and improvements

I'm confident the game will be just as fun as before, even if the leaderboards will feel a little empty for a while. Let's get grinding!

## 2.5.9
- Fixed custom level record submission

## 2.5.8
- Reverted April Fools' 2023 changes (thank you for participating <3)

## 2.5.7
- Slightly increased marble speed
- Slightly buffed power-ups

## 2.5.6
- Fixed incorrect sky colors in some custom levels

## 2.5.5
- Added viewable world record replays in the leaderboards for default levels
- Added a compilation renderer, tutorial [here](https://github.com/Vanilagy/MarbleBlast/tree/master/docs/compilation_how_to.md).
- Fixed incorrect music playing in replays
- Fixed multiple memory leaks
- Fixed trapdoor sound bugs
- Fixed shader errors on Safari

## 2.5.4
- Fixed missing bumper sounds

## 2.5.3
- Fixed incorrect normal map rendering for some MBU textures

## 2.5.2
- Added audio support to video renderer
- Fixed video renderer color issues
- Fixed video renderer creating invalid files
- Fixed camera orientation bugs occasionally caused by Gravity Modifiers
- Fixed missing mega marble rolling sounds in replays

## 2.5.1
- Improved HUD rendering performance
- Fixed some levels crashing on load

## 2.5.0
- **Added a built-in replay video renderer.** By Shift-Clicking on a replay or the "open replay" button, you can now render the replay to a WebM video file straight from the browser - with arbitrary screen resolution, frame rate and quality. This feature uses rather new browser technologies and is thus currently only avaiable in desktop browsers running Chromium 94 or above (Chrome 94, Edge 94, Opera 80). Only video is exported, no audio yet.

## 2.4.14
- Improved logic for handling missing level resources

## 2.4.13
- Fixed MBU-style marble textures crashing in MBG mode

## 2.4.12
- Improved webhook world record announcements

## 2.4.11
- Fixed fans not spinning
- Fixed missing qualify time alarm
- Added logic to handle expired local scores

## 2.4.10
- Fixed weird physics behavior in slope edges
- Fixed incorrect camera behavior

## 2.4.9
- Fixed missing power-up animations

## 2.4.8
- Fixed sudden velocity changes not being applied

## 2.4.7
- Fixed large level elements breaking collision in some cases
- Adjusted level select search behavior

## 2.4.6
- Fixed incorrect centerDistPoint behavior in teleport triggers

## 2.4.5
- Fixed some leaderboard dupe bugs

## 2.4.4
- Fixed erroneous collision detection issues

## 2.4.3
- (Hopefully) fixed incorrect collision normals and position correction

## 2.4.2
- Fixed incorrect collision normals in some circumstances

## 2.4.1
- Fixed some Firefox-related styling bugs

## 2.4.0
After having rewritten the rendering pipeline, next up were the physics, which still heavily relied on a third-party library. This update completely rewrites the physics engine from scratch, ditching the third-party dependency and thereby gaining more performance and fine-grained control - a necessary step for future updates.

- **Completely rewrote the physics pipeline.** In order not to completely invalidate tons of past scores, they should generally feel similar to before.
- **Greatly increased physics stability and consistency.** The new physics system uses very fine-grained continuous collision detection and other techniques to try and remove all of the jankiness of previous versions. Internal edge hits are basically impossible now, meaning all interiors (especially curved surfaces such as pipes or loops) act the way they should.
- **Improved performance.** The old physics system used to stutter in complex levels under certain conditions. The new system should perform well under all conditions, even on mobile.
- **Improved simulation logic.** In previous versions, the way level events and user input were handled was slightly wrong and sometimes delayed. All that's been fixed now.

That's for the main physics update. Some other stuff:

- Fixed flickering textures at the start of levels
- Fixed incorrect bumper animation
- Fixed some styling issues in the menu
- Fixed other stuff I don't remember anymore

## 2.3.4
- Fixed certain invisible materials not being invisible

## 2.3.3
- Fixed "Fancy shader" option not taking effect until restart

## 2.3.2
- Due to visual flickering on some devices, low-latency mode has been turned off by default and can now be enabled manually in the MBP options. It is still recommended that all Chromium users enable this setting - as long as it doesn't cause any visible glitches.

## 2.3.1
- Fixed incorrectly-cast shadows
- Fixed frame rate limiter

## 2.3.0
- Completely rewrote the rendering pipeline
- Improved rendering performance across the board, especially for mobile devices
- Implement proper cubemap marble reflections
- Improved the look of MBU interiors
- Decreased visual latency in Chromium-based browsers
- Added the ability to use the respawn key in the pause screen
- Fixed buggy path resolution leading to missing interiors in some custom levels
- Fixed alarm sound audio bugs
- Fixed checkpoint audio bugs
- Fixed gamepad-related errors

## 2.2.9
- Fixed same Gravity Modifiers apply repeatedly
- Fixed some .mis files not parsing correctly

## 2.2.8
- Fixed missing controller binding

## 2.2.7
- Added proper controller support for MBP (thanks, Whirligig!)

## 2.2.6
- Fixed some MBP custom quasi-duplicates

## 2.2.5
- Fixed music bug in MBG causing levels to crash

## 2.2.4
- Added MBG Xbox bonus levels to MBG customs (Black Diamond, Cube Root, Divergence, Endurance, Mountaintop Retreat, Skate to the Top, The Road Less Traveled, Timely Ascent, Urban Jungle)

## 2.2.3
- Fixed some iOS Safari-related bugs

## 2.2.2
- Added reorderable touch action buttons
- Added support for holding down prev/next buttons in level select
- Fixed some styling
- Fixed times varying by 1ms

## 2.2.1
- Fixed teleporting sound not playing

## 2.2.0
- **Added proper touch device support.** This website now plays properly on touch devices such as phones or tablets using configurable on-screen touch controls.
- **Added PWA functionality.** This website is now a Progressive Web App (PWA), meaning it can be installed on your home screen / desktop to feel like a native app. This is especially recommended on mobile as it allows proper fullscreen.
- Added a frame rate limiter to the options screen to better support frame rate-unlocked browsers
- Added prettier pop-ups
- Fixed visual artifacts when respawning
- Fixed float errors when displaying times
- Fixed some pause screen bugs
- Other fixes and improvements

## 2.1.5
- Reworked marble reflection code, making it more performant and beautiful :)
- Added support for a weird invisible MBU material

## 2.1.4
- Fixed old replays again
- Fixed incorrect checkpoint orientation in Ultra levels
- Fixed "Qualify Time"
- Fixed Tim Trance not playing in all MBU levels
- Fixed incorrect MBU plate texture scaling
- Fixed wrong level select backgrounds
- Controllers now respect mouse sensitivity
- Removed Herobrine

## 2.1.3
- Small bugfixes and improvements

## 2.1.2
- Holding down the respawn key for 1 second will now hard-respawn you at the start pad
- Fixed marble physics suddenly giving up their will to live

## 2.1.1
- Fixed broken shaders in Safari
- Added option to turn off fancy shaders

## 2.1.0
- Added Marble Blast Ultra levels (61 default + 107 custom)
- Added Blast
- Added Mega Marble
- Added fancy MBU material shaders
- Added proper dynamic reflections to the marble
- Added support for both regular and MBU-style custom marble textures
- Added more loading screen detail
- Fixed checkpoints working incorrectly in replays
- Fixed wrong checkpoint respawn positions
- Fixed z-fighting issues
- Various other small fixes and improvements

## 2.0.10
- No, MBU levels are not out yet. That was an oopsie.

## 2.0.9
- Fixed some shape/particle rendering bugs

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