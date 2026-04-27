# MD Comments — Sample

This is a sample file for testing the **MD Comments** extension.

## How to use

1. Right-click this file → **Open With…** → **MD Comments (Pretty View)**.
2. Select any phrase below and click the 💬 button to add a comment.
3. Click an existing highlight to edit or delete its comment.

## Try it on this paragraph

The quick brown fox jumps over the lazy dog. This sentence contains every letter of the English alphabet, which is why typesetters have used it for centuries to test fonts.

## Pre-existing highlight comment

Here is a sentence with <!-- mdc:start id="demo0001" -->a pre-existing highlight<!-- mdc:end id="demo0001" comment="This comment was hand-authored to demonstrate the on-disk format." --> already in the source — open this file in the pretty view and you should see it as a yellow span you can click.

## Pre-existing point comment

This paragraph has a margin pin at the end of the sentence.<!-- mdc:point id="demo0002" comment="Point comments anchor to a caret position with no surrounding text. Tab to the 💬 to edit." --> Open the pretty view and you should see a 💬 you can click or Tab to.

## Lists work too

- Markdown lists render normally.
- You can comment on **single list items** but not on selections that cross items.
- Inline `code` is preserved.

## And blockquotes

> Editing inside a blockquote should work in the pretty view; the round-trip back to markdown will keep the `>` prefix.

That's it — happy commenting.
