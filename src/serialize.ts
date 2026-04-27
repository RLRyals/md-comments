import TurndownService from 'turndown';
import { buildMarkerPair, buildPointMarker } from './markers';

let cached: TurndownService | null = null;

export function getTurndown(): TurndownService {
  if (cached) return cached;
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined'
  });

  // Preserve comment highlights: emit paired markers around the inner markdown.
  td.addRule('mdcHighlight', {
    filter: (node): node is HTMLElement =>
      node.nodeType === 1 &&
      node.nodeName === 'MARK' &&
      (node as HTMLElement).classList.contains('mdc-highlight'),
    replacement: (content, node) => {
      const el = node as HTMLElement;
      const id = el.getAttribute('data-id') ?? '';
      const comment = el.getAttribute('data-comment') ?? '';
      const { start, end } = buildMarkerPair(id, comment);
      return `${start}${content}${end}`;
    }
  });

  // Point comment: replace the whole pin span with the mdc:point marker.
  td.addRule('mdcPin', {
    filter: (node): node is HTMLElement =>
      node.nodeType === 1 &&
      node.nodeName === 'SPAN' &&
      (node as HTMLElement).classList.contains('mdc-pin'),
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const id = el.getAttribute('data-id') ?? '';
      const comment = el.getAttribute('data-comment') ?? '';
      return buildPointMarker(id, comment);
    }
  });

  // Keep <br> as a hard line break in markdown.
  td.addRule('hardBreak', {
    filter: 'br',
    replacement: () => '  \n'
  });

  cached = td;
  return cached;
}

/**
 * Convert a single block's HTML (e.g. one rendered <p>, <h2>, <ul>) back to
 * its markdown source. The HTML must be a fragment representing one top-level
 * block; turndown will serialize it.
 */
export function serializeBlock(html: string): string {
  return getTurndown().turndown(html);
}
