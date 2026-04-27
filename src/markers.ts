export interface MarkerPair {
  id: string;
  comment: string;
  startIndex: number;
  startLength: number;
  endIndex: number;
  endLength: number;
  innerStart: number;
  innerEnd: number;
}

export interface PointMarker {
  id: string;
  comment: string;
  index: number;
  length: number;
}

export interface Orphan {
  kind: 'start' | 'end';
  id: string;
  index: number;
  length: number;
}

const START_RE = /<!--\s*mdc:start\s+id="([^"]+)"\s*-->/g;
const END_RE = /<!--\s*mdc:end\s+id="([^"]+)"(?:\s+comment="([^"]*)")?\s*-->/g;
const POINT_RE = /<!--\s*mdc:point\s+id="([^"]+)"(?:\s+comment="([^"]*)")?\s*-->/g;

export function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '&#10;');
}

export function unescapeAttr(s: string): string {
  return s
    .replace(/&#10;/g, '\n')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

export function newId(): string {
  let s = '';
  for (let i = 0; i < 8; i++) {
    s += Math.floor(Math.random() * 16).toString(16);
  }
  return s;
}

export function parseMarkers(md: string): {
  pairs: MarkerPair[];
  points: PointMarker[];
  orphans: Orphan[];
} {
  const starts = new Map<string, { index: number; length: number }>();
  const pairs: MarkerPair[] = [];
  const orphans: Orphan[] = [];
  const points: PointMarker[] = [];

  START_RE.lastIndex = 0;
  END_RE.lastIndex = 0;
  POINT_RE.lastIndex = 0;

  interface Hit {
    kind: 'start' | 'end';
    id: string;
    comment?: string;
    index: number;
    length: number;
  }
  const hits: Hit[] = [];

  let m: RegExpExecArray | null;
  while ((m = START_RE.exec(md)) !== null) {
    hits.push({ kind: 'start', id: m[1], index: m.index, length: m[0].length });
  }
  while ((m = END_RE.exec(md)) !== null) {
    hits.push({
      kind: 'end',
      id: m[1],
      comment: m[2] !== undefined ? unescapeAttr(m[2]) : '',
      index: m.index,
      length: m[0].length
    });
  }
  while ((m = POINT_RE.exec(md)) !== null) {
    points.push({
      id: m[1],
      comment: m[2] !== undefined ? unescapeAttr(m[2]) : '',
      index: m.index,
      length: m[0].length
    });
  }
  hits.sort((a, b) => a.index - b.index);

  for (const h of hits) {
    if (h.kind === 'start') {
      if (starts.has(h.id)) {
        orphans.push({ kind: 'start', id: h.id, index: h.index, length: h.length });
      } else {
        starts.set(h.id, { index: h.index, length: h.length });
      }
    } else {
      const open = starts.get(h.id);
      if (!open) {
        orphans.push({ kind: 'end', id: h.id, index: h.index, length: h.length });
      } else {
        starts.delete(h.id);
        pairs.push({
          id: h.id,
          comment: h.comment ?? '',
          startIndex: open.index,
          startLength: open.length,
          endIndex: h.index,
          endLength: h.length,
          innerStart: open.index + open.length,
          innerEnd: h.index
        });
      }
    }
  }

  for (const [id, open] of starts) {
    orphans.push({ kind: 'start', id, index: open.index, length: open.length });
  }

  return { pairs, points, orphans };
}

export function buildMarkerPair(id: string, comment: string): { start: string; end: string } {
  return {
    start: `<!-- mdc:start id="${id}" -->`,
    end: `<!-- mdc:end id="${id}" comment="${escapeAttr(comment)}" -->`
  };
}

export function buildPointMarker(id: string, comment: string): string {
  return `<!-- mdc:point id="${id}" comment="${escapeAttr(comment)}" -->`;
}

/**
 * Replace the comment attribute on whichever marker carries `id`
 * (mdc:end of a pair, OR mdc:point). Returns null if no match.
 */
export function replaceCommentInSource(
  src: string,
  id: string,
  newComment: string
): string | null {
  const pointRe = new RegExp(
    `<!--\\s*mdc:point\\s+id="${escapeRegex(id)}"(?:\\s+comment="[^"]*")?\\s*-->`
  );
  const pm = pointRe.exec(src);
  if (pm) {
    const repl = buildPointMarker(id, newComment);
    return src.slice(0, pm.index) + repl + src.slice(pm.index + pm[0].length);
  }

  const endRe = new RegExp(
    `<!--\\s*mdc:end\\s+id="${escapeRegex(id)}"(?:\\s+comment="[^"]*")?\\s*-->`
  );
  const em = endRe.exec(src);
  if (!em) return null;
  const repl = `<!-- mdc:end id="${id}" comment="${escapeAttr(newComment)}" -->`;
  return src.slice(0, em.index) + repl + src.slice(em.index + em[0].length);
}

/**
 * Remove the marker(s) for `id`:
 *   - mdc:point → strip the single marker
 *   - paired mdc:start/mdc:end → strip both, leave inner text
 * Returns null if nothing matched.
 */
export function stripMarkersInSource(src: string, id: string): string | null {
  const pointRe = new RegExp(
    `<!--\\s*mdc:point\\s+id="${escapeRegex(id)}"(?:\\s+comment="[^"]*")?\\s*-->`
  );
  const pm = pointRe.exec(src);
  if (pm) {
    return src.slice(0, pm.index) + src.slice(pm.index + pm[0].length);
  }

  const startRe = new RegExp(`<!--\\s*mdc:start\\s+id="${escapeRegex(id)}"\\s*-->`);
  const endRe = new RegExp(
    `<!--\\s*mdc:end\\s+id="${escapeRegex(id)}"(?:\\s+comment="[^"]*")?\\s*-->`
  );
  const sm = startRe.exec(src);
  if (!sm) return null;
  const afterStart = src.slice(0, sm.index) + src.slice(sm.index + sm[0].length);
  const em = endRe.exec(afterStart);
  if (!em) return null;
  return afterStart.slice(0, em.index) + afterStart.slice(em.index + em[0].length);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
