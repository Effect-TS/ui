---
"@effect/ui-native": patch
---

Make `Pressable` focusable unless the caller sets `focusable`, as React Native does, and send `onPress` when a keyboard or TalkBack activates it on Android.
