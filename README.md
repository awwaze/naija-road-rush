# Naija Road Rush — Android & iOS app

Arcade racing across Lagos, Abuja, Port Harcourt, Kano, Ekiti and Enugu.
Built with Capacitor 8. App ID: `com.awwalng.naijaroadrush`.

The full step-by-step guide (GitHub build, Android Studio, Google Play, iPhone) is the
"Naija Road Rush — Build & Publish Guide" doc shared with this project.

## Quick reference
| Task | Command |
| --- | --- |
| Install tools (first time) | `npm install` |
| Copy game changes into the apps | `npx cap sync` |
| Open in Android Studio | `npx cap open android` |
| Regenerate icons/splash from `assets/` | `npm run assets` |

- Game code: `www/index.html` (single file, no build step)
- Android test APK: built automatically by `.github/workflows/android.yml` on every push
- Play Store bundle (.aab): same workflow, once the 4 `NRR_*` signing secrets are added
- iPhone: `codemagic.yaml` → workflow "iOS build to TestFlight" (needs Apple Developer account)
- Store images and listing text: `store/`

Requirements for local builds: Node.js 22+, Android Studio Otter (2025.2.1)+, JDK 21 (bundled with Android Studio).
