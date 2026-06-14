# Leaderboard Fonts

These Noto fonts are bundled so the generated leaderboard PNG renders stylized member names consistently on Render/Linux.

The leaderboard image is rendered server-side with `@resvg/resvg-js`; relying on system fonts caused missing glyph boxes for Discord names using Tibetan, Canadian Aboriginal, Cherokee, Devanagari/Common Indic Number Forms, Yi, Tai Viet, Tai Le, Limbu, and Syloti Nagri code points.

Fonts are from the Google/Noto project and are distributed under the SIL Open Font License 1.1:

- https://fonts.google.com/noto
- https://notofonts.github.io/
