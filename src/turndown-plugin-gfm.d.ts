// turndown-plugin-gfm ships no type declarations. Minimal ambient types for
// the plugin functions we use. Each is a turndown `Plugin` (TurndownService
// has its own Plugin type in @types/turndown).
declare module 'turndown-plugin-gfm' {
  import type { Plugin } from 'turndown';
  export const gfm: Plugin;
  export const tables: Plugin;
  export const strikethrough: Plugin;
  export const taskListItems: Plugin;
  export const highlightedCodeBlock: Plugin;
}
