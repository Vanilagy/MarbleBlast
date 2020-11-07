# Version History

## 1.4.15
- Fix pathed interior collision detection memory leak

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