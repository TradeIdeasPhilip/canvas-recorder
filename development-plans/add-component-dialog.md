**Very rough, dictated on my pone, not cleaned up yet**:

Dialog box for adding new commandments components

Some of this is mapped out in a comments for the registry. It was some work already to add fields that were not currently using. We have a human readable description for each item I think. And we have flag that I know we're not using yet. Is this a good wrapper? That was all in preparation for this dialog box.

Get rid of the add button and the select control that are usually present. Add a new button called insert control. It's only. Present in the same cases as the old add button, only when the selected item can support replaceable children.

When you hit that button it brings up a new dialog box. We've done well with the dialog boxes and the visual editor. The dialog box will have a list of appropriate items. Initially it'll look similar to the select that we just removed. It will include some sort of memory of recently selected items just like now. Every time it gets rebuilt it remembers the last thing that you use so that's always selected.

 There will be two buttons. One of them will say wrap. One of them will say add child. Wrap will be enabled only if the registry says that this item wants to be a wrapper. Rap as defined in the existing comments says to pull out the initial item that is selected and. Insert the new wrapper item in its place. I.e give it to the same parent in the exact same z order on really the exact same position in the array in case multiple things have the same z order. Then insert the original selected item into the new wrapper that we just created and inserted.

No, there are two buttons on the front. Currently there's one for inserting new items. Next to it should be the other one that does the wrapping. In either case, there is no selector just waiting with all the items, the selector appears in the dialog box. Box. Presumably the same dialog box for both adding and wrapping, aside from the fact that items available won't be the same. Apparently some things are marked as being available for the wrap or not and currently nothing is disabled for the insert new option.

The dialog box is pretty simple, a title saying what we're about to do, create or wrap. A list of items, we've done that in multiple places. Doesn't give us instant feedback only on commit, but just copy what we've done in the other places. Each time you select an item you get to see the English description of it. And obviously an okay and cancel button at the bottom.

Not all items in the registry appear in either list by default. Registry items are always available when rehydrating Jason files. But there's a New flag in the registry that we add to hide these from the visual editor's add button by default.

Example we have the idea of a transition object. Transitions were made specifically to work with an in-series control as its parent. If its parent is anything else it displays an error message. So this should only be an option to add when the parent is a n in series control.

The selectable type needs a new optional function. Something like update registry state, that's not quite right but a name similar to that. It takes an input which is a mutable array, which is basically a copy of the contents of the registry. It can choose to add or remove items at its discretion. Most objects will ignore that field, but the the in series control will add these transition objects.
