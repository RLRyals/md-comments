import * as vscode from 'vscode';
import { MdCommentsEditorProvider } from './editorProvider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new MdCommentsEditorProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      MdCommentsEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdComments.open', async (uri?: vscode.Uri) => {
      const target =
        uri ??
        vscode.window.activeTextEditor?.document.uri ??
        (await pickMarkdownFile());
      if (!target) return;
      await vscode.commands.executeCommand(
        'vscode.openWith',
        target,
        MdCommentsEditorProvider.viewType
      );
    })
  );
}

export function deactivate(): void {}

async function pickMarkdownFile(): Promise<vscode.Uri | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { Markdown: ['md', 'markdown'] }
  });
  return picked?.[0];
}
