// 𝕋𝕖𝕞𝕡𝕠𝕣𝕒𝕣𝕪 ℕ𝕠𝕥𝕖:  This is currently a hand generated prototype.  This is a template for what will be automated.
// I.e. the next comment is a lie, at least for the moment.
// This file was automatically generated on 5/14/2026, 12:38:25 PM

// If you can't find visually-editable-base.ts, you saved this file in the wrong directory.
import { ScheduleInfo } from "./showable";
import {
  PointScheduleInfo,
  RectangleScheduleInfo,
  StringScheduleInfo,
  VisuallyEditable,
} from "./visually-editable-base";

// 𝕋𝕖𝕞𝕡𝕠𝕣𝕒𝕣𝕪 ℕ𝕠𝕥𝕖:  Names!
// Everything will need a name.
//
// Names will need to be valid JavaScript identifiers.
// We could use the [""] syntax for defining objects and classes
class A {
  b = 1;
  ["c "] = 3;
  ["d"] = 4;
}
const a = new A();
a["c "];
// Auto complete works perfectly with [""]!
// And d works just like b.
// i.e. there is no reason not to JSON.stringify() each name and write it out this way.
// But then how do we deal with class names?
// My current plan (not a requirement) says that each VisuallyEditable child will have its own subclass.
//
// We still need to deal with conflicts.
// All children and schedules attached with the same VisuallyEditable must have unique names.
// And there are a few reserved words, currently ["name", "schedules", "children", and "traverse"], but subject to change.
// That could be enforced (or warned against) in the editor.
// And checked again in the code generation phase, so we never create bad code.
// If we find a bad name create a new name in the file,
// something simple like "❎ 12", where 12 came from a counter,
// (and where some smug tester created a valid field named "❎ 11"!)
// Add the original name and the error message to the generated jsdoc comments.
//
// We can create simply dummy names, like slideDeck5, as defaults.
// Let the user fill in better names at his leisure.
//
// Do the names all exist in one global namespace?
// I mean it might be convenient for someone to import each schedule or slide deck directly from the generated file?
// I don't think so.
// I think one file refers to a whole video, analogous to a whole program in Delphi.
// I think each slide deck, like a delphi form, has its own name space.

/**
 * An instance of the Nine Shapes Component
 * And add the date and time of last save here
 */
class NineShapes extends VisuallyEditable {
  /**
   * The shapes will be put into this rectangle. (rectangle)
   */
  readonly layout: RectangleScheduleInfo;
  private constructor() {
    const layout = new RectangleScheduleInfo(
      "layout",
      "The shapes will be put into this rectangle.",
      [{ time: 0, value: { x: 2, y: 2, width: 6, height: 4 } }],
    );
    super(
      "nineShapes",
      "doesn't exist yet, currently missing from database",
      [],
      [
        /*todo*/
      ],
    );
    this.layout = layout;
  }
  static readonly instance = new this();
}

/**
 * Slide 1: Shape Gallery
 * and add the date and time here!
 */
class ShapeGallery extends VisuallyEditable {
  /**
   * An instance of the Nine Shapes Component
   */
  readonly nineShapes: NineShapes;
  private constructor() {
    super(
      "shapeGallery",
      "shadow-test|Slide 1: Shape Gallery",
      [NineShapes.instance],
      [],
    );
    this.nineShapes = NineShapes.instance;
  }
  static readonly instance = new this();
}

// 𝕋𝕖𝕞𝕡𝕠𝕣𝕒𝕣𝕪 ℕ𝕠𝕥𝕖:  Might as well use .toString() on the date.
// We are storing this page on GitHub and it might be read by someone in a different time zone.
/**
 * Font Inspector
 * Last update:  Fri May 15 2026 11:53:36 GMT-0700 (Pacific Daylight Time)
 */
class FontInspector extends VisuallyEditable {
  // 𝕋𝕖𝕞𝕡𝕠𝕣𝕒𝕣𝕪 ℕ𝕠𝕥𝕖:  I'm explicitly adding the ScheduleInfo.type to
  // to the ScheduleInfo.description.
  // This info already available, but is not always obvious.
  // Especially the difference between a string and a color,
  // which are both strings at the JavaScript level.
  /**
   * Text (string)
   */
  readonly text: StringScheduleInfo;
  /**
   * Zoom Area (rectangle)
   */
  readonly zoomArea: RectangleScheduleInfo;
  /**
   * Simple Text Position (point)
   */
  readonly simpleTextPosition: PointScheduleInfo;
  private constructor() {
    // 𝕋𝕖𝕞𝕡𝕠𝕣𝕒𝕣𝕪 ℕ𝕠𝕥𝕖:  We cannot access this.text before calling super,
    // so we have to write the code in this order.
    // Slightly annoying but not a big deal.
    const text = new StringScheduleInfo("text", "Text", [
      { time: 0, value: "Ag" },
    ]);
    const zoomArea = new RectangleScheduleInfo("zoomArea", "Zoom Area", [
      { time: 0, value: { x: 0.3, y: 0.5, width: 10.5, height: 8 } },
    ]);
    const simpleTextPosition = new PointScheduleInfo(
      "simpleTextPosition",
      "Simple Text Position",
      [{ time: 0, value: { x: 12.5, y: 5 } }],
    );
    super(
      "fontInspector",
      "shadow-test|Font Inspector",
      [],
      [text, zoomArea, simpleTextPosition],
    );
    this.text = text;
    this.zoomArea = zoomArea;
    this.simpleTextPosition = simpleTextPosition;
  }
  static readonly instance = new this();
}

// 𝕋𝕖𝕞𝕡𝕠𝕣𝕒𝕣𝕪 ℕ𝕠𝕥𝕖: This class name is always the same.
// That makes this jsdoc essential.
/**
 * Shadow Test.
 * This is a playground for a lot of new ideas, including my halftone shadows.
 */
class TopLevelVisuallyEditable extends VisuallyEditable {
  /**
   * Slide 1: Shape Gallery
   * and add the date and time here!
   */
  readonly shapeGallery = ShapeGallery.instance;
  // 𝕋𝕖𝕞𝕡𝕠𝕣𝕒𝕣𝕪 ℕ𝕠𝕥𝕖:
  // This JSDoc comment a duplicate of what's found in the
  // definition of FontInspector.
  // It's worth copying because I want to see it when I hover over this property name.
  // Presumably some of these descriptions will be more than just a name with whitespace added!
  /**
   * Font Inspector
   * Last update:  Fri May 15 2026 11:53:36 GMT-0700 (Pacific Daylight Time)
   */
  readonly fontInspector = FontInspector.instance;
  private constructor() {
    // 𝕋𝕖𝕞𝕡𝕠𝕣𝕒𝕣𝕪 ℕ𝕠𝕥𝕖:  We cannot access this.fontInspector before calling super,
    // so we have to duplicate a little bit of code.
    // Slightly annoying but not a big deal.
    super(
      "shadowTest",
      "shadow-test",
      [ShapeGallery.instance, FontInspector.instance],
      [],
    );
  }
  static readonly instance = new this();
}

// 𝕋𝕖𝕞𝕡𝕠𝕣𝕒𝕣𝕪 ℕ𝕠𝕥𝕖:  In our initial discussions the tree started with VisualEditor.something.
// That was a mistake.
// Each of these has its own name.
// Code is expected to import only one of these at the moment, because we have one per video.
// But there is no reason you couldn't important more than one.
// Perhaps one is part of a reusable library.
// Perhaps some utility program looks at all of these at once.
// In this document shadowTest replaces what I was originally calling VisualEditor.
// Note that the name and jsdoc comments both come from the database,
// originally written in the visual editor.

/**
 * Shadow Test.
 * This is a playground for a lot of new ideas, including my halftone shadows.
 */
export const shadowTest = TopLevelVisuallyEditable.instance;

// 𝕋𝕖𝕞𝕡𝕠𝕣𝕒𝕣𝕪 ℕ𝕠𝕥𝕖:  Success!!
// This is how I expect most programmers to use what this file exports.
const temporaryVSCodeTest1: ScheduleInfo =
  shadowTest.fontInspector.simpleTextPosition;
// And this is an example of multiple levels of VisuallyEditable objects.
const multiLevelTest: ScheduleInfo = shadowTest.shapeGallery.nineShapes.layout;

// 𝕋𝕖𝕞𝕡𝕠𝕣𝕒𝕣𝕪 ℕ𝕠𝕥𝕖: We have described recursion in the plans for the visual editor.
// The top level is a slide deck.  It contains slides.  They can contain lots of things including other slide decks.
// Currently we only have a top level and children.
// Currently we have no code or database support for the top level except for the strings "shadow-test" and "showcase" used for scoping our keys.
// We will want a top level for a lot of reasons, including a good place to set the background and to create (the visual editor equivalent of) global variables.

// 𝕋𝕖𝕞𝕡𝕠𝕣𝕒𝕣𝕪 ℕ𝕠𝕥𝕖:  I'm not sure how we connect with the first node.
// In particular, who starts the process?
// I absolutely 100% require a very quick button or menu item to create a new top level slide deck.
// The handwritten code will come later.
// It will import from a generated *-dfm.ts file,
// and that will have whatever info it needs to reconnect to the database,
// and possibly to rebuild the database from what's saved to code.
// I don't think there's ever a need to go the other way.
// You could try to make the generated code yourself (as I am in this exercise) but that seems rare and not what we're optimizing for.

// 𝕋𝕖𝕞𝕡𝕠𝕣𝕒𝕣𝕪 ℕ𝕠𝕥𝕖:  The following came from our current Database Dump tool.
// I'm using it as a base to create the new stuff.
// Eventually the database dump part will become obsolete, replaced by this.
/*
=== shadow-test|Font Inspector ===
{
  "timestamp": 1778871216830,
  "schedules": [
    {
      "description": "Text",
      "type": "string",
      "keyframes": [
        {
          "time": 0,
          "value": "Ag"
        }
      ]
    },
    {
      "description": "Zoom Area",
      "type": "rectangle",
      "keyframes": [
        {
          "time": 0,
          "value": {
            "x": 0.3,
            "y": 0.5,
            "width": 10.5,
            "height": 8
          }
        }
      ]
    },
    {
      "description": "Simple Text Position",
      "type": "point",
      "keyframes": [
        {
          "time": 0,
          "value": {
            "x": 12.5,
            "y": 5
          }
        }
      ]
    }
  ]
}

=== shadow-test|Slide 1: Shape Gallery ===
{
  "timestamp": 1777648420553,
  "schedules": [],
  "components": []
}

=== shadow-test|Slide 2: Growing Rectangle ===
{
  "timestamp": 1776823292325,
  "schedules": [],
  "components": []
}

=== shadow-test|Slide 5: Vertical Lines ===
{
  "timestamp": 1776813219220,
  "schedules": [
    {
      "description": "Starting Position",
      "type": "point",
      "keyframes": [
        {
          "time": 0,
          "value": {
            "x": 1,
            "y": 1
          }
        }
      ]
    }
  ]
}

=== shadow-test|vertical lines ===
{
  "timestamp": 1776456172428,
  "schedules": [
    {
      "description": "Starting Position",
      "type": "point",
      "keyframes": [
        {
          "time": 0,
          "value": {
            "x": 1,
            "y": 1
          }
        }
      ]
    }
  ]
}

=== showcase|<img src="..."> ===
{
  "timestamp": 1776895098354,
  "schedules": [
    {
      "description": "Peano",
      "type": "rectangle",
      "keyframes": [
        {
          "time": 1500,
          "value": {
            "x": 1,
            "y": 1,
            "width": 2.2007492690058483,
            "height": 2.389117324561403
          },
          "easeAfter": "ease"
        },
        {
          "time": 2500,
          "value": {
            "x": 4.672377558479532,
            "y": 1.473364400584795,
            "width": 6.690880847953214,
            "height": 6.861111111111109
          }
        },
        {
          "time": 7500,
          "value": {
            "x": 4.672377558479532,
            "y": 1.473364400584795,
            "width": 6.690880847953214,
            "height": 6.861111111111109
          },
          "easeAfter": "ease"
        },
        {
          "time": 8500,
          "value": {
            "x": 1,
            "y": 1,
            "width": 2.2007492690058483,
            "height": 2.389117324561403
          }
        }
      ]
    },
    {
      "description": "Philip",
      "type": "rectangle",
      "keyframes": [
        {
          "time": 7500,
          "value": {
            "x": 0.7563048245614037,
            "y": 5.650356359649122,
            "width": 2.5989583333333326,
            "height": 2.4562774122807016
          },
          "easeAfter": "ease"
        },
        {
          "time": 8500,
          "value": {
            "x": 4.672377558479532,
            "y": 1.473364400584795,
            "width": 6.690880847953214,
            "height": 6.861111111111109
          }
        },
        {
          "time": 13500,
          "value": {
            "x": 4.672377558479532,
            "y": 1.473364400584795,
            "width": 6.690880847953214,
            "height": 6.861111111111109
          },
          "easeAfter": "ease"
        },
        {
          "time": 14500,
          "value": {
            "x": 0.7563048245614037,
            "y": 5.650356359649122,
            "width": 2.5989583333333326,
            "height": 2.4562774122807016
          }
        }
      ]
    },
    {
      "description": "Pi Creature",
      "type": "rectangle",
      "keyframes": [
        {
          "time": 13500,
          "value": {
            "x": 12.436403508771932,
            "y": 0.9299616228070178,
            "width": 2.3993055555555527,
            "height": 3.285727339181287
          },
          "easeAfter": "ease"
        },
        {
          "time": 14500,
          "value": {
            "x": 4.672377558479532,
            "y": 1.473364400584795,
            "width": 6.690880847953214,
            "height": 6.861111111111109
          }
        },
        {
          "time": 19500,
          "value": {
            "x": 4.672377558479532,
            "y": 1.473364400584795,
            "width": 6.690880847953214,
            "height": 6.861111111111109
          },
          "easeAfter": "ease"
        },
        {
          "time": 20500,
          "value": {
            "x": 12.436403508771932,
            "y": 0.9299616228070178,
            "width": 2.3993055555555527,
            "height": 3.285727339181287
          }
        }
      ]
    },
    {
      "description": "Fourier",
      "type": "rectangle",
      "keyframes": [
        {
          "time": 19500,
          "value": {
            "x": 12.18704312865497,
            "y": 5.207145467836257,
            "width": 2.927448830409356,
            "height": 3.1443713450292394
          },
          "easeAfter": "ease"
        },
        {
          "time": 20500,
          "value": {
            "x": 4.672377558479532,
            "y": 1.473364400584795,
            "width": 6.690880847953214,
            "height": 6.861111111111109
          }
        },
        {
          "time": 25500,
          "value": {
            "x": 4.672377558479532,
            "y": 1.473364400584795,
            "width": 6.690880847953214,
            "height": 6.861111111111109
          },
          "easeAfter": "ease"
        },
        {
          "time": 26500,
          "value": {
            "x": 12.18704312865497,
            "y": 5.207145467836257,
            "width": 2.927448830409356,
            "height": 3.1443713450292394
          }
        }
      ]
    }
  ]
}

=== showcase|<img src="…"> ===
{
  "timestamp": 1776830538576,
  "schedules": [],
  "components": []
}

=== showcase|Bezier.lineIntersects() ===
{
  "timestamp": 1778444484928,
  "schedules": [
    {
      "description": "big location",
      "type": "point",
      "keyframes": [
        {
          "time": 0,
          "value": {
            "x": 3.323921783625731,
            "y": 0.8147843567251463
          }
        }
      ]
    },
    {
      "description": "big font size",
      "type": "number",
      "keyframes": [
        {
          "time": 0,
          "value": 5
        }
      ]
    },
    {
      "description": "small locations",
      "type": "rectangle",
      "keyframes": [
        {
          "time": 0,
          "value": {
            "x": 8.458082485104274,
            "y": 1.2240703961160762,
            "width": 6.0620267502482585,
            "height": 3.6159806700319987
          }
        }
      ]
    },
    {
      "description": "small font size",
      "type": "number",
      "keyframes": [
        {
          "time": 0,
          "value": 2
        }
      ]
    },
    {
      "description": "Position",
      "type": "number",
      "keyframes": [
        {
          "time": 0.75,
          "value": 0,
          "easeAfter": "ease"
        },
        {
          "time": 0.95,
          "value": 1
        }
      ]
    },
    {
      "description": "Boldness",
      "type": "number",
      "keyframes": [
        {
          "time": 0.05,
          "value": 1,
          "easeAfter": "easeOut"
        },
        {
          "time": 0.25,
          "value": 0.5,
          "easeAfter": "ease"
        },
        {
          "time": 0.45,
          "value": 1.5,
          "easeAfter": "easeIn"
        },
        {
          "time": 0.65,
          "value": 1
        }
      ]
    }
  ]
}

=== showcase|Calligraphy Effect ===
{
  "timestamp": 1776589608909,
  "schedules": [
    {
      "description": "Eccentricity",
      "type": "number",
      "keyframes": [
        {
          "time": 0,
          "value": 1,
          "easeAfter": "ease"
        },
        {
          "time": 4000,
          "value": 3,
          "easeAfter": "ease"
        },
        {
          "time": 8000,
          "value": 1,
          "easeAfter": "ease"
        },
        {
          "time": 12000,
          "value": 3,
          "easeAfter": "ease"
        },
        {
          "time": 16000,
          "value": 1
        }
      ]
    },
    {
      "description": "Angle (degrees)",
      "type": "number",
      "keyframes": [
        {
          "time": 0,
          "value": -45
        },
        {
          "time": 16000,
          "value": 45
        }
      ]
    }
  ]
}

=== showcase|Dashes demo ===
{
  "timestamp": 1776650397583,
  "schedules": [
    {
      "description": "Draw Length Factor",
      "type": "number",
      "keyframes": [
        {
          "time": 0,
          "value": 0
        },
        {
          "time": 3000,
          "value": 0,
          "easeAfter": "ease"
        },
        {
          "time": 4000,
          "value": 0
        },
        {
          "time": 7000,
          "value": 0,
          "easeAfter": "ease"
        },
        {
          "time": 8000,
          "value": 1
        },
        {
          "time": 11000,
          "value": 1,
          "easeAfter": "ease"
        },
        {
          "time": 12000,
          "value": 1
        },
        {
          "time": 15000,
          "value": 1,
          "easeAfter": "ease"
        },
        {
          "time": 16000,
          "value": 1
        }
      ]
    },
    {
      "description": "Gap Length Factor",
      "type": "number",
      "keyframes": [
        {
          "time": 0,
          "value": 2
        },
        {
          "time": 3000,
          "value": 2,
          "easeAfter": "ease"
        },
        {
          "time": 4000,
          "value": 3
        },
        {
          "time": 7000,
          "value": 3,
          "easeAfter": "ease"
        },
        {
          "time": 8000,
          "value": 3
        },
        {
          "time": 11000,
          "value": 3,
          "easeAfter": "ease"
        },
        {
          "time": 12000,
          "value": 1
        },
        {
          "time": 15000,
          "value": 1,
          "easeAfter": "ease"
        },
        {
          "time": 16000,
          "value": 0.5
        }
      ]
    }
  ]
}

=== showcase|Easing race ===
{
  "timestamp": 1776823292325,
  "schedules": [
    {
      "description": "Start Line",
      "type": "point",
      "keyframes": [
        {
          "time": 0,
          "value": {
            "x": 4.075,
            "y": 4.5
          }
        }
      ]
    },
    {
      "description": "Finish Line",
      "type": "point",
      "keyframes": [
        {
          "time": 0,
          "value": {
            "x": 14.6,
            "y": 4.5
          }
        }
      ]
    }
  ]
}

=== showcase|Interpolating Between Paths ===
{
  "timestamp": 1778624100789,
  "schedules": [
    {
      "description": "Which Sample",
      "type": "number",
      "keyframes": [
        {
          "time": 679.9999999999999,
          "value": 0
        },
        {
          "time": 3853.333333333333,
          "value": 1
        },
        {
          "time": 5213.333333333333,
          "value": 1
        },
        {
          "time": 8386.666666666666,
          "value": 2
        },
        {
          "time": 9746.666666666666,
          "value": 2
        },
        {
          "time": 12920,
          "value": 3
        },
        {
          "time": 14280,
          "value": 3
        },
        {
          "time": 17453.333333333332,
          "value": 4
        },
        {
          "time": 18813.333333333332,
          "value": 4
        },
        {
          "time": 21986.666666666664,
          "value": 5
        },
        {
          "time": 23346.666666666664,
          "value": 5
        },
        {
          "time": 26520,
          "value": 6
        },
        {
          "time": 27880,
          "value": 6
        },
        {
          "time": 31053.333333333332,
          "value": 7
        },
        {
          "time": 32413.333333333332,
          "value": 7
        },
        {
          "time": 35586.666666666664,
          "value": 8
        },
        {
          "time": 36946.666666666664,
          "value": 8
        },
        {
          "time": 40120,
          "value": 9
        },
        {
          "time": 41480,
          "value": 9
        },
        {
          "time": 44653.33333333333,
          "value": 10
        },
        {
          "time": 46013.33333333333,
          "value": 10
        },
        {
          "time": 49186.666666666664,
          "value": 11
        },
        {
          "time": 50546.666666666664,
          "value": 11
        },
        {
          "time": 53720,
          "value": 12
        },
        {
          "time": 55080,
          "value": 12
        },
        {
          "time": 58253.33333333333,
          "value": 13
        },
        {
          "time": 59613.33333333333,
          "value": 13
        },
        {
          "time": 62786.666666666664,
          "value": 14
        },
        {
          "time": 64146.666666666664,
          "value": 14
        },
        {
          "time": 67320,
          "value": 15
        }
      ]
    }
  ]
}

=== showcase|Interpolating between Paths ===
{
  "timestamp": 1778615179642,
  "schedules": [
    {
      "description": "Which Sample",
      "type": "number",
      "keyframes": [
        {
          "time": 250,
          "value": 0
        },
        {
          "time": 4500,
          "value": 1
        },
        {
          "time": 5250,
          "value": 1
        },
        {
          "time": 9500,
          "value": 2
        },
        {
          "time": 10250,
          "value": 2
        },
        {
          "time": 14500,
          "value": 3
        },
        {
          "time": 15250,
          "value": 3
        },
        {
          "time": 19500,
          "value": 4
        },
        {
          "time": 20250,
          "value": 4
        },
        {
          "time": 24500,
          "value": 5
        },
        {
          "time": 25250,
          "value": 5
        },
        {
          "time": 29500,
          "value": 6
        },
        {
          "time": 30250,
          "value": 6
        },
        {
          "time": 34500,
          "value": 7
        },
        {
          "time": 35250,
          "value": 7
        },
        {
          "time": 39500,
          "value": 8
        },
        {
          "time": 40250,
          "value": 8
        },
        {
          "time": 44500,
          "value": 9
        },
        {
          "time": 45250,
          "value": 9
        },
        {
          "time": 49500,
          "value": 10
        },
        {
          "time": 50250,
          "value": 10
        },
        {
          "time": 54500,
          "value": 11
        },
        {
          "time": 55250,
          "value": 11
        },
        {
          "time": 59500,
          "value": 12
        },
        {
          "time": 60250,
          "value": 12
        },
        {
          "time": 64500,
          "value": 13
        },
        {
          "time": 65250,
          "value": 13
        },
        {
          "time": 69500,
          "value": 14
        },
        {
          "time": 70250,
          "value": 14
        },
        {
          "time": 74500,
          "value": 15
        }
      ]
    }
  ]
}

=== showcase|Pixel Perfect Freaky Dot Patterns ===
{
  "timestamp": 1777000080164,
  "schedules": [
    {
      "description": "Rotation Center",
      "type": "point",
      "keyframes": [
        {
          "time": 0,
          "value": {
            "x": 8,
            "y": 4.5
          }
        }
      ]
    }
  ]
}

=== showcase|spiral ===
{
  "timestamp": 1777140676069,
  "schedules": [
    {
      "description": "Sweep",
      "type": "number",
      "keyframes": [
        {
          "time": 1500,
          "value": 0
        },
        {
          "time": 7500,
          "value": 1
        }
      ]
    }
  ]
}
*/
