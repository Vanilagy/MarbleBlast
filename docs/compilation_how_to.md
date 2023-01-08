# Compilation rendering - Tutorial

Marble Blast Web allows you to render compilations of multiple replays directly in the game. This document will explain how to do that.

Compilation rendering works by setting up a single directory with all the information necessary for the video. Marble Blast Web will take that directory as the input, and write a video file into it as the output. You can select the directory and begin the rendering process by Alt-Shift clicking on the camera icon in level select.

## manifest.json
This is a necessary file in the directory that defines the compilation. Here's an example/template of it:

```js
{
    // The schedule defines the chronological sequence of events
    "schedule": [
        // This defines a replay that is played
        { "type": "replay", "filename": "level1.wrec" },

        // This defines a replay played by the runner with the ID "foo"
        { "type": "replay", "filename": "level2.wrec", "runner": "foo" },

        // This starts a section
        { "type": "sectionStart", "name": "Intermediate Levels" },

        { "type": "replay", "filename": "level3.wrec", "runner": "bar" },
        { "type": "replay", "filename": "level4.wrec", "runner": "bar" },

        // This ends a section. At the end of a section, the total time of the
        // section will be displayed.
        { "type": "sectionEnd", "name": "Intermediate Levels" }
    ],

    // Optional: Here, we can define a list of runners to reference in
    // the schedule
    "runners": [
        {
            "name": "Foo",
            "id": "foo"
        },
        {
            "name": "Bar420",
            "id": "bar",
            // Optionally, one can define visual properties about the marble:
            "marbleTexture": "base.marble.png",
            "reflectiveMarble": true
        }
    ],

    // Optional: When setting this to false, it will not put the level and
    // runner name on screen whenever a level starts (default is true)
    "showInfo": true,

    // Optional: The file where the video should be saved
    // (default is output.webm)
    "outputFilename": "rampage.webm",

    // Optional: The file where a list of chapters (see later) should be saved
    // (default is chapters.txt)
    "chaptersFilename": "rampage_chapters.txt"
}
```

All the files referenced in `manifest.json`, like replays and marble textures, also have to be included in the directory. Nested folder structures are not supported.

The chapters file exported by the renderer contains a list of levels included in the video and timestamps for each. It is intended for use in YouTube descriptions.