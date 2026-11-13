# PuzzleQuest brand

The logo, colors and icons shared by the website and the iPhone and Android
apps. Each of them copies what it needs from here.

## Logo

The puzzle piece with a Q: a pale gold piece, with an aubergine outline and Q.

| File             | Use                                                                      |
| ---------------- | ------------------------------------------------------------------------ |
| `logo.svg`       | The logo. Everywhere it shows at 32 pixels or more.                      |
| `logo-piece.svg` | The piece without the Q, for 16 pixels, where the Q blurs into a smudge. |

On aubergine, the outline disappears into the background and the gold piece
stands on its own; on white, the outline keeps its edge. Use the logo as it
is: don't recolor it, stretch it, or set it on a busy photograph.

The shapes were traced from the original gray logo
(`apps/api/src/public/image/pq-logo-192.png`) by `tools/trace.swift`. The SVGs
are the source now; edit them, not the tracer.

## Colors

| Name            | Value     | Use                                                                |
| --------------- | --------- | ------------------------------------------------------------------ |
| Aubergine       | `#2a1638` | Banners, headers and other dark surfaces; the logo's outline and Q |
| Aubergine, soft | `#c9b6d6` | Quieter text on aubergine                                          |
| Purple          | `#6a2c91` | Buttons, links, and the transit line                               |
| Gold            | `#e8b33a` | The button on the current stop's card, with aubergine text         |
| Pale gold       | `#f8ecc4` | The logo's piece                                                   |

## Icons

`icons/` holds every icon, drawn from the SVGs. To draw them again after
changing a logo (macOS, with the Xcode command line tools):

```sh
brand/tools/build-icons.sh
```

| File                     | Size | Use                                                          |
| ------------------------ | ---- | ------------------------------------------------------------ |
| `favicon-16.png`         | 16   | Browser tabs (the piece alone)                               |
| `favicon-32.png`         | 32   | Browser tabs on high-resolution screens                      |
| `favicon-48.png`         | 48   | Browser shortcuts                                            |
| `icon-192.png`           | 192  | A transparent logo for anywhere else                         |
| `icon-512.png`           | 512  | A transparent logo for anywhere else                         |
| `apple-touch-icon.png`   | 180  | Safari's home-screen icon (opaque; iOS rounds the corners)   |
| `ios-app-icon.png`       | 1024 | The iPhone app's icon (opaque; iOS rounds the corners)       |
| `android-foreground.png` | 432  | A picture of the Android adaptive icon's foreground          |
| `android-preview.png`    | 432  | The same on its aubergine background, to preview masks       |
| `play-store-icon.png`    | 512  | Google Play's listing icon (opaque; Play rounds the corners) |

Android's adaptive icon is a foreground on a background color, both 108 units
square. Phone makers cut it to their own shape, and only a circle 66 units
across is safe, so the logo fills 44.3% of the foreground. The app draws its
foreground as a vector drawable made from `logo.svg`, with that placement.
