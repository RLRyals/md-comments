# Changelog

## v0.1.4 — 2026-07-03

- **Fix**: commenting a whole paragraph (or its first word) no longer duplicates paragraphs in the raw file. When a comment marker landed at the *start* of a block, markdown-it parsed the entire paragraph as a raw `html_block` instead of a paragraph — so that block lost its `data-block-index`, dropped out of the line-range map, and shifted every following block's index. Subsequent comments then targeted the wrong source lines, writing a commented copy next to the original ("the same thing twice") and losing the highlight from the pretty view. Added a block-rule guard so marker-led lines stay paragraphs, keeping block indices aligned and the `<mark>` rendered.
- Added a regression test covering whole-paragraph comments preserving block indices and the highlight.

## v0.1.3 — 2026-06-11

- **Fix**: saving from the pretty view no longer flattens GFM pipe tables or rewrites `*italic*` to `_italic_` ([#1](https://github.com/RLRyals/md-comments/issues/1)). `turndown` has no built-in `<table>` rule and defaulted `emDelimiter` to `_`; added `turndown-plugin-gfm` and set `emDelimiter` to `*`. Table-cell alignment (`:---` / `:-:` / `---:`) now survives the HTML round-trip via an `align` attribute mirrored from markdown-it's alignment styles.
- Added regression tests (`npm test`) covering table round-trips, aligned separators, asterisk emphasis, and comments inside table cells.

## v0.1.2 — 2026-04-29

- **Fix**: document area rendered blank on open. The provider seeded its "last pushed HTML" cache with the initial render, so the first `setHtml` push to the webview was suppressed by the equality guard and the article was never populated.

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
