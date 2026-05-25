# #SoME5 Script

Let's discuss matrices.

The good news, the computer will help you create matrices.
And the computer will multiply the matrices for you.
All you have to do is put them in order.

I've got a question.
Any math people out there?
How do I put my matrices in the wrong order almost every time!
There are only two choices, I should be right half time just by luck.

Let me show you how I stopped guessing and really learned to understand what's going on.

## Affine Transforms

The focus of this video is matrix multiplication.
My examples will focus on affine transforms.
I'm using these because I know them well, and because they they show off well.

Let me give you the short version.
Affine transforms are very popular for 2d graphics on modern computers.
They describe things like rotations and translations.
Scaling and skewing.

Each point is represented by a column vector.
That's a matrix that's only one column wide.
Shapes are, of course, just a collection of control points.

Each operation is represented by a square matrix.
There is an affine matrix that will double the size of you image.
And a different one will quadruple the size of your matrix.
Another one will slide it or rotate it.

You apply a transform to a point, by multiplying them.

There are a few more details.
If you've studied matrix transforms, but not affine transforms, you might notice that affine matrices are bigger.
And sometimes people don't bother to list all of the terms.
Affine matrices are really cool, and worthy of further study.
But all you need to know for today is that points are represented by 3×1 matrices, and transforms are represented by 3×3 matrices, and the computer will take care of the rest for you.

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

"Flip" or "3 pixels to the left".

# Pause and Ponder

Do you lose any important information when you convert from words to a matrix?

For a fixed image, no, I don't see any problems converting to a matrix and abandoning the string.
When I rotate by 180 degrees or I rotate by -180 degrees, the result is the same.
But watch what happens when I animate the rotation from 0 to 180 or -180.

# Vocabulary: "Pixels"

You will sometimes see the letters "px" in my examples.
That's short for "pixels" but it **means** nothing.

That's an annoying issue with a lot of tools.
They perpetuate the myth of the pixel.
A pixel is an archaic design construct.
Some people say if you get really close to your monitor and squint you can even see them.
Yeah, right, and if you get all the way to the rainbow you can keep the leprechaun's gold.

Seriously, my favorite part of affine matrices is that they can change your coordinate system to anything you want.
In my normal operations my screen is 16 by 9 because I find 16 and 9 to be convenient and easy to remember.
By default one "pixel" is 16th the width of the output.

If there is such a thing as a pixel, it would be banished to the bottom of my tool stack.
And that's where it belongs, far from me.
I'm willing to pretend pixels are real when I decide to upload YouTube in 4k.

Two of my pet peeves:

- Tools that make me pretend to care about pixels.
- Tools that convert to pixels too soon.

Affine matrices are the magic that makes vector graphics look so good.
I care about affine matrices because I don't have to care about pixels.
