# #SoME5 Script

Let's discuss matrices.

The good news, the computer will help you create matrices.
And the computer will multiply the matrices for you.
All you have to do is put them in order.

I've got a math question.
Any math people out there?
How do I put my matrices in the wrong order almost every time!
There are only two choices, I should be right half the time just by luck.

Let me show you how I stopped guessing and really learned to understand what's going on.

## Affine Transforms

The focus of this video is matrix multiplication.
My examples will all be affine transforms.
I'm using these because I know them well, and because they they show off well.

Let me give you the short version.
Affine transforms are very popular for 2d graphics on modern computers.
They describe things like rotations and translations...
...scaling and skewing.

Each point is represented by a column vector.
That's a matrix that's only one column wide.
Shapes are, of course, just a collection of points.

Each operation is represented by a square matrix.
There is an affine matrix that will double the size of your image.
And a different matrix will quadruple the size of your image.
Others will slide it or rotate it.

You apply a transform to a point by multiplying the two matrices.
You apply a transform to an image by applying the transform to each of the image's points individually.

There are a few more details.
If you've studied matrix transforms, but not affine transforms, you might notice that affine matrices are bigger.
And sometimes people don't bother to list all of the terms.
Affine matrices are really cool, and worthy of further study.
But all you need to know for today is that points are represented by 3×1 matrices, and transforms are represented by 3×3 matrices.
The computer will take care of the rest for you.

## What could possibly go wrong?

"Computer, move that 5 units to the left, and make it twice as big."

Seems simple enough.
But am I moving it 5 units _first_, _then_ making everything bigger?
Or am I measuring the 5 units _after_ I make everything bigger?

## Transforms as Functions

My thesis is simple: You want to focus on transforms as functions.
For example:

- `double(myPoint)`
- `quadruple(myPoint)`
- `double(double(myPoint))` == `quadruple(myPoint)`

Why?

### Parentheses

Let's start with the obvious part.
There's only one way to read the following: `tan(sin(cos(x)))`.

It doesn't mater what that means.
I just made it up, it means nothing, but you still know the rules.

First you look up the value of x.
Let's say 10, just to be specific.
Then you need to solve: `tan(sin(cos(10)))`.

The next step is to find the cosine of 10.
I don't expect you to know that value.
Let the computer do the calculations.
Your job is to write or review the equations, not to solve them yourself.
My calculator says the cosine of 10 radians is -0.83907153.
So now we need to solve `tan(sin(-0.83907153))`

Now we have to find the sine of -0.83907153 radians.
My calculator says -0.74402308.
So now we have to solve `tan(-0.74402308)`
One more trip to the calculator gives us the final answer: `-0.92049402`.

Affine transforms work the same way.
You will see a series of square matrices all in a row, ending with a column vector.
The computer will take care of the multiplications for you.
You just need to know what this means.
There are a lot of ways to manipulate this equation.
But when you are trying to understand the meaning of the whole thing, look at it as a series of functions.

### Names

Notice the text that I use to specify affine transforms.

"Flip"
This is an operation that I can perform on an image to get another image.
Flip is a function from images to images.

"3 pixels to the left"
Again, this is an action that I perform on an image resulting in a new image.
The text describes a function.

## Vocabulary: "Pixels"

I don't want to get bogged down in vocabulary.
But this one gets forced on us, so let me explain what it means.

You will sometimes see the letters "px" in my examples.
That's short for "pixels" but it **means** nothing.

!["Are these pixels?" Extreme closeup of a TV.  Thumbnail from Technology Connections' video: "These Are Not Pixels: Revisited"](https://img.youtube.com/vi/Ea6tw-gulnQ/0.jpg)

That's an annoying issue with a lot of tools.
They perpetuate the myth of the pixel.
A pixel is an archaic design construct.
Some people say if you get really close to your monitor and squint you can even see them.
Yeah, right, and if you get all the way to the rainbow you can keep the leprechaun's gold.

![Minecraft leprechaun.  Thumbnail of "Minecraft Pixel Art - Leprechaun 8 bit".](https://i.ytimg.com/vi/tyCtPQ21sEc/maxresdefault.jpg)

Seriously, my favorite part of affine matrices is that they can change your coordinate system to anything you want.
In my normal operations my screen is 16 by 9 because I find 16 and 9 to be convenient and easy to remember.
By default one "pixel" is 16th the total width of the output.

If there were such a thing as a pixel, it would be banished to the bottom of my tool stack.
And that's where it belongs, far from me.
I'm willing to pretend pixels are real when I decide to upload to YouTube in 4k.

Two of my pet peeves:

- Tools that make me pretend to care about pixels.
- Tools that convert to pixels too soon.

Affine matrices are the magic that makes vector graphics look so good.
I care about affine matrices because I don't have to care about pixels.

## Example 1: SVG

I love SVG because it really makes things clear.
Here I have an object that I can display on the screen.
Here I have a second object.
It was clearly made from the first object, but with a transform applied to it.

Notice the order.
You are still moving right to left as you apply the functions.
Let me put this all on one line, so it's more clear.

## Matrix Multiplication is Associative but not Commutative.

What does that mean?
It means that if my request has things in the wrong order, I will get the wrong result.
But it also means we can we move these parenthesis around any way we like.

We often regroup the matrix multiply operations for a variety of reasons.
One would be performance.
Maybe these two are used in combination all the time, so why not do the multiplication once in advance.
Another is convenience.
The next example does all the matrix multiplication in the opposite order because that fits with the rest of the workflow.

This is where a lot of people will bring up function composition.
You can move the parentheses around with functions just like with matrix multiplication.
That little circle is the composition operator.
I have never found this perspective helpful and I recommend you skip it.
Honestly, I wouldn't have brought it up at all, but I really like drawing circles.

## Example 2: Canvas

The HTML canvas offers a lot of the same tools as SVG, but in a different format.

Here's the same code, side by side with SVG.
It looks a little different, but you can see a one to one match between the two.

In this case the code is all stacked one line on top of the next.
But you still understand the order.
In fact let me put that all on one line for you.

JavaScript is like English.
You read left to right and top to bottom.
And you use the same trick.
You apply the last transform to the image first.
Then you apply the second to last transform to the first result.
The same process we've been doing.

Again, this function centered view is the best way to _understand_ the transform, and to make sure we got everything in order.
But lets take a look at what the canvas is actually doing.

The canvas **always** applies a transform to all drawing operations.
But it starts with the identity matrix, so nothing actually changes.
Welcome to modern computer graphics where matrix multiplication can be faster than an "if" statement!

Each time I request a transformation (rotate, translate, scale, etc.) the canvas turns those instructions into a matrix.
Then it multiplies the current matrix with the newly requested matrix, and it stores the resulting matrix.
The canvas doesn't have to store a whole list of instructions because they are all compressed into a single matrix.
And we can use that matrix immediately; we don't need to recompute it every time we draw something.

The result is the same either way.
The canvas is computing the transform by doing the multiplications left to right.
We are thinking about the multiplications going right to left, like function applications, when we try to understand the effect.
But in both cases the result is the identical.
When you look at the canvas's transform property you can think about a the actual matrix, or you can image a list of transforms waiting to be applied from right to left _the way we like to do it_.

Here's how I usually set up my software.
The _last_ thing I'm going to do is to scale each image.
The bulk of the image is built to fit in a screen that is 16 × 9.
And that's how I want it.
Most of the program doesn't know or care what resolution I use to upload to YouTube.
But at the last minute I scale up by 240× in both dimensions.
And like magic my video fits perfectly into the 4k resolution.
I implement that by requesting the scaling operation _first_.

## Do we lose anything in the Matrix?

When we convert a string like "scale(20, 30)" or a method call like `.scale(20, 30)` into a matrix, and when we combine multiple steps into a single matrix, do we lose anything?

We cannot completely reconstruct the original instructions.
The following instructions will all lead to identical matrices:

- `context.scale(5); context.scale(2);`
- `context.scale(2); context.scale(5);`
- `context.scale(10);`

But the end user won't care if we multiplied by 5 first, then by 2, or the other way around, or if we did it all in one step.

So, are there any cases where we lose something _important_ when we put everything into a matrix?

Why don't you pause and ponder on that one and I'll give you the answer in a moment.

Do you lose any important information when you convert from words to a matrix?

For a fixed image, no, I don't see any problems converting to a matrix and abandoning the original instructions.
When I rotate by 180 degrees or I rotate by -180 degrees, the result is the same.
But watch what happens when I **animate** the rotation from 0 to ±180.

## Strings with multiple transforms in them

This one is useful but it was always very confusing to me.
CSS lets you specify multiple operations in a row.
Something like "scale(0.5) translateX(10px)".

Both of those operations are simple.
But what order do we do them in?

Let's use the same trick as we've been using.
This is a function that makes things half as big followed by a function that moves things 10 "pixels" to the right.
That means that eventually we will apply to the translation to an image creating a new image.
_Next_ we will apply the scale.
As always, we are applying functions going from right to left.

The result is that "scale(0.5) translateX(10px)" and "translateX(5px) scale(0.5)" both mean the same thing.

## Grouping

Notice how scale() transforms always scale around the origin.
And rotate() rotates around the origin.
Same with skew.

What if you wanted to scale around a different point?
That's actually quite easy.
First we move our object so the origin is in the place that we want to rotate around.
Then we do the rotation.
Then we move our object back to where it was.

Three simple steps.
Now let's see if we can get these in the right order.

The rule is simple:
We imagine moving the image on top of the origin _first_, so let's write that transform _last_.
If we want to spin around (x,y), then we "translate(-x, -y)" to move that part of the image to the origin.
Then we rotate.
A skew or scale would also go here.
The _last_ thing we want to do is move the rotated image back to (x,y).
So we add "translate(x, y)" to the _beginning_ of our instructions.

I've shown code for this four different ways.
(Stack of svg elements, canvas JavaScript, single CSS string, explicit matrix multiply)
Different programming tools have different interfaces.
But we're always doing the same three transforms.
And we're always doing them in the same order.
And we're always listing them with the last operation first.

Notice that I created created a new function.
You can now say rotateAbout() to rotate around any point.
This works just like any of the standard transforms.

That's the beauty of matrix transforms.
You can start with a series of operations.
And you can compress them all down to a single matrix.

## Conclusion

I hope this tip helps you as much as it's helped me.
We are surrounded by such powerful tools.
But it's so easy to make a simple mistake and get confused.

Any time you have a series of transforms, and you want to know what they do, think about them as functions.
You _apply_ them in the opposite order as you would normally _read_ them.
You apply them from right to left, or bottom to top.
You might actually _compute_ this in a different order.
But when you want to _understand_, you do it this way.
