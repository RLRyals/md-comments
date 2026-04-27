# Changelog

## v0.1.1 — 2026-04-27

- **License changed** from MIT to [PolyForm Noncommercial 1.0.0](LICENSE). Free for personal, hobby, research, and education use; commercial use is not permitted. The v0.1.0 VSIX remains under MIT.
- No code changes.

## v0.1.0 — 2026-04-27

Initial release.

### Features

- Custom editor for `.md` files (opt-in via **Open With…**) that renders markdown as a styled, editable WYSIWYG view.
- **Highlight comments**: select text → 💬 toolbar button or <kbd>Ctrl/Cmd</kbd>+<kbd>Alt</kbd>+<kbd>M</kbd> → write a note. Saved on disk as paired `<!-- mdc:start id -->text<!-- mdc:end id comment -->` markers.
- **Point comments**: place caret → right-click → **Insert Comment Here**, or <kbd>Ctrl/Cmd</kbd>+<kbd>Alt</kbd>+<kbd>M</kbd>. Saved as a single `<!-- mdc:point id comment -->` and rendered as a clickable 💬 pin.
- Edit or delete any comment by clicking the highlight/pin (or <kbd>Tab</kbd>+<kbd>Enter</kbd>) to open the popup.
- Right-click context menu with full keyboard parity (<kbd>Shift</kbd>+<kbd>F10</kbd>, arrow-key navigation, <kbd>Esc</kbd> to dismiss).
- Comments sidebar listing every highlight and pin in document order; click a card to scroll to and flash the corresponding marker.
- WYSIWYG prose editing: changes round-trip through `markdown-it` ↔ `turndown` and persist to the source file. Cursor and scroll position are preserved across edits.
- Strict CSP; bundled with esbuild; no telemetry.

### Known limitations

- Comments cannot span block boundaries (selections crossing paragraphs are refused).
- Prose edits use a full-document round-trip, which canonicalizes idiosyncratic markdown formatting (e.g., reference-style links).
- No threaded replies, author/timestamp metadata, or marketplace listing yet.
