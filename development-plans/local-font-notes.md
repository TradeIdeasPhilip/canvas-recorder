# Local Font Notes

These are some things I've noticed when I load the local fonts from my system.

See [sources of font data](/editor-with-changable-schedules.md#sources-of-font-data) for context.

## Bug

I can correctly choose any font from document.fonts or window.queryLocalFonts(), per the spec.
But the TraditionalText editor's Font Family summary window sometimes says

```
Font Info
American Typewriter
(not found in loaded fonts — may still render if installed)
```

That message would be appropriate if the font really wasn't available.
The spec says we should not crash in this case, and this would be a good response.

When I select a font from document.fonts, this message is correct, listing the legal bold and style values for the font.
I would expect a similar display for fonts like "American Typewriter" which are legal and came from window.queryLocalFonts()

## Parsing the Data

window.queryLocalFonts() and document.fonts have totally different output formats!
We may have to do some digging to see what's available.

Of course, we see that the family exists, so we can remove that error message pretty quickly.
But we might be able to get even more information, so we can work with both types of fonts the same way.

### API Documentation

MDN says that [localFonts()](https://developer.mozilla.org/en-US/docs/Web/API/Window/queryLocalFonts) and [FontData](https://developer.mozilla.org/en-US/docs/Web/API/FontData) are both experimental technologies with limited availability.
MDN offers conflicting status reports regarding Chrome.

In my experience these work fine in Chrome.

When I run this program in Safari I do not see any exceptions.
I do not see any local fonts, only the web fonts.
That's reasonable.

Is our code explicitly checking of that method exists?
Or catching the exception if it doesn't?
If so we should add simple console.log("Warning: Local fonts are not available. Try using Chrome to fix this.")

I see _some_ warnings _in the code_ when I search for "queryLocalFonts", but I don't see anything on the console when I run under Safari.

### Style

It seems like FontData.style has the information we need.
Here's a list of the unique values that I've seen for that field:

```
window.queryLocalFonts().then(localFonts => window.localFonts=localFonts);
// This returns an unresolved promise, but by the time I type the next line it has resolved.
new Set(window.localFonts.flatMap(f => f.style.split(" "))).values().toArray()
(55) ['Plain', 'Bold', 'Extrabold', 'Heavy', 'Light', 'Regular', 'Semibold', 'Thin', 'Condensed', 'Chancery', 'Outline', '6', 'Dot', '8', 'Pinpoint', 'ExtraBold', 'Medium', 'SemiBold', 'UltraLight', 'Italic', 'Black', 'ExtraLight', 'Semi', 'Oblique', 'Book', 'Roman', 'Demi', 'Ultra', 'Extralight', 'Demibold', 'UltraBold', 'DemiBold', 'W4', 'W3', 'W6', 'W0', 'W1', 'W2', 'W5', 'W7', 'W8', 'W9', 'Ornaments', 'Wide', 'BoldOblique', 'Inclined', 'Hairline', 'ExtraBlack', 'Regular-Mono', 'Inline', 'Solid', 'Ultralight', 'HouseScript', 'Extended', 'Text']

On closer inspection, and after consulting Google, it seems that some of these are easier than others to map onto css bold levels.

New plan for fonts from window.queryLocalFonts():
Display the style string *as is* in the "Font Info" panel.
Do not try to check for invalid font weights for these fonts.

Consider the following code as a starting point:

```

[...new Set(window.localFonts.filter(f => f.family =="American Typewriter").flatMap(f => f.style.split(" ")))].join(", ")
'Regular, Bold, Condensed, Light, Semibold'

```

Continue to display unknown fonts and web fonts the way we are doing it now.

### Known items

* Some items, like "Regular, Bold, Light, and Semibold" would be easy to translate to CSS.
  * We could try to parse these.
* Some items, like "Book" don't have exact CSS counterparts.
  * Google suggests 400, unless the family already has a weight corresponding to 400, then use 450.
  * Doable, but yuck!
* "Dot 6" and "Dot 8" were associated with brail fonts.
  * I don't know any of the details, but this is exactly the sort of thing that we should display for the user to help us figure it out or at least give us a starting point.
* "Wide" and "Condensed" might translate to features that the canvas supports.
  * But they don't seem important as I can always use a transform to alter the aspect ratio myself.
  * And I don't feel like doing any more research right now.
  * But keep these visible in case I change my mind sometimes.
* "HouseScript" seems to be non-standard.
  * It comes from two fonts in the "SignPainter" family.
* "Regular-Mono" is another one off.
  * I'm not going to look all of these up!

After reviewing this list, I think the best thing to do is just to display a summary for the user and not try to do anything else with this data at this time.

## My Local Fonts

I have 1034 local fonts installed on my Mac.
Most of them came pre installed.
They are part of 317 font families.

## Summary of Action Items

Local fonts, like "American Typewriter", should *not* give a warning or error message.
Instead they should display a summary of the styles available for that font family.

If I run on Safari I should get a message on the console warning me that I'm not getting all of the fonts.
Don't check for Safari, check for "window.queryLocalFonts()", like we are doing, just add one more message for the user.

These are both described in more detail, above.
```
