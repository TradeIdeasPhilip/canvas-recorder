# Saving and Undoing

Currently we have most of what we need for saving and restoring what the Visual Editor changes.
This document describes some *top level* changes.
Most of the code, including serializing and deserializing, remains the same.

My main goal is to make this look more like a traditional application than a web application.
Originally I was focused on saving to IndexedDB because that is easy for web applications.
Saving to and loading from disk are a little bit tricky and/or painful in the browser.

I recently did some tests showing that we can save file handles in IndexedDB in random-tests.html.
That means that the user doesn't have to be involved every time we save or load a file.
It starts with a normal dialog box where the user selects a file.
Then Chrome will ask additional questions, and the user can give full permanent permissions to the file, or some other options.

From the user's point of view, we are saving and loading files like Word or Excel or a lot of "normal" desktop applications.
The IndexedDB is used for undo history and for when the user exits or refreshes without saving first.

## File Centered View

The system remember which file it last loaded from or saved to.
And it has a dirty flag.
The system prominently displays the name of the file, and it adds an asterisk when the file is dirty.

The software understands the special case where a file has never been involved yet.
This is loads the TypeScript defaults, like always.
Display "never saved" for the file name.
In a normal application, in similar cases, the file name appears as "untitled".
That also can be dirty or clean.

We keep the continuous auto saves.
That is required because we are still worried about unexpected refreshes from Vite.
And it is convenient, when I restart my computer, if some applications remember the exact state they were in instead of *all* my applications *at once* asking me if I want to save or not when I try to reboot.

When you ask to save it will bring up a dialog box asking you for the file name, defaulting to the last saved or loaded file name.

### Overwriting

The dialog box will always ask if you want to overwrite a file or not.
(Can we control that?  I don't think so.)
We should be able to avoid that.
Saving to the file that we most recently loaded or saved should be done through the existing file handle.
If you just hit "save" (which is not available in the case of "never saved", i.e. we've never used a file before) you don't have to see the dialog box asking for the file name or the dialog box asking if you want to overwrite the file.
"Save As" will always bring up the dialog box to select a file, and it will include the normal warning if you try to overwrite a file.

### Constant backups

We continue saving backups to IndexedDB.
In particular, whatever we save to disk should also be in IndexedDB.
If the IndexedDB state is out of date, we save to it first.
(Most of the time it should be up to date already.)
This is in case of any errors when saving the file.

## Undo

The values in IndexedDB are still available to be loaded.
We still have a load dialog box in the top right quadrant for the top level component.

The biggest difference is that we auto save more often.
Currently auto save is based on specific events, like Vite doing a reset or the user explicitly asking to save.
These were based on when we had to save, and the idea of looking at old saves was a bonus.
Now I want to be able to hit undo almost any time I make a change.

### When to Auto Save

Any time the webpage is closing or resetting, check the dirty bit.
If *and only if* something is dirty, save it to IndexedDB.
That includes using session storage as a duplicate method in case the application restarts before the database write completes, as we do now.
**This is the most important job of IndexedDB, to make sure the user never looses any work.**

We also auto save on a timer.
Any time the user changes something, we are already setting a dirty bit, now we also set a timer.
The code that is making changes doesn't know the details, it is just calling a method to report that something is dirty.
The details of the timer are hidden in that method.

Making a change will start a 5 second timer.
If there is already timer, cancel it and use the new timer.
Rationale:  If the user is making a lot of changes quickly we don't want to record them all.
If he types 1000, we don't need to record "1", "10", and "100", only the final "1000".
When we listen to an \<input type="range"> or listen directly to mouse events we often receive multiple messages per animation frame.
It's great that we update the screen every animation frame to match the current user request, but there's no way we want to send all of that to undo history.
After the timer fires we save the current state.

The two cues should not interfere with each other.
If we set a timer to save in 5 seconds, and we restart 2 seconds later, the restart should see that we are dirty and do an auto save.
There will alway be a pending timer if the dirty flag is true.

Remove the save button.
(I'm talking about the top right quadrant, the save to IndexedDB button, *not* the save to JSON buttons in the top left quadrant.)
Saves are completely automatic now, so there is no point to this button any more.

Similarly, remove any status from the screen showing our save to IndexedDB status.
By the time you stop to ask the question, has my stuff been saved to IndexedDB, it has been saved.
Beyond that, if you want to know what *else* has been saved, then you bring up the load dialog and you can see everything.
Timer status is basically an implementation detail, important to the program but not the user.

Internally we have more than one sense of "dirty."
We haven't saved to a file yet, or we haven't save to IndexedDB yet.
This would only confuse an end user.
The end user only needs to know if he should save the file again.

### Keyboard Shortcut

Can we capture command-Z and make it bring up that dialog box?
Control-Z for Windows (which I can't currently test).
Yuck!
Can we grab the "undo" *event* rather than trying to grab a specific key combination that's different on different computers?

In other places I listen for the option key because it seemed to cause fewer conflicts with other things.
Pressing option-0, for example, will jump to the start of the timeline.
I originally tried just 0 without the option key, to be more like YouTube's player, but then I had trouble when I actually wanted to type a 0 in a text field.

## Requesting a Save

The user can request to save the full state of the video at any time.

Currently we do this through the "Save and Link" and "Save Only" buttons.
Now we need 3 buttons:  "Save", "Save As" and "Save Copy As".

### Active File

To the left of the save buttons there will be a field with the current state.
This is the name of the active file or (as discussed above) "never saved" and (as discussed above) an optional asterisk.

This is very common in other applications.
This is what most of my tabs look like in VS Code, with the name of a the file in each tab.
(They use a bullet instead of an asterisk, but close enough.)

I like the term "active file."
I just came up with it so some of the documentation might say other things.

### Save

The save button will overwrite the file that we've been using, the active file.

Currently we are saving what is in memory and in active use, ignoring what is in IndexedDB.
I still want to save what's in memory.
But first I want to flush any dirty settings to IndexedDB, so the file IndexedDB and active memory will all match.

The save button will be available even if we don't think the active file is out of date.
The file might have been changed outside of this program.

The save button will be disabled if we are fresh from the TypeScript defaults with no file ever loaded.
I.e. if there is no active file and the status is "never saved".

The save button will try to use the saved file handle.
If that fails for any reason we tell the user.
The user can fall back on Save As.

(The Save button is only a convenience.
Save as will do the same thing but make you click two more times.)

We will store the name of the saved file in a different table in IndexedDB.
We will store the date of the save in the same record.
And that record will have a flag set to true, saying this is the active file and we should consider reloading from this next time.
This same record will include the file handle.

### Save As

The Save As button will do the same basic job as the save button.
The difference is that we will always prompt the user for a file name using a system dialog box.
We will save this name and handle for the next time the user hits "Save".
I.e. it will change the active file to the file we just created.
We will display this name next to the save buttons, so the user will know the last saved file and what file the "Save" button will overwrite.

The default name for the file will be active file.
The user will probably keep the same directory and most of the file name, maybe adding "_1" or " colorful version" or something like that into the file name.
The system already has a warning if the user doesn't change the name.
And everything will work if the user chooses to overwrite the current file with "save as".

### Save Copy As

Similar to Save As but this does not change the active file.
We will continue to keep the old file name and file handle as our saved copy.
If the user hits save, the old file will be overwritten, not this one.
We save this in the list of recent saves, but we set a flag so the automatic load ignores this and finds the active file instead.

This does not change the global dirty flag, either.
That will get cleared if and when we "save" or "save as".

The resulting file looks just like if we'd used "save as."
And when you look at the load dialog box all recent saves will be in the same database table and will appear in the same list in the GUI.

Use case:  I'm not sure what I've changed, so I "save as" a new file and diff that against the real file.
VS Code on the command line prompt or some other tool outside of our code will do the diff.

Use case:  I'm trying a lot of things and I'm not sure what the final version will look like and I want to jump back and forth between them to see the differences.
I might even commit these to git.

You are explicitly *not* allowed to "Save Copy As" on top of the active file.
This is probably a mistake on confusion on the user's part.
And, more importantly, it would cause problems in other parts of this code if we allowed this.
I'm only worried about cases where the file names are identical.
If two different strings refer to the same actual file, I don't care, as long as the strings are different that solves my other problem described [below](#list-of-files).

## Automatic Load on Start

On startup the program needs to check IndexedDB.
It will look for the most recent active file.
It should load that file.

Then it should check each of the top level components that we save in IndexedDB.
If the timestamp of that record is more recent than the timestamp for the entire file

After a refresh this should put the GUI into mostly the same state as before the refresh.
An exception:  If the JSON file changed outside of this program, and the relevant section is not being overwritten by IndexedDB, the refresh will cause us to load the new values from the file.

Notice the way we use timestamps.
Elsewhere this document says that saving to the json file starts by saving any dirty components to IndexedDB.
In this case make sure that the IndexedDB timestamp is before the file save timestamp.
In this case I very explicitly want to use the values in the file, not the values in IndexedDB.
The file status should be clean, no asterisk, immediately after a save.
And a restart should keep us in the clean state.

### On Failure

If we can't load the active file, or there is no active file then continue the loading process.
Assume the date on the file is -Infinity.
I.e. for each component saved in IndexedDB, *always* grab the latest version from IndexedDB.
This should give the same results (unless someone changed the file outside of this program).
These requirements very explicitly say to make sure the IndexedDB is up to date before trying to save the JSON file.

Report a warning to the user.
It's a warning, not an error, because it's interesting but we've probably recovered from it.
Message:  `Unable to load ${activeFile.name}. Using internal backups.`

### Sanity Check

Things could get messed up the the clock was off.
I don't see this as much as I used to, but let's include a quick sanity check.

When the Visual Editor initialized it should start an `async` task to get the most current timestamps from the list of saved components and the list of recent files.
Check that they are all in the past.
If not, use console.error() to report the problem, but don't stop or change anything.

## Load from user request

Keep the "load JSON" button.

Loading will first make sure that the IndexedDB status is all clean.
Any dirty components will be saved to IndexDB at this time.
I.e. if you load by mistake you can always undo, just like any other changes.
Loading will apply any and all settings from the JSON file.

After a successful load the active file will point to the file we just loaded.
This will include the current timestamp, so after a refresh we will come back in the same state.

### Missing Sections

It is possible that a file doesn't have everything it needs.
Maybe I add a new top level component or a new property to an existing component.
If there are any missing fields (or any problems) we should consider the active file as dirty.
The user should save to make sure that nothing gets lost.

If the user is unsure what the problem is, he can "save as" and compare to see the missing or changed values.

What if the user refreshes before changing anything?
How will the program know that this was a dirty load?
The timestamp will say that the most recent active file comes after any other known changes.
Let's ignore this edge case for now.

Let's just report that the load was incomplete.
Use the asterisk.
Also use the same status field where we report a bad automatic load.
Either the user deals with it himself or it goes away on it's own.

## Load from Defaults

There should be a button next to "Load JSON" that says "Load Defaults".
This copies *all* of the typescript defaults on top of what was there.
This marks every top level component as dirty, and in need of save to IndexDB and to JSON.

It might be nice to clear everything and go back to a clean state sometimes.
Also, this seems essential to do any serious testing of these requirements.

This should set the active file to null or undefined.
We have no references to it on the screen.
The save button gets disabled.

This should act just like a fresh install with an empty database.
But with one difference.
All of the old files are still available in the "Load" dialog box.
Save an entry with a null file handle in the list of recent files in IndexedDB.
This will prevent older files from being automatically loaded on restart.

### TypeScript Defaults are not sticky any more

Currently we have a special mode where TypeScript code is always loaded for certain top level components.
That was an interesting idea, but let's remove that code.
Keep it simple.
Loading from TypeScript has the same effect as if the user was reading the typescript code and making the corresponding changes in the Visual Editor.

The only rule, as mentioned before, is *which change was made later*?
Was the active file changed last or were the values in the component changed last?

## Load (Top Level Component)

This dialog box has been very successful.
We need to make some changes to fit into the new regime, but keep as much as we can of what's there.

"Initial Load" is irrelevant now.
Remove the text and the arrow pointing to one entry.
The entries will be sorted chronologically, and the top entry will always be the one that gets used after a refresh.

Bringing up the dialog box will immediately tell the component to save to IndexedDB if it is dirty.
Remember, the new plan is to always save any dirty state soon.
We might be saving a few seconds sooner than if the user hadn't brought up this dialog box.
This removes an old concern:
When we switch to an old setting, do we add the new setting to the list?

Now I want to mix all of the files in our "recent files" table with all of the auto saves from the other IndexedDB table.
They should be sorted chronologically.
Each file should include its file name and its timestamp.

The files should be reloaded as soon as the dialog box is requested.
They should initially be grayed out in the gui, until the data is ready.
Hopefully that will be a very fast process, but I want to open the dialog *instantly*.

If something fails then it turns red.

The user has the option to delete a reference to a file, just like he can delete a saved backup state.
The most recent saved state should not be deletable.
That saved state is used for various purposes.
The older saved states are only for use in this window.

Leave the TypeScript defaults option on the list as it is.

When switching to something new, when hitting "Keep" to confirm the changes:
Add a new entry to the IndexedDB undo history with the new state.
This might be a duplicate of an entry that's already in the list.
The [trimming operation](#list-of-undo-states) will remove the old copy, effectively moving it to the top of the list.
This might come from a file or the TypeScript defaults.
We explicitly do no track or care about the source.
We just save the new state with the current time so any refreshes will start from here.

Notice the special entry in the database when we hit the "Restore Defaults" button.
This tells us the last time the user hit that button.
When sorting the loadable items in the list, put TypeScript defaults in the list at this time.
If there is no special entry, the leave TypeScript defaults at the bottom of the list.
"Restore Defaults" is implicit for a new install, before you connect to any file.

## Trimming IndexedDB

Let's remove duplicate entries in IndexedDB as we add new values.

These tables are all pretty small.
We can probably do all the comparisons in the main program, looking for duplicates.

### List of Files

Any time we have trouble using a file handle, unless it is the most recent active file, delete it.

We need the most recent entry so we can report failures on the next autoload.
More important, we don't want to accidentally load an older file because there was a problem with the most recent file!

We only need the most recent entry for each file name.
If we load or save a file, and we make it the active file, we add it to the list of files table in IndexedDB.
Then we have to remove any older references to that file name.

Edge case:
What if someone tries to "Save Copy As" and overwrites the active file?
For simplicity ~~let's say that if we did a save copy as on top of the active file, we treat it like a "save".
We update the active file in the database to say that this file *is* the current *active* file *now*.
And we update the display to remove the asterisk to mark the file as no longer dirty.
And whatever else "Save" and "Save As" do, hopefully calling the same function so we don't miss anything.~~
lets make this illegal!
If the user tries to Save Copy As over the active file, that was a mistake and we report an error and don't even try.

There is no maximum length of this table.
I don't expect it to get very big.
And the load window will have buttons to delete old entries.

Notice the special entry for "Restore Defaults".
The file handle is `null`.
`null` should be treated just like any other file.
At most there should be one `null` file in the list.

### List of Undo States

The other table in IndexedDB lists all of the autosaves of the various top level components.

We are currently limiting this to 50 or some similar number in a constant in the code.
Keep that in place.

Any time we save a new undo state we should check if the identical state is already in there.
If the serialized state is identical to any older records, delete those *after* adding the new record.
(I'm very concerned about things failing and the user losing data.
If we fail in the middle of an operation it would be better to have a duplicate than a missing state.)

And the load window already has buttons to let users delete obsolete entries.

## Initial State

What happens when someone starts from a web site or a newly cloned git repository?
We don't have a most recently saved file.

This might be okay for some projects.
Maybe some projects keep most of the status in the TypeScript defaults and only use the file as a temporary measure.

In general we need a way to load a specific file.
That might be done by making the file available through the web server.
(It should be available in Vite dev mode or on a production web site.)
Or it might be done by doing a Vite "import" of a json file.

What about the load from typescript defaults buttons?
This file is considered part of the deliverable application.
This file should be read in before we save the typescript defaults.
(Or, more efficiently, we can copy this file into our local memory of the typescript defaults.)

