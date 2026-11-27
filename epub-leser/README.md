# MOLITOR EPUB Reader

**Your books. Your reading space.**

A free browser-based reader for DRM-free EPUB books, independently developed in Germany by Marcel Molitor.

- [Open the reader](https://marcelmolitor.github.io/epub-leser/)
- [English product page](https://marcelmolitor.github.io/epub-leser/english.html)
- [Deutsch](https://marcelmolitor.github.io/epub-leser/)

## What it does

- Open local EPUB files in a modern browser.
- Keep book contents on the user's device instead of uploading them to a reading account.
- Navigate by table of contents, page controls and in-book search.
- Save reading position, bookmarks, notes and text highlights.
- Choose light, sepia or dark reading themes and adjust typography.
- Keep a local recent-books shelf, reading goals and reading statistics.
- Export supported reading notes, highlights and reading data.
- Install the web app in browsers that support PWA installation.

## Compatibility and limitations

- Designed for DRM-free EPUB files.
- PDF and proprietary Kindle formats are not supported.
- DRM-protected EPUB files may be incompatible.
- The reader loads epub.js and JSZip from jsDelivr; an internet connection may be needed when starting the reader.
- The application shell can be cached by a supported browser, but full offline reading is not guaranteed.
- The English product page is available. The reader interface is only partially translated into English; some controls and messages may still appear in German.

## Privacy and local data

Book contents are processed in the browser. Recent-book information and reading data can be stored in IndexedDB and localStorage on the device. Browser site-data cleanup can remove this information. Users should keep original EPUB files and export reading data regularly. See the [privacy notice](https://marcelmolitor.github.io/datenschutz.html).

## Development

The application is implemented in:
- `index.html`
- `english.html`
- `app.js`
- `style.css`
- `manifest.webmanifest`
- `sw.js`

It uses epub.js and JSZip. Check upstream dependency licences and the repository's licence before redistributing bundled code. This README does not claim that every dependency is covered by an open-source licence compatible with every redistribution scenario.

## Feedback

Please report reproducible bugs, accessibility issues and translation suggestions in the [GitHub issue tracker](https://github.com/MarcelMolitor/marcelmolitor.github.io/issues). Do not attach private EPUB files or personal reading data.

## Support

The reader is free to use. Optional support information is available on the reader website; payment is not required to access its features.
