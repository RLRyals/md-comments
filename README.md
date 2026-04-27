# MD Comments

A VS Code extension that opens a markdown file in a pretty rendered view, lets you highlight text or drop pins to attach comments, and saves the comments as plain HTML markers inside the `.md` file itself.

## Install

1. Go to the [latest release](https://github.com/RLRyals/md-comments/releases/latest) and download the `md-comments-*.vsix` asset.
2. In VS Code, open the **Extensions** view, click the **⋯** menu in the top-right, and pick **Install from VSIX…** — then choose the file you downloaded.
3. Or from the command line: `code --install-extension md-comments-0.1.0.vsix`

To use it, right-click any `.md` file → **Open With…** → **MD Comments (Pretty View)**. The built-in markdown editor stays as the default; this one is opt-in.

## What it does

- **Highlight text and add a comment** via a custom in-webview popup (not the QuickInput bar).
- **Or drop a point comment** at the caret with no selection — renders as a clickable 💬 pin.
- **Persist comments inside the `.md` file** as plain HTML markers (`<!-- mdc:start … -->…<!-- mdc:end … -->` for highlights, `<!-- mdc:point … -->` for pins).
- **Edit prose directly in the pretty view** (WYSIWYG).
- **Edit or delete any comment** by clicking its highlight/pin to reopen the popup.
- **Comments sidebar** lists every comment in document order — click to scroll/flash the corresponding marker.

## Two kinds of comment

| Kind | Anchored to | On-disk |
|---|---|---|
| **Highlight** | a span of selected text | paired `<!-- mdc:start id -->…<!-- mdc:end id comment -->` wrapping the text |
| **Point** | a caret position (no selection) | a single `<!-- mdc:point id comment -->` placed at that spot, rendered as a 💬 pin |

```md
The quick brown <!-- mdc:start id="a1b2c3d4" -->fox<!-- mdc:end id="a1b2c3d4" comment="check this animal" --> jumps.

This sentence has a margin note.<!-- mdc:point id="9e8d7c6b" comment="follow up on this" -->
```

- `id` — random 8-char hex, used to pair start/end and to identify points for edit/delete
- `comment` — HTML-attribute-encoded (`&quot;`, `&amp;`, `&#10;` for newlines)
- An unpaired `mdc:start` or `mdc:end` is rendered as plain text and ignored — your file is never silently mangled

## Running locally

```bash
npm install
npm run build       # one-shot build → dist/
npm run watch       # rebuild on change
```

Then press <kbd>F5</kbd> in VS Code (with this folder open) to launch the **Extension Development Host**. In that new window, right-click any `.md` file → **Open With…** → **MD Comments (Pretty View)**.

The extension does **not** override your default markdown editor — it appears as an option you opt into.

## Mouse and keyboard reference

Every mouse interaction has a keyboard equivalent.

| Action | Mouse | Keyboard |
|---|---|---|
| **Highlight** comment on the current selection | Select text → click 💬 toolbar button, or right-click → **Comment on Selection** | Select text → <kbd>Ctrl/Cmd</kbd>+<kbd>Alt</kbd>+<kbd>M</kbd> |
| **Point** comment at the caret (no selection) | Right-click → **Insert Comment Here** | Place caret → <kbd>Ctrl/Cmd</kbd>+<kbd>Alt</kbd>+<kbd>M</kbd> |
| Open the action menu | Right-click anywhere | <kbd>Shift</kbd>+<kbd>F10</kbd> or the <kbd>Menu</kbd> key |
| Choose a menu item | Click | <kbd>↑</kbd>/<kbd>↓</kbd> to navigate, <kbd>Enter</kbd> to activate, <kbd>Esc</kbd> to dismiss |
| Open a comment to edit/delete | Click the yellow highlight or 💬 pin | <kbd>Tab</kbd> to it (or right-click → **Edit Comment**), then <kbd>Enter</kbd> or <kbd>Space</kbd> |
| Save the popup | Click **Save** | <kbd>Ctrl/Cmd</kbd>+<kbd>Enter</kbd> |
| Cancel the popup | Click **Cancel** or outside | <kbd>Esc</kbd> |
| Cycle popup buttons | — | <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> |
| Delete an existing comment | Click → **Delete** in popup, **or** right-click → **Delete Comment** | <kbd>Tab</kbd> in the popup to **Delete**, <kbd>Enter</kbd> |

The right-click / <kbd>Shift</kbd>+<kbd>F10</kbd> menu adapts to context:
- **Edit Comment** / **Delete Comment** — when invoked on a highlight or pin
- **Comment on Selection** — when there's a non-empty in-block selection
- **Insert Comment Here** — when the caret is in a paragraph (always offered for caret insertion)

<kbd>Ctrl/Cmd</kbd>+<kbd>Alt</kbd>+<kbd>M</kbd> picks the right kind automatically: if you have a selection it makes a highlight, otherwise it drops a pin at the caret.

Highlights and pins are both exposed as `role="button"` with `aria-label="Comment: …"` so screen readers announce them and the keyboard can <kbd>Tab</kbd> through every comment in the file.

## Architecture (1-minute tour)

```
src/
  extension.ts        activate(): register custom editor + open command
  editorProvider.ts   CustomTextEditorProvider — owns the document↔webview sync
  render.ts           markdown-it instance with custom inline rule for mdc markers
                      → tags every top-level block with data-block-index
  serialize.ts        turndown instance with custom rule for <mark.mdc-highlight>
                      → emits the marker pair around the inner markdown
  markers.ts          parse / replace / strip mdc:start mdc:end pairs in source
  types.ts            FromWebview / ToWebview message unions

webview/
  main.ts             selection toolbar, popup, contenteditable, postMessage glue
  style.css           pretty view + highlight + popup styles (uses VS Code theme vars)
```

### Edit flow

| User action | Webview sends | Extension does |
|---|---|---|
| Select text → 💬 → Save (highlight) | `addComment { id, blockIndex, blockHtml, comment }` | turndown the one block (block now contains a `<mark>`), replace its source line range |
| Caret → **Insert Comment Here** → Save (point) | `addComment { id, blockIndex, blockHtml, comment }` | same path — block now contains a `<span class="mdc-pin">` which turndown maps to `<!-- mdc:point ... -->` |
| Click comment → edit → Save | `editComment { id, comment }` | regex-replace just the `comment="…"` attribute on whichever marker (`mdc:end` or `mdc:point`) carries the id |
| Click comment → Delete | `deleteComment { id }` | strip the `mdc:point`, or strip both `mdc:start`/`mdc:end` keeping inner text |
| Type into pretty view (debounced 500 ms) | `proseEdit { html }` | turndown the full doc, replace the whole file (no-op if unchanged) |
| External edit to the `.md` file | — | re-render and push fresh HTML |

The block index for targeted edits comes from `markdown-it` token line ranges (`token.map`), captured at render time and stored in `RenderResult.blockLineRanges`.

## Verification

1. Open any `.md` via **Open With… → MD Comments**. The file should render as styled HTML.
2. Select a phrase → click 💬 → type "first note" → Save. A yellow highlight appears.
3. Switch to the regular text editor — the file now contains the marker pair.
4. Save (<kbd>Ctrl</kbd>+<kbd>S</kbd>), close, reopen in the pretty view — the highlight persists.
5. Click the highlight → popup shows "first note" → change to "edited" → Save. Source updates in place.
6. Click the highlight → Delete — markers removed, inner text stays.
7. Click into a paragraph and type. Switch back to source — text is updated.
8. With both views open, edit the source — pretty view re-renders.

## Out of scope (v1)

- Comments crossing block boundaries (selections that span paragraphs are refused)
- Threaded replies, author/timestamp metadata
- Comments-list sidebar
- Non-markdown file types

The `mdc:` prefix and id-based markers leave room to add a richer JSON payload format later without breaking the on-disk shape of existing comments.
