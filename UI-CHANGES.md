# Icon identity correction — version 3.4.3

Restore the original colorful Chrome-to-Firefox puzzle icon (`icon.png`) as the extension identity, toolbar action icon, and manager tab favicon. Remove the monochrome toolbar theme overrides. Keep Firefox ESR 140 SVG icons inside the UI, including the Extensions navigation icon and fallback cards. Typography, layout, and extension functionality are unchanged.

---

# Firefox ESR 140 UI — version 3.4.2

- Use Firefox's original category-extensions.svg for navigation and extension.svg for fallback cards, empty state, toolbar, add-on identity, and tab icon. Installed add-ons continue to show their own icons.
- Use original Firefox settings, help, search, and more-options SVGs; remove the custom puzzle drawing, CSS magnifier, and text ellipsis.
- Bundle Firefox ESR 140 typography and design tokens. The system font is `message-box`, exactly as in Firefox's text-and-typography.css.
- Root and form text: 15px. Main heading: 1.467rem (22.005px). Section headings: 1.133rem (16.995px). Sidebar labels: 1.07em (16.05px), normal weight. Card names: 16px/22px, weight 600. Descriptions: 14px/20px. Footer navigation: .9em (13.5px).
- Match the 280px desktop sidebar, 24px category icons, 32px card icons, 664px content width, card borders/padding/shadows, light/dark colors, and subdued disabled cards. The compact sidebar is 102px, using Firefox's 118px width minus the 16px main margin.
- Retain the phone layout below 500px, including named icon-only navigation, instead of imposing Firefox's desktop-only 500px minimum width.
- Preserve conversion, installed-icon loading, update preparation, installation confirmation, and the configurable update interval.

Firefox source is linked in THIRD-PARTY-NOTICES.md. The source CSS and icon geometry are matched to ESR 140; OS font rendering and browser zoom still determine physical pixels. This remains a WebExtension page with its own controls, rather than a privileged about:addons page.

The XPI is unsigned and has the same extension ID as version 3.4.1. It requires the same Firefox installation setup as the previous package.

Validation: rendered in headless Firefox 153 with mocked extension APIs. Computed ESR 140 font values, light/dark rendering, 1280/800/390px layouts, search, menu dismissal, details, and interval preference saving passed. The original SVG files were compared byte-for-byte with ESR 140; color variants preserve the original paths and view box. Browser installation and live update downloads were not exercised.

---

## Earlier change history

# Firefox Add-ons Manager interface — 3.4.1

This version replaces the editorial redesign with an interface based on the supplied Firefox Add-ons Manager HTML, aboutaddons.css, and icons.

## Configurable interval

Version 3.4.1 adds Settings → Extension updates → Check every. Enter a whole number, choose Minutes, Hours, or Days, then select Save Interval. The accepted duration is 1 minute to 30 days; the default is 6 hours. The preference is saved locally and synchronized across manager tabs.

Changing an active alarm's interval schedules its next check one full chosen interval from the change. Saving the same interval leaves the existing alarm time intact. If automatic checks are off, saving an interval keeps them off; the saved interval takes effect when checks are enabled again. New alarms first check after about one minute, then repeat at the chosen interval. Browser startup checks continue independently. Invalid stored values fall back to six hours.

## Automatic extension updates

Version 3.4.0 enables automatic checks and preparation by default. The manager checks Chrome Web Store extensions when Firefox starts and at the configured interval (six hours by default) while Firefox is running. When the first alarm is created or after re-enabling the feature, the first scheduled check runs in about one minute. Actual alarm timing can be delayed while the device or browser is suspended.

Newer versions are downloaded, converted to Firefox XPIs with the same add-on identity, and stored in IndexedDB. The manager badge counts prepared updates. In an extension's options menu, choose **Install Update** and confirm in Firefox. Firefox's public WebExtension APIs cannot silently replace another extension using a locally converted XPI; this feature automates checking, downloading, and conversion, not that required installation approval. A rejected or cancelled install keeps its prepared package available. A successful install or removal clears its staged package.

Settings → Extension updates contains the automatic-check checkbox and Check for Updates Now. Disabling automatic checks clears the alarm and stops active scheduled network requests; already prepared packages remain available. Manual checks work even with automatic checks disabled. Manual-source extensions have no store update source and continue to require a file. Firefox-native alternatives installed from Mozilla's catalog remain managed by Firefox itself.

Version comparison handles numeric components (for example, 1.10 is newer than 1.9), equal versions, and downgrade rejection. Downloads run sequentially with timeouts. Automatic packages are limited to 64 MB each and 256 MB in total; larger updates can still use the existing manual update path. Individual failures are shown without stopping checks for other extensions. The only new permission is `alarms`, used for the background schedule.

## Extension icons

Version 3.3.2 shows each extension's icon beside its name. It chooses an appropriate browser-provided size for display density, tries alternate URLs when loading fails, and keeps the placeholder visible until an image loads.

During CRX/ZIP conversion, the manager caches the declared icon under the final extension ID and version. If Firefox does not expose a usable icon for an existing Web Store extension, the manager downloads its current store package, extracts only the icon for display, and caches it locally. This does not install or update the downloaded extension. The first lookup can use bandwidth up to a 32 MB package limit; lookups run at most two at a time and time out after 30 seconds. Cache writes are optional and failures cannot block conversion.

An existing manual installation without an accessible browser icon or a cached icon still uses the placeholder: there is no store package to retrieve. Newly imported manual extensions cache their icons automatically. Packages without a usable icon, unavailable store packages, and packages over the download limit also keep the fallback.

## Interface

- Firefox-style sidebar, search row, “Manage Your Extensions” heading, and gear menu.
- A 664px main content column, 32px extension icons, 16px card padding, and the supplied card typography and spacing.
- Separate Enabled and Disabled groups, compact extension cards, descriptions, current/latest versions, and per-extension options menus.
- Clicking an extension name or choosing Manage reveals its description, version, source, and ID.
- Local search filters installed extensions by name, description, source, or ID.
- Light and dark palettes follow the browser's preferred color scheme. Narrow screens use a compact sidebar and then horizontal navigation.
- Settings and support pages use the same visual style. The sidebar links to the existing installation guides.

The supplied common.css imports Firefox's private common-shared.css, which is not available to a normal WebExtension. Shared colors, fonts, and base controls are defined locally. Privileged Firefox custom elements and scripts are replaced with standard HTML and the extension's own JavaScript. Settings/help icons are adapted from the supplied files; a local extension-icon fallback covers inaccessible add-on icons.

## Controls

Open the gear menu to Check for Updates or Install Add-on From File. Each extension's options menu offers Reinstall/Update, Remove, and Manage. Manually installed extensions retain file-based reinstall guidance. Existing conversion, installation, update, removal, and download-preference behavior is retained.

Enabled/Disabled groups reflect the browser's state and refresh on management events. Enable/disable switches are intentionally absent: the extension uses its existing management capabilities, not Firefox's private AddonManager APIs. Change enabled state in Firefox's about:addons page.

This remains CRX Installer: it lists extensions installed through CRX Installer. Recommendations, themes, plugins, ratings, and signature-verification badges from the user's saved Firefox page are not imported.

## Package

The manager keeps the same add-on identity, XPIPorter@XPIPorter, and advances its version to 3.4.1. Package transformations, injected scripts, Web Store integration, and browser compatibility requirements are unchanged. Background update scheduling and the alarms permission are added in 3.4.0. Conversion additionally saves icon bytes to the local cache.

The accompanying XPI is unsigned. Existing supported-browser and signature requirements still apply; see README.md and the included guides. For temporary development loading, use about:debugging → This Firefox → Load Temporary Add-on and select manifest.json. Run `python build.py` from the project directory to rebuild `dist/firefox.zip`; a Firefox XPI uses the same ZIP format with an `.xpi` filename.

## Verification

Interval tests passed for defaults, unit conversion, minimum/maximum values, invalid input, storage-failure rollback, rescheduling, retaining an unchanged alarm, saving while disabled, and synchronization between tabs.

Update tests passed for six-hour scheduling, default enablement/opt-out, manual checks, single-flight execution, numeric version comparison, per-extension errors, cache size limits, preparation cancellation, simulated restart reuse, successful-install/uninstall cleanup, and prepared-update UI handoff. A real ZIP-to-XPI conversion test verified the resulting identity and version, and rejected equal/older package versions. Scheduler tests use simulated browser APIs and persistence; actual IndexedDB lifecycle, native Firefox prompts, and alarm delivery still require verification in Firefox.


Passed JavaScript syntax checks; HTML nesting, unique-ID, and local-link checks; CSS block, variable, and asset-reference checks; and byte comparisons of unchanged core files.

Icon tests passed for size selection, alternate URLs, manifest/action icon extraction, CRX/ZIP parsing, cache reuse and version changes, concurrent download limits, missing/offline icons, and storage failures. A real ZIP conversion test verified cached icons use the final add-on ID and that storage failure does not prevent package output.

Simulated interaction tests passed for enabled/disabled grouping, search, sidebar navigation, expandable details, menu dismissal and keyboard focus, icon failure fallback, safe text rendering, settings save/rollback, file selection/cancellation, install/update handoff, removal, management events, and failure states.

The available browser blocked local pages and files. Rendered light/dark and mobile layouts, native Firefox dialogs, and installation in a real Firefox session have not been visually or interactively verified. Tests used simulated browser APIs and a stub conversion result.
