These were some buggy attempts at performance improvements.

And here are the notes that came with the second buggy version:

Clean. Here's what was wrong:

The bug: When findIntersection fails (two tangent rays won't intersect on the right side), QCommand.angles silently falls back to a straight line segment, flagged internally as success: false. The glitch detector's isGood only checked the arc-length ratio — straight lines have ratio = 1, so they looked perfectly fine. These undetected line segments appeared as sharp corners in the output.

Why it happened more with analytic derivatives: The exact tangent directions (zero numerical noise) caused findIntersection to fail more often — particularly at high-curvature regions where the precise tangents are nearly parallel to each other or nearly parallel to the chord. The old numerical derivative had enough imprecision to slip past those rejection thresholds.

The fix: isGood now explicitly rejects success: false segments. The glitch-fixer then recurses on those sub-intervals using numerical derivatives (which rarely fail for smooth curves), replacing the sharp corners with proper Bezier segments.