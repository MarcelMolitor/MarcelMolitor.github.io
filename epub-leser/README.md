# EPUB Reader

**Read freely. Anywhere.**

A free browser-based reader for DRM-free EPUB books, independently developed in Germany by Marcel Molitor.

[Open EPUB Reader (English beta)](https://marcelmolitor.github.io/epub-leser/?lang=en) · [Deutsch](https://marcelmolitor.github.io/epub-leser/) · [English guide](https://marcelmolitor.github.io/epub-leser/english.html)

## Features

- Open local EPUB files without uploading book contents or creating an account.
- Adjustable reading appearance, bookmarks, notes and text highlights.
- Local recent-book library, favorites and reading statistics.
- Dashboard light, dark, system and time-of-day appearance.
- Export and import supported reading data as JSON. Original EPUB files are not included.
- Responsive browser interface and installable web app on supported browsers.

## Getting started

Open the web app, select a DRM-free EPUB file and start reading. PDF and DRM-protected books are not supported. Internet access may be required to load third-party reader libraries. English interface support is currently in beta.

## Privacy and data

Book contents are processed locally. Browser storage may be cleared by the user or browser, so keep original book files and export reading data regularly. See the [privacy notice](https://marcelmolitor.github.io/datenschutz.html).

## Development

The implementation is in `index.html`, `app.js`, `style.css`, `manifest.webmanifest` and `sw.js`. It uses epub.js and JSZip. Review their upstream licenses and the repository's applicable licensing terms before redistribution. A dedicated reader license is planned but not established by this README.

## Feedback

Reproducible bug reports, accessibility feedback and translation suggestions are welcome through the [repository issue tracker](https://github.com/MarcelMolitor/marcelmolitor.github.io/issues). Do not attach private books or reading data.

## Support

The reader is free to use. Optional support information is available on the reader website; payment is not required to access its features.
