# Third-party notices

## Mozilla Firefox ESR 140

The UI uses the Mozilla Firefox `esr140` source branch:
https://github.com/mozilla-firefox/firefox/tree/esr140/toolkit/mozapps/extensions

The following files are governed by the Mozilla Public License 2.0 and retain their source notices:

- `styles.css`: adapted from `toolkit/mozapps/extensions/content/aboutaddons.css` and `toolkit/themes/shared/in-content/common-shared.css` for an ordinary WebExtension page.
- `assets/firefox/tokens-shared.css` and `text-and-typography.css`: original files from `toolkit/themes/shared/design-system/`.
- `assets/firefox/tokens-brand.css`: original file from that directory, with its `chrome://` import changed to a relative local import.
- `assets/firefox/category-extensions.svg` and `extension.svg`: unchanged originals from `toolkit/themes/shared/extensions/`. `assets/extension.svg` is a compatibility copy of the latter.
- `assets/firefox/settings.svg`, `help.svg`, `more.svg`, and `search-glass.svg`: unchanged originals from `toolkit/themes/shared/icons/`.
- `assets/firefox/extension-light.svg`, `extension-dark.svg`, and `extension-page.svg`: local color variants of Firefox's `extension.svg`. Only paint attributes and, for the tab icon, a dark-mode style differ. Paths, view boxes, and geometry are unchanged.

CSS masks use the original icons' alpha channels and apply the surrounding text color. The browser action and tab icon variants use explicit fills because unprivileged extension pages cannot rely on Firefox's privileged SVG context painting.

The editable source is included in this distribution. MPL 2.0 is available at https://mozilla.org/MPL/2.0/.

The Firefox name describes the compatibility target and visual reference. This is not an official Mozilla product. The original project license remains in LICENSE. Bundled dependencies retain their notices.
