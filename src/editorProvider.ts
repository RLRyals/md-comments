import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import { createMd, render, RenderResult } from './render';
import { serializeBlock } from './serialize';
import { replaceCommentInSource, stripMarkersInSource } from './markers';
import type { FromWebview, ToWebview } from './types';

export class MdCommentsEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'mdComments.editor';

  private md: MarkdownIt;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.md = createMd();
  }

  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')]
    };

    webviewPanel.webview.html = this.getHtmlShell(webviewPanel.webview);

    let lastRender: RenderResult = render(this.md, document.getText());
    /**
     * Content snapshots that this provider just produced via applyEdit.
     * When a change event arrives whose resulting document text is in this
     * set, we know we initiated it and skip re-pushing HTML to the webview
     * (which would clobber the user's cursor/scroll). Anything not in the
     * set is treated as an external edit and pushed.
     */
    const ourPendingContent = new Set<string>();
    // Sentinel: no HTML pushed yet, so the first pushHtml() always sends.
    // Initializing this to lastRender.html caused the webview to receive
    // nothing on 'ready', leaving the document area blank.
    let lastPushedHtml: string | null = null;

    const post = (msg: ToWebview): void => {
      void webviewPanel.webview.postMessage(msg);
    };

    const pushHtml = (): void => {
      lastRender = render(this.md, document.getText());
      if (lastRender.html === lastPushedHtml) return;
      lastPushedHtml = lastRender.html;
      post({ type: 'setHtml', html: lastRender.html, version: document.version });
    };

    const docSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      const text = document.getText();
      if (ourPendingContent.has(text)) {
        ourPendingContent.delete(text);
        // We already know the new content; refresh render state for next edit.
        lastRender = render(this.md, text);
        lastPushedHtml = lastRender.html;
        return;
      }
      pushHtml();
    });

    const trackEdit = (newContent: string): void => {
      ourPendingContent.add(newContent);
      // Garbage-collect: keep the set small to bound memory if a tracked
      // event never arrives (e.g. edit was rejected). 16 is plenty.
      if (ourPendingContent.size > 16) {
        const first = ourPendingContent.values().next().value;
        if (first !== undefined) ourPendingContent.delete(first);
      }
    };

    const msgSub = webviewPanel.webview.onDidReceiveMessage(async (msg: FromWebview) => {
      try {
        switch (msg.type) {
          case 'ready':
            pushHtml();
            return;
          case 'addComment':
            await this.applyBlockEdit(document, lastRender, msg.blockIndex, msg.blockHtml, trackEdit);
            lastRender = render(this.md, document.getText());
            return;
          case 'proseEdit':
            await this.applyFullDocEdit(document, msg.html, trackEdit);
            lastRender = render(this.md, document.getText());
            return;
          case 'editComment':
            await this.handleEditComment(document, msg.id, msg.comment, trackEdit);
            lastRender = render(this.md, document.getText());
            return;
          case 'deleteComment':
            await this.handleDeleteComment(document, msg.id, trackEdit);
            lastRender = render(this.md, document.getText());
            return;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        post({ type: 'error', message });
      }
    });

    webviewPanel.onDidDispose(() => {
      docSub.dispose();
      msgSub.dispose();
    });
  }

  private async applyBlockEdit(
    document: vscode.TextDocument,
    lastRender: RenderResult,
    blockIndex: number,
    blockHtml: string,
    trackEdit: (content: string) => void
  ): Promise<void> {
    const newMarkdown = serializeBlock(blockHtml).trim();
    const lr = lastRender.blockLineRanges[blockIndex];
    if (!lr) return;

    const [startLine, endLineExclusive] = lr;
    const lastLine = document.lineCount - 1;
    const isLastBlock = endLineExclusive > lastLine;

    const startPos = new vscode.Position(startLine, 0);
    const endPos = isLastBlock
      ? document.lineAt(lastLine).range.end
      : new vscode.Position(endLineExclusive, 0);

    const range = new vscode.Range(startPos, endPos);
    const replacement = isLastBlock ? newMarkdown : newMarkdown + '\n';

    if (document.getText(range) === replacement) return;

    const fullText = document.getText();
    const before = document.offsetAt(range.start);
    const after = document.offsetAt(range.end);
    const expectedContent =
      fullText.slice(0, before) + replacement + fullText.slice(after);
    trackEdit(expectedContent);

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, range, replacement);
    await vscode.workspace.applyEdit(edit);
  }

  private async applyFullDocEdit(
    document: vscode.TextDocument,
    html: string,
    trackEdit: (content: string) => void
  ): Promise<void> {
    const newMarkdown = serializeBlock(html).trim() + '\n';
    if (document.getText() === newMarkdown) return;
    trackEdit(newMarkdown);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, fullRange(document), newMarkdown);
    await vscode.workspace.applyEdit(edit);
  }

  private async handleEditComment(
    document: vscode.TextDocument,
    id: string,
    comment: string,
    trackEdit: (content: string) => void
  ): Promise<void> {
    const src = document.getText();
    const updated = replaceCommentInSource(src, id, comment);
    if (updated === null || updated === src) return;
    trackEdit(updated);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, fullRange(document), updated);
    await vscode.workspace.applyEdit(edit);
  }

  private async handleDeleteComment(
    document: vscode.TextDocument,
    id: string,
    trackEdit: (content: string) => void
  ): Promise<void> {
    const src = document.getText();
    const updated = stripMarkersInSource(src, id);
    if (updated === null || updated === src) return;
    trackEdit(updated);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, fullRange(document), updated);
    await vscode.workspace.applyEdit(edit);
  }

  private getHtmlShell(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.css')
    );
    const nonce = makeNonce();
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`
    ].join('; ');

    return /* html */ `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>MD Comments</title>
  </head>
  <body>
    <div id="mdc-toolbar" class="mdc-toolbar" hidden>
      <button id="mdc-add-comment" type="button">💬 Comment</button>
    </div>
    <div id="mdc-menu" class="mdc-menu" role="menu" hidden></div>
    <div id="mdc-popup" class="mdc-popup" hidden>
      <textarea id="mdc-popup-text" rows="4" placeholder="Add a comment…"></textarea>
      <div class="mdc-popup-actions">
        <button id="mdc-popup-delete" type="button" class="mdc-danger" hidden>Delete</button>
        <span class="mdc-spacer"></span>
        <button id="mdc-popup-cancel" type="button">Cancel</button>
        <button id="mdc-popup-save" type="button" class="mdc-primary">Save</button>
      </div>
    </div>
    <div id="mdc-layout" class="mdc-layout">
      <article id="mdc-root" class="mdc-root markdown-body" contenteditable="true"></article>
      <aside id="mdc-sidebar" class="mdc-sidebar" aria-label="Comments">
        <header class="mdc-sidebar-header">
          <span class="mdc-sidebar-title">Comments</span>
          <span id="mdc-sidebar-count" class="mdc-sidebar-count">0</span>
        </header>
        <ol id="mdc-sidebar-list" class="mdc-sidebar-list" aria-live="polite"></ol>
        <p id="mdc-sidebar-empty" class="mdc-sidebar-empty" hidden>No comments yet.</p>
      </aside>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

function fullRange(document: vscode.TextDocument): vscode.Range {
  const last = document.lineCount === 0 ? 0 : document.lineCount - 1;
  return new vscode.Range(new vscode.Position(0, 0), document.lineAt(last).range.end);
}

function makeNonce(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}
