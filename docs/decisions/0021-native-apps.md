# 0021. Native apps in SwiftUI and Kotlin, in their own repositories

- **Status:** accepted
- **Date:** 2026-11-10

## Context

PuzzleQuest wants iOS and Android apps, for push notifications and a camera
that scans a stop's code at once. The API was built for any client (see
[0005](0005-api-first.md)), and native apps sign in with a Bearer token and
follow live updates with tickets ([0019](0019-live-update-tickets.md)).

A spike (2026-11-09, on the local branch `spike/native-apps`) built the same
slice three times: Expo (React Native) for both platforms, SwiftUI for iOS,
and Kotlin with Jetpack Compose for Android. Each signed in, followed quests
live, activated a stop, revealed a hint, answered, and received push. All
three passed the same automated checks, and in release builds Expo kept pace
with the native apps. The differences that mattered:

- **Download size:** about 2 MB for each native app, against about 45 MB for
  Expo on one Android phone, most of it the React Native runtime. Players may
  install at the first stop, over mobile data.
- **Dependence:** Expo puts its runtime, its build tools and a yearly SDK
  upgrade between the app and the platform. The native apps used the
  platforms' own tools and built in seconds.
- **Shared code:** Expo could reuse the web app's generated client and
  live-update logic. The native apps wrote both again by hand, which is where
  the spike's one real bug came from.

## Decision

- The iOS app is written in Swift with SwiftUI; the Android app in Kotlin with
  Jetpack Compose. Each uses its platform's own libraries where one exists.
- Each lives in its own repository, `puzzlequest-ios` and
  `puzzlequest-android`, with its own build, tests and releases. Neither
  shares code with this repository or with the other.
- The published OpenAPI description (`/api/v1/openapi.json`) is the contract
  between the repositories. Each app generates its API types and client from
  a pinned copy of it, never by hand, and runs contract tests against a real
  API server. Those tests cover the live-update follower, which each app
  writes to behave as `packages/api-client/src/live.ts` does.
- Within `/api/v1`, changes only add: new routes, new optional request
  fields, new response fields. Nothing is removed, renamed or made required,
  because installed apps stay on old versions for months. A change that can't
  be made that way becomes `/api/v2`, served alongside v1.
- The API sends push notifications itself, to Apple's service and to Firebase
  Cloud Messaging, for devices the apps register with it.

## Consequences

- Small apps that behave as each platform's users expect, built with tools
  that change only with the platforms themselves.
- Three clients to keep in step, in three languages. A feature that touches
  all of them is three pieces of work, and the API has to be released before
  the apps that use it.
- Styling is per platform: a theme in each app (asset catalog colors and
  reusable styles in SwiftUI, a `MaterialTheme` in Compose) rather than one
  stylesheet. Brand colors and fonts are kept consistent by hand, or later by
  generating all three from one tokens file.
- This repository needs, before the apps: the description published as a
  versioned artifact the apps can pin, and device registration and push
  sending as real API work (the spike's were throwaway).
- Real iOS push, TestFlight, and installing on phones need an Apple Developer
  account; Android releases need a Google Play developer account and a
  Firebase project.
- Neither platform comes first; the apps can be built in either order or
  together.

## Alternatives considered

- **Expo (React Native), one codebase for both:** the spike's draft
  recommendation, for its shared code and single language. Not chosen: apps
  twenty times the size, and a framework layer the owner doesn't want to
  depend on. Generated types and contract tests guard the API contract
  without sharing code, and old installed apps need the compatibility rule
  whichever way the apps are built.
- **The web app in a native shell (Capacitor):** not tried. It would keep the
  web app's look and code, but not a native app's feel.
- **One repository for both apps, or the apps in this one:** they share no
  code with each other or with the web app, use different tools, and ship on
  their own schedules through app review. Separate repositories also let a
  contractor for one platform work in just that one.
