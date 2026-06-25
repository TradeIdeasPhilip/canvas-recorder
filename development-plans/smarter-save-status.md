# Smarter Save Status

Our automatic saves to IndexedDB are a good start, but they need some cleanup.

This plan is inspired by my recent and ongoing work on some5.ts.

## Savable Units

We don't have good terminology yet.
Each entry in IndexedDB discusses one "top level" or "root" component.
The new JSON files get rid of the history, and only show you the most current components, but that's a subset of what's in IndexedDB.
We can restore or ignore a single record, we never try to merge these records.

These are the `Showable` written in TypeScript which are available from the drop down "chapter" \<select> element.
If the `components` or related fields are not `undefined` then the Visual editor will let you edit them.

**TODO** We need better terminology.

## Use Case

Sometimes I make a lot changes with the Visual Editor.
Other times I make a lot of changes in the TypeScript code.

I can imagine two separate modes.
If I'm constantly making changes in the code and I hit refresh, I shouldn't have to tell the Visual Editor to re-load the typescript defaults each time.
When I'm making changes via the visual editor and saving to IndexedDB, then IndexedDB should take priority, like it does now.

### Basic Solution

Each savable unit should be in one state ore the other.
If its current state was read from IndexedDB, the next restart should make no changes.
Read the same value out of the database next time.

If we read the state from the typescript defaults, then we should remember that decision.
We should _not_ automatically save the values from the TypeScript defaults into IndexedDB.
The next restart should remember that we want to read the latest from the TypeScript defaults, not the previous value of the TypeScript defaults.

If the user changes anything in the Visual Editor, that should be saved automatically.
The next restart will start from there.
The user can hit the button that already exists to save at any time, even if he hasn't changed anything.

## New Status

Currently \<select id="scheduleHistorySelect"> gives you some idea of what's loaded.
But it's an input as much as it's an output.
You can change that while looking at options without actually loading anything.

We need to constantly show the user two things.
What did he load from (one of the existing entries) and whether or not it was modified (often drawn as an \* in a lot of programs).

When you hit save, this will update to show the current time and date and to show that the GUI is _not_ dirty.
When you load an existing item, that item will stay on the GUI and it will show that the state is _not_ dirty.
When you modify anything, the status immediately changes to dirty but the initial source (date and time or "TypeScript defaults" or "JSON file") remains in place.

No, don't say "JSON file".
Say the actual name of the file, like "some5.json".
That is meaningful and can be searched for on github or on the local file system.

### Changing and Changing Back

What if the user makes a change then changes it back?
Do we still mark the item as dirty?

**No.**
It seems like

- it would not be hard to catch this event and do the test,
- it would reduce the amount of duplicate saves,
- and you can always override this with the GUI if you want.

So we should only show things are dirty if they are actually different from the saved version.

We will need some sort of callback to tell the Visual Editor that something has changed.
That code could just set the dirty flag.
But that same code could do the comparison just as easily.
There's the one time cost to write that comparison code,
but each call to notify of a change will be just as simple.
And if this becomes a problem we can always disable it (or optimize it) in just one place.

My biggest problem with our infinite undo logic is that it does leave too many items in the database.
SPAM!
It would be nice to remove and reduce the duplications.

And you see the status very clearly.
You can see if there is no \* and you expect to see a \*, you can manually override and save.

Notice my comments about JSON files, below.
In a certain very specific case something might be marked permanently dirty.
Specifically when you *manually* load from the JSON file.

## New GUI

Replace the \<select> control with a dialog box.
Display the current status in that place, as described above.
But the only way to load a different settings is to bring up the dialog box.

The dialog should list all of the same items that are in currently in the \<select>.
Old problem: You cannot listen for every change to a \<select> like you can with an HTML \<input>, only on a "commit."
We need a simple way to select and scroll through the options.
Much like our color picker dialog you can see your results instantly.
You can use OK or Cancel to close the window, possibly rolling back.

If the current state dirty then we create a new entry at the top of the list for the current state.
That would be redundant if the state is not dirty.
In either case the initial state will be in the list and it will be clearly marked as the initial state.

The user can very quickly and easily switch states.
You can click on a different state.
You can move up and down with the arrow keys.
You can scroll if the list is too big to fit on the screen at once.

If we switch _from_ a dirty, unsaved option, should we save the old option?
I'd rather **not** pop up a second dialog box to say "Save Yes/No".
Maybe instead of "OK" there should be two buttons:
"Switch and Abandon" or "Switch and Save".

### Edits

As long as we have this GUI, this would be a great place to delete old items from the database!

(In particular we have a list of items in the database *and* we can preview them.)

## Saving the Status

If you hit the save button, things continue to work as normal.
If we autosave a dirty component, we save things just like normal.

If you load the "TypeScript defaults," using the button or automatically, then we need to remember that request.

Save something special in the database.
Maybe save the current time as a key, like always.
Then the body will be the *string* "TypeScript defaults" instead of an object describing the details of the state.
The automattic load routine will recognize this and will leave the typescript defaults in place.

Save something special in the database, but only if that's required.
If the most current record in the database (for this component) is already pointing to the typescript defaults, there is no need to make another entry.
(I think we already have code checking if the new entry is a duplicate of the most recent entry before adding the new entry.)
And if the database is empty, if there are no saved versions of this component, there is no reason to save something new.

When we save to the JSON file, this is easy to handle.
If the current state is "TypeScript Defaults" and it is *not* dirty, then we just skip the entry for this component.
We don't write anything.
IndexedDB needed a special value so a historical item won't get confused for the current item.

*Manually* loading from a JSON entry isn't that exciting.
Just treat it like a dirty item.
It should get saved to the database sometimes soon, no change from the current action.
Show "JSON File" as the source.

*Automatically* loading from a JSON entry isn't that exciting.
Treat it like automatically loading from the TypeScript defaults.
There's nothing special we have to do.
Display "JSON File" as the source, but otherwise no change.
If I hit refresh immediately, and we don't save anything, we restart in exactly the same state.
I will go back to the JSON file.

## Recycle Bin

In certain cases it should be fast and easy to abandon things or delete things.
I think we're on the right track, but it still scares me.

For now lets create a function called sendToRecycleBin(args...:any[]).
For now just send ...args to console.info().
Any time the user hits "Switch and Abandon" or asks to delete something from history, send the old value to this new recycle bin.

If I'm right this can be ignored or the messages can even be removed.
If I do have to search the recycle bin, then I might consider something more permanent.
Either way, this function is a good hook that can stay in place.