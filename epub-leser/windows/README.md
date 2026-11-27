# MOLITOR EPUB Reader for Windows (development preview)

Windows 11 desktop project using Tauri 2 and WebView2. Not a released installer.

## Build
Install Rust (MSVC toolchain), Visual Studio C++ Build Tools, WebView2 and Node.js. From this directory run `npm install`, then `npm run build`. The build stages the existing reader HTML, CSS and JavaScript locally. The current reader may still need internet access for CDN libraries; offline support is not verified.

## Acceptance checks before release
- Open a DRM-free EPUB from disk; navigate, search and restore reading position.
- Test German and English, keyboard navigation, high DPI and window resizing.
- Verify local storage, external links, untrusted EPUB content and offline behavior.
- Build and test the installer on Windows 11; do not publish an untested binary.

The approved navy design is a target, not a screenshot of the current implementation.
