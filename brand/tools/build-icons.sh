#!/bin/sh
# Draws every icon in brand/icons from brand/logo.svg and brand/logo-piece.svg.
# macOS only: it compiles render.swift with the Xcode command line tools.
set -eu
cd "$(dirname "$0")/.."
AUBERGINE='#2a1638'
renderer="$(mktemp -d)/render"
swiftc -O tools/render.swift -o "$renderer"
render() { "$renderer" "$@"; }

# Browsers: the piece alone at 16 pixels, where the Q blurs; the logo above.
render logo-piece.svg icons/favicon-16.png 16 0.96 none
render logo.svg icons/favicon-32.png 32 0.96 none
render logo.svg icons/favicon-48.png 48 0.96 none
render logo.svg icons/icon-192.png 192 0.96 none
render logo.svg icons/icon-512.png 512 0.96 none
# Safari's home-screen icon: opaque, and iOS rounds the corners.
render logo.svg icons/apple-touch-icon.png 180 0.8 "$AUBERGINE"

# The iPhone app's icon: opaque, 1024 pixels; iOS rounds the corners.
render logo.svg icons/ios-app-icon.png 1024 0.8 "$AUBERGINE"

# Android's adaptive icon: the foreground fills 108 units, and only a circle
# of 66 is safe from every phone maker's mask, which the logo's corners fit.
render logo.svg icons/android-foreground.png 432 0.443 none
render logo.svg icons/android-preview.png 432 0.443 "$AUBERGINE"
# Google Play's listing icon: opaque, 512 pixels; Play rounds the corners.
render logo.svg icons/play-store-icon.png 512 0.72 "$AUBERGINE"

rm -r "$(dirname "$renderer")"
