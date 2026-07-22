# Quant Launcher

Personal macOS-style Android home launcher for tablets + keyboard/mouse.
Package: `com.alexk.quantlauncher`

## Features (v0.1)
- Uses your **system wallpaper** as the desktop background
- **macOS-style dock** with an Android-logo Launchpad button
- **Launchpad** app grid + search
- Consistent **Quant squircle icon pack** styling over real app icons
- Registers as a **Home / launcher** app (HOME + DEFAULT)

Top menu bar is intentionally stubbed for a later pass.

## Open in Android Studio
1. **File → Open** → select this `quantlauncher/` folder
2. Let Gradle sync
3. Run on your MatePad / emulator

Or copy the whole folder to:
`C:\Users\<you>\AndroidStudioProjects\quantlauncher`

## Set as default home
After install: press Home → choose **Quant Launcher** → Always

## Notes
- `QUERY_ALL_PACKAGES` is used so Launchpad can list apps (Play may require declaration for Play Store later; fine for sideload/personal use)
- No ads
- Not related to Quant company branding beyond the name
