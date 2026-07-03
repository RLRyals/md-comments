import MarkdownIt from 'markdown-it';
import { unescapeAttr } from './markers';

type MdToken = {
  type: string;
  nesting: number;
  attrs?: Array<[string, string]> | null;
  attrGet(name: string): string | null;
  attrSet(name: string, value: string): void;
  attrJoin(name: string, value: string): void;
  map?: [number, number] | null;
  children?: MdToken[] | null;
};

export interface RenderResult {
  html: string;
  /** Line range [start, end) in the source for each top-level block, by block index. */
  blockLineRanges: Array<[number, number]>;
}

const START_INLINE = /<!--\s*mdc:start\s+id="([^"]+)"\s*-->/;
const END_INLINE = /<!--\s*mdc:end\s+id="([^"]+)"(?:\s+comment="([^"]*)")?\s*-->/;
const POINT_INLINE = /<!--\s*mdc:point\s+id="([^"]+)"(?:\s+comment="([^"]*)")?\s*-->/;

/**
 * Build a markdown-it instance configured to:
 *  - allow raw HTML (so our comment markers survive)
 *  - parse our mdc:start / mdc:end inline markers into <mark> open/close tokens
 *  - tag every top-level block with data-block-index="N"
 */
export function createMd(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: false,
    breaks: false,
    typographer: false
  });

  // Block-level guard: when a block *begins* with one of our mdc markers (e.g. a
  // comment covers the whole paragraph or its first word), markdown-it's
  // `html_block` rule sees the leading `<!--` and swallows the entire paragraph
  // as a raw HTML block. That block then never gets a `data-block-index`, so it
  // drops out of `blockLineRanges` and shifts every following block's index —
  // which makes later block edits target the wrong source lines and duplicate
  // paragraphs. Bail out of `html_block` for marker-led lines so the paragraph
  // rule handles them and the inline `mdc_marker` rule can emit the <mark>.
  const blockRuler = md.block.ruler as unknown as {
    __rules__: Array<{ name: string; fn: (...a: unknown[]) => boolean }>;
    at(name: string, fn: (...a: unknown[]) => boolean): void;
  };
  const originalHtmlBlock = blockRuler.__rules__.find(
    (r) => r.name === 'html_block'
  )?.fn;
  if (originalHtmlBlock) {
    blockRuler.at('html_block', (...args: unknown[]) => {
      const state = args[0] as {
        src: string;
        bMarks: number[];
        eMarks: number[];
        tShift: number[];
      };
      const startLine = args[1] as number;
      const pos = state.bMarks[startLine] + state.tShift[startLine];
      const line = state.src.slice(pos, state.eMarks[startLine]);
      if (/^<!--\s*mdc:(start|end|point)\b/.test(line)) return false;
      return originalHtmlBlock(...args);
    });
  }

  // Inline rule: consume an mdc:start or mdc:end html-comment and emit a custom token.
  md.inline.ruler.before('html_inline', 'mdc_marker', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x3c /* < */) return false;
    const rest = state.src.slice(state.pos);
    if (!rest.startsWith('<!--')) return false;

    const startMatch = START_INLINE.exec(rest);
    if (startMatch && startMatch.index === 0) {
      if (!silent) {
        const tok = state.push('mdc_open', 'mark', 1);
        tok.attrSet('class', 'mdc-highlight');
        tok.attrSet('data-id', startMatch[1]);
        tok.markup = startMatch[0];
      }
      state.pos += startMatch[0].length;
      return true;
    }

    const pointMatch = POINT_INLINE.exec(rest);
    if (pointMatch && pointMatch.index === 0) {
      if (!silent) {
        const tok = state.push('mdc_point', '', 0);
        tok.attrSet('data-id', pointMatch[1]);
        tok.attrSet(
          'data-comment-raw',
          pointMatch[2] !== undefined ? pointMatch[2] : ''
        );
        tok.markup = pointMatch[0];
      }
      state.pos += pointMatch[0].length;
      return true;
    }

    const endMatch = END_INLINE.exec(rest);
    if (endMatch && endMatch.index === 0) {
      if (!silent) {
        const tok = state.push('mdc_close', 'mark', -1);
        tok.attrSet('data-id', endMatch[1]);
        // The comment text — propagated to the matching open token in a post pass.
        if (endMatch[2] !== undefined) {
          tok.attrSet('data-comment-raw', endMatch[2]);
        }
        tok.markup = endMatch[0];
      }
      state.pos += endMatch[0].length;
      return true;
    }

    return false;
  });

  // Renderers for the custom tokens.
  md.renderer.rules.mdc_open = (tokens, idx) => {
    const tok = tokens[idx];
    const cls = tok.attrGet('class') ?? 'mdc-highlight';
    const id = tok.attrGet('data-id') ?? '';
    const comment = tok.attrGet('data-comment') ?? '';
    const ariaLabel = comment
      ? `Comment: ${comment.replace(/\s+/g, ' ').slice(0, 120)}`
      : 'Comment';
    return (
      `<mark class="${cls}" data-id="${escapeHtml(id)}" data-comment="${escapeHtml(comment)}"` +
      ` tabindex="0" role="button" aria-label="${escapeHtml(ariaLabel)}">`
    );
  };
  md.renderer.rules.mdc_close = () => '</mark>';

  // markdown-it encodes table-cell alignment as `style="text-align:left"`.
  // turndown-plugin-gfm recovers alignment from an `align` attribute instead,
  // so mirror the style into `align` to keep `:---`/`:-:`/`---:` separators
  // through the HTML round-trip. The deprecated `align` attribute is also still
  // honored visually by browsers in the contenteditable view.
  const addAlignAttr = (token: MdToken): void => {
    const style = token.attrGet('style');
    if (!style) return;
    const m = /text-align:\s*(left|right|center)/.exec(style);
    if (m) token.attrSet('align', m[1]);
  };
  for (const name of ['th_open', 'td_open'] as const) {
    const base = md.renderer.rules[name];
    md.renderer.rules[name] = (tokens, idx, options, env, self) => {
      addAlignAttr(tokens[idx] as unknown as MdToken);
      return base
        ? base(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options);
    };
  }

  md.renderer.rules.mdc_point = (tokens, idx) => {
    const tok = tokens[idx];
    const id = tok.attrGet('data-id') ?? '';
    const raw = tok.attrGet('data-comment-raw') ?? '';
    const comment = unescapeAttr(raw);
    const ariaLabel = comment
      ? `Comment: ${comment.replace(/\s+/g, ' ').slice(0, 120)}`
      : 'Comment';
    return (
      `<span class="mdc-pin" data-id="${escapeHtml(id)}"` +
      ` data-comment="${escapeHtml(comment)}"` +
      ` tabindex="0" role="button" aria-label="${escapeHtml(ariaLabel)}">` +
      `<span class="mdc-pin-glyph" aria-hidden="true">💬</span>` +
      `</span>`
    );
  };

  return md;
}

/**
 * After tokenization, propagate `data-comment-raw` from each mdc_close token
 * back to the matching mdc_open token (so the rendered <mark> carries it).
 */
function pairCommentAttrs(tokens: MdToken[]): void {
  const walk = (toks: MdToken[]): void => {
    const stack: MdToken[] = [];
    for (const t of toks) {
      if (t.type === 'mdc_open') stack.push(t);
      else if (t.type === 'mdc_close') {
        const open = stack.pop();
        if (open) {
          const raw = t.attrGet('data-comment-raw');
          if (raw !== null && raw !== undefined) {
            open.attrSet('data-comment', unescapeAttr(raw));
          }
        }
      }
      if (t.children && t.children.length) walk(t.children);
    }
  };
  walk(tokens);
}

/**
 * Render markdown to HTML. Adds data-block-index="N" to each top-level block
 * element and records each block's source line range.
 */
export function render(md: MarkdownIt, source: string): RenderResult {
  const env = {};
  const tokens = md.parse(source, env);
  pairCommentAttrs(tokens);

  // Tag block-open tokens with their index, and collect line ranges.
  const blockLineRanges: Array<[number, number]> = [];
  let depth = 0;
  let blockIndex = 0;
  for (const tok of tokens) {
    if (tok.nesting === 1 && depth === 0) {
      tok.attrJoin('data-block-index', String(blockIndex));
      const map = tok.map ?? [0, 0];
      blockLineRanges.push([map[0], map[1]]);
      blockIndex++;
    }
    depth += tok.nesting;
  }

  const html = md.renderer.render(tokens, md.options, env);
  return { html, blockLineRanges };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
