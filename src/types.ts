export type FromWebview =
  | { type: 'ready' }
  | {
      type: 'addComment';
      id: string;
      blockIndex: number;
      blockHtml: string;
      comment: string;
    }
  | { type: 'editComment'; id: string; comment: string }
  | { type: 'deleteComment'; id: string }
  | { type: 'proseEdit'; html: string };

export type CommentLayout = 'sidebar' | 'inline';

export type ToWebview =
  | { type: 'setHtml'; html: string; version: number }
  | { type: 'setLayout'; layout: CommentLayout }
  | { type: 'error'; message: string };
