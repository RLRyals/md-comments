import { test } from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import { createMd, render } from './render';
import { serializeBlock } from './serialize';

const md: MarkdownIt = createMd();

/** Render markdown -> HTML, then serialize the HTML back to markdown. */
function roundTrip(source: string): string {
  const { html } = render(md, source);
  return serializeBlock(html).trim();
}

test('GFM table survives round-trip with identical row/column counts', () => {
  const source = [
    '| Name  | Role    | Active |',
    '| ----- | ------- | ------ |',
    '| Alice | Author  | yes    |',
    '| Bob   | Editor  | no     |'
  ].join('\n');

  const out = roundTrip(source);

  // Still a pipe table, not flattened to one-cell-per-line paragraphs.
  const rows = out.split('\n').filter((l) => l.trim().startsWith('|'));
  assert.ok(rows.length >= 4, `expected >=4 pipe rows, got:\n${out}`);

  // Header separator row preserved.
  assert.match(out, /\|\s*-+\s*\|/, `expected a |---| separator row in:\n${out}`);

  // Every original cell value survives.
  for (const cell of ['Name', 'Role', 'Active', 'Alice', 'Author', 'Bob', 'Editor']) {
    assert.match(out, new RegExp(cell), `cell "${cell}" lost in:\n${out}`);
  }

  // Same number of columns: each data row has 3 cells (4 pipes).
  for (const row of rows.slice(2)) {
    const pipeCount = (row.match(/\|/g) ?? []).length;
    assert.equal(pipeCount, 4, `row "${row}" should have 4 pipes (3 columns)`);
  }
});

test('aligned table separator survives round-trip', () => {
  const source = [
    '| Left | Center | Right |',
    '| :--- | :----: | ----: |',
    '| a    | b      | c     |'
  ].join('\n');

  const out = roundTrip(source);
  const rows = out.split('\n').filter((l) => l.trim().startsWith('|'));
  assert.ok(rows.length >= 3, `expected >=3 pipe rows, got:\n${out}`);
  // Alignment colons preserved in the separator row: left/center/right.
  const sep = rows[1];
  assert.match(sep, /:-+\s*\|/, `expected left-align ':---' in separator:\n${out}`);
  assert.match(sep, /:-+:/, `expected center-align ':-:' in separator:\n${out}`);
  assert.match(sep, /-+:\s*\|?/, `expected right-align '---:' in separator:\n${out}`);
});

test('*asterisk* italics delimiter is preserved (not rewritten to _)', () => {
  const source = 'This has *emphasized* text.';
  const out = roundTrip(source);
  assert.match(out, /\*emphasized\*/, `expected *asterisk* emphasis in:\n${out}`);
  assert.doesNotMatch(out, /_emphasized_/, `should not rewrite to underscores in:\n${out}`);
});

test('a comment covering a whole paragraph stays a block with its <mark> intact', () => {
  // Regression: when a paragraph begins with an mdc:start marker (commenting the
  // whole paragraph or its first word), markdown-it used to parse the line as a
  // raw html_block, dropping its data-block-index and shifting every following
  // block index — which made later block edits target the wrong lines and
  // duplicate paragraphs. The marker-led line must stay a paragraph.
  const source = [
    '<!-- mdc:start id="p1" -->First paragraph.<!-- mdc:end id="p1" comment="a" -->',
    '',
    'Second paragraph.',
    '',
    'Third paragraph.'
  ].join('\n');

  const { html, blockLineRanges } = render(md, source);

  // All three paragraphs are still indexable top-level blocks.
  assert.equal(blockLineRanges.length, 3, `expected 3 block ranges, got ${JSON.stringify(blockLineRanges)}`);
  assert.deepEqual(blockLineRanges, [[0, 1], [2, 3], [4, 5]]);

  // Indices are contiguous 0,1,2 and the first block is a real <p> with the <mark>.
  assert.match(html, /<p data-block-index="0"><mark class="mdc-highlight" data-id="p1"/,
    `first paragraph should render as a <p> containing the highlight, got:\n${html}`);
  assert.match(html, /data-block-index="1"[^>]*>Second paragraph\./);
  assert.match(html, /data-block-index="2"[^>]*>Third paragraph\./);
});

test('comment inserted into a table cell leaves the table intact', () => {
  // A comment is stored as paired mdc markers wrapping the cell text.
  const source = [
    '| Name  | Role   |',
    '| ----- | ------ |',
    '| <!-- mdc:start id="abc123" -->Alice<!-- mdc:end id="abc123" comment="check this" --> | Author |',
    '| Bob   | Editor |'
  ].join('\n');

  const out = roundTrip(source);

  // Table structure intact.
  const rows = out.split('\n').filter((l) => l.trim().startsWith('|'));
  assert.ok(rows.length >= 4, `expected >=4 pipe rows, got:\n${out}`);
  assert.match(out, /\|\s*-+\s*\|/, `expected separator row in:\n${out}`);

  // The comment markers survive, wrapping the target cell text.
  assert.match(out, /mdc:start id="abc123"/, `start marker lost in:\n${out}`);
  assert.match(out, /mdc:end id="abc123" comment="check this"/, `end marker lost in:\n${out}`);
  assert.match(out, /Alice/, `cell text lost in:\n${out}`);
});
