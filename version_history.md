# Version History

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