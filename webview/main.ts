import './style.css';
import type { FromWebview, ToWebview } from '../src/types';

declare const acquireVsCodeApi: () => {
  postMessage(msg: FromWebview): void;
  setState(state: unknown): void;
  getState(): unknown;
};

const vscode = acquireVsCodeApi();

const root = document.getElementById('mdc-root') as HTMLElement;
const toolbar = document.getElementById('mdc-toolbar') as HTMLElement;
const addBtn = document.getElementById('mdc-add-comment') as HTMLButtonElement;
const popup = document.getElementById('mdc-popup') as HTMLElement;
const popupText = document.getElementById('mdc-popup-text') as HTMLTextAreaElement;
const popupSave = document.getElementById('mdc-popup-save') as HTMLButtonElement;
const popupCancel = document.getElementById('mdc-popup-cancel') as HTMLButtonElement;
const popupDelete = document.getElementById('mdc-popup-delete') as HTMLButtonElement;
const menu = document.getElementById('mdc-menu') as HTMLElement;
const sidebarList = document.getElementById('mdc-sidebar-list') as HTMLElement;
const sidebarCount = document.getElementById('mdc-sidebar-count') as HTMLElement;
const sidebarEmpty = document.getElementById('mdc-sidebar-empty') as HTMLElement;

const COMMENT_NODE_SELECTOR = 'mark.mdc-highlight, span.mdc-pin';

type PopupMode =
  | { kind: 'newHighlight'; range: Range }
  | { kind: 'newPoint'; range: Range }
  | { kind: 'edit'; node: HTMLElement };

let popupMode: PopupMode | null = null;
let savedSelectionRange: Range | null = null;
let preMenuFocus: HTMLElement | null = null;

// ── messaging ──────────────────────────────────────────────────────────────
function send(msg: FromWebview): void {
  vscode.postMessage(msg);
}

window.addEventListener('message', (e) => {
  const msg = e.data as ToWebview;
  if (msg.type === 'setHtml') {
    if (root.innerHTML === msg.html) return;
    const scrollY = window.scrollY;
    root.innerHTML = msg.html;
    bindCommentNodes();
    refreshSidebar();
    // Restore scroll so external edits don't yank the user to the top.
    window.scrollTo({ top: scrollY });
  } else if (msg.type === 'error') {
    console.error('[md-comments] extension error:', msg.message);
  }
});

send({ type: 'ready' });

// ── selection toolbar (only on non-empty selection) ────────────────────────
document.addEventListener('selectionchange', () => {
  if (!popup.hidden || !menu.hidden) return;
  updateToolbar();
});

function updateToolbar(): void {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    toolbar.hidden = true;
    return;
  }
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) {
    toolbar.hidden = true;
    return;
  }
  if (rangeCrossesBlocks(range)) {
    toolbar.hidden = true;
    return;
  }
  const rect = range.getBoundingClientRect();
  toolbar.style.top = `${window.scrollY + rect.top - 36}px`;
  toolbar.style.left = `${window.scrollX + rect.left}px`;
  toolbar.hidden = false;
}

addBtn.addEventListener('mousedown', (e) => e.preventDefault());
addBtn.addEventListener('click', () => insertHighlightFromSelection());

// ── click / keyboard activation on existing highlights AND pins ────────────
function bindCommentNodes(): void {
  const nodes = root.querySelectorAll<HTMLElement>(COMMENT_NODE_SELECTOR);
  nodes.forEach((n) => {
    n.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openEditPopup(n);
    });
    n.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        openEditPopup(n);
      }
    });
  });
  refreshSidebar();
}

function openEditPopup(node: HTMLElement): void {
  popupMode = { kind: 'edit', node };
  const comment = node.getAttribute('data-comment') ?? '';
  openPopup(comment, node.getBoundingClientRect(), true);
}

function insertHighlightFromSelection(): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0).cloneRange();
  if (!root.contains(range.commonAncestorContainer)) return;
  if (rangeCrossesBlocks(range)) return;
  popupMode = { kind: 'newHighlight', range };
  savedSelectionRange = range.cloneRange();
  toolbar.hidden = true;
  openPopup('', range.getBoundingClientRect(), false);
}

function insertPointAtCaret(): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0).cloneRange();
  if (!root.contains(range.commonAncestorContainer)) return;
  // Collapse to start so we insert at one definite caret position.
  range.collapse(true);
  if (!findBlockAncestor(range.startContainer)) return;
  popupMode = { kind: 'newPoint', range };
  savedSelectionRange = range.cloneRange();
  toolbar.hidden = true;
  openPopup('', caretRect(range), false);
}

function caretRect(range: Range): DOMRect {
  const r = range.getBoundingClientRect();
  if (r.width || r.height) return r;
  // Collapsed range can give a 0-size rect at the caret X/Y on most browsers.
  // If empty, fall back to the parent element's rect.
  const node = range.startContainer;
  const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
  return el ? el.getBoundingClientRect() : new DOMRect(0, 0, 0, 0);
}

// ── popup ─────────────────────────────────────────────────────────────────
function openPopup(initial: string, anchor: DOMRect, showDelete: boolean): void {
  closeMenu();
  popupText.value = initial;
  popupDelete.hidden = !showDelete;
  popup.hidden = false;
  positionFloater(popup, anchor);
  popupText.focus();
  popupText.select();
}

function positionFloater(el: HTMLElement, anchor: DOMRect): void {
  const top = window.scrollY + anchor.bottom + 6;
  let left = window.scrollX + anchor.left;
  const rect = el.getBoundingClientRect();
  const width = rect.width || 320;
  const maxLeft = window.scrollX + window.innerWidth - width - 8;
  if (left > maxLeft) left = maxLeft;
  if (left < window.scrollX + 8) left = window.scrollX + 8;
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
}

function closePopup(): void {
  popup.hidden = true;
  popupMode = null;
  savedSelectionRange = null;
}

popupCancel.addEventListener('click', closePopup);

popup.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    closePopup();
    return;
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    popupSave.click();
    return;
  }
  if (e.key === 'Tab') {
    const focusables = popupFocusables();
    if (focusables.length === 0) return;
    const i = focusables.indexOf(document.activeElement as HTMLElement);
    if (i === -1) return;
    e.preventDefault();
    const next = e.shiftKey
      ? focusables[(i - 1 + focusables.length) % focusables.length]
      : focusables[(i + 1) % focusables.length];
    next.focus();
  }
});

function popupFocusables(): HTMLElement[] {
  const list: HTMLElement[] = [popupText, popupCancel, popupSave];
  if (!popupDelete.hidden) list.splice(1, 0, popupDelete);
  return list.filter((el) => !el.hasAttribute('disabled'));
}

document.addEventListener('mousedown', (e) => {
  if (!popup.hidden && !popup.contains(e.target as Node)) closePopup();
  if (!menu.hidden && !menu.contains(e.target as Node)) closeMenu();
});

popupSave.addEventListener('click', () => {
  if (!popupMode) {
    closePopup();
    return;
  }
  const text = popupText.value;

  if (popupMode.kind === 'edit') {
    const id = popupMode.node.getAttribute('data-id') ?? '';
    popupMode.node.setAttribute('data-comment', text);
    send({ type: 'editComment', id, comment: text });
    refreshSidebar();
    closePopup();
    return;
  }

  const range = savedSelectionRange ?? popupMode.range;
  if (!range) {
    closePopup();
    return;
  }

  if (popupMode.kind === 'newHighlight') {
    if (rangeCrossesBlocks(range)) {
      closePopup();
      return;
    }
    const id = randomId();
    const mark = document.createElement('mark');
    mark.className = 'mdc-highlight';
    mark.setAttribute('data-id', id);
    mark.setAttribute('data-comment', text);
    mark.setAttribute('tabindex', '0');
    mark.setAttribute('role', 'button');
    try {
      range.surroundContents(mark);
    } catch {
      const frag = range.extractContents();
      mark.appendChild(frag);
      range.insertNode(mark);
    }
    bindCommentNodes();
    sendBlockEdit(mark, id, text);
    closePopup();
    return;
  }

  // newPoint
  const id = randomId();
  const pin = document.createElement('span');
  pin.className = 'mdc-pin';
  pin.setAttribute('data-id', id);
  pin.setAttribute('data-comment', text);
  pin.setAttribute('tabindex', '0');
  pin.setAttribute('role', 'button');
  const glyph = document.createElement('span');
  glyph.className = 'mdc-pin-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = '💬';
  pin.appendChild(glyph);
  range.insertNode(pin);
  bindCommentNodes();
  sendBlockEdit(pin, id, text);
  closePopup();
});

function sendBlockEdit(node: HTMLElement, id: string, comment: string): void {
  const block = findBlockAncestor(node);
  if (!block) return;
  const blockIndex = parseInt(block.getAttribute('data-block-index') ?? '-1', 10);
  if (blockIndex < 0) return;
  send({
    type: 'addComment',
    id,
    blockIndex,
    blockHtml: block.outerHTML,
    comment
  });
}

popupDelete.addEventListener('click', () => {
  if (!popupMode || popupMode.kind !== 'edit') return;
  deleteCommentNode(popupMode.node);
  closePopup();
});

function deleteCommentNode(node: HTMLElement): void {
  const id = node.getAttribute('data-id') ?? '';
  if (node.matches('mark.mdc-highlight')) {
    // unwrap — preserve inner text
    const parent = node.parentNode;
    if (parent) {
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      parent.removeChild(node);
    }
  } else {
    // pin — remove entirely
    node.parentNode?.removeChild(node);
  }
  send({ type: 'deleteComment', id });
  refreshSidebar();
}

// ── context menu ──────────────────────────────────────────────────────────
interface MenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
  danger?: boolean;
}

function buildMenuItems(targetNode: HTMLElement | null): MenuItem[] {
  const sel = window.getSelection();
  const hasNonEmptyValidSelection =
    !!sel &&
    !sel.isCollapsed &&
    sel.rangeCount > 0 &&
    root.contains(sel.getRangeAt(0).commonAncestorContainer) &&
    !rangeCrossesBlocks(sel.getRangeAt(0));

  const caretInDoc =
    !!sel &&
    sel.rangeCount > 0 &&
    root.contains(sel.getRangeAt(0).startContainer) &&
    !!findBlockAncestor(sel.getRangeAt(0).startContainer);

  const items: MenuItem[] = [];

  if (targetNode) {
    items.push({
      label: 'Edit Comment',
      action: () => openEditPopup(targetNode)
    });
    items.push({
      label: 'Delete Comment',
      danger: true,
      action: () => deleteCommentNode(targetNode)
    });
  }

  if (hasNonEmptyValidSelection) {
    items.push({
      label: 'Comment on Selection',
      action: () => insertHighlightFromSelection()
    });
  }
  // Always offer Insert when caret is in doc — even alongside Edit/Delete on a hit node.
  if (caretInDoc) {
    items.push({
      label: 'Insert Comment Here',
      disabled: !caretInDoc,
      action: () => insertPointAtCaret()
    });
  }
  return items;
}

function openMenu(items: MenuItem[], anchor: DOMRect): void {
  if (items.length === 0) return;
  closePopup();
  preMenuFocus = (document.activeElement as HTMLElement) ?? null;
  menu.innerHTML = '';
  items.forEach((it) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mdc-menu-item' + (it.danger ? ' mdc-danger' : '');
    btn.setAttribute('role', 'menuitem');
    btn.tabIndex = -1;
    btn.textContent = it.label;
    if (it.disabled) {
      btn.setAttribute('aria-disabled', 'true');
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => {
        closeMenu();
        it.action();
      });
    }
    menu.appendChild(btn);
  });
  menu.hidden = false;
  positionFloater(menu, anchor);
  const firstEnabled = menu.querySelector<HTMLButtonElement>('button:not([disabled])');
  firstEnabled?.focus();
}

function closeMenu(): void {
  if (menu.hidden) return;
  menu.hidden = true;
  menu.innerHTML = '';
  if (preMenuFocus && document.contains(preMenuFocus)) {
    preMenuFocus.focus();
  }
  preMenuFocus = null;
}

menu.addEventListener('keydown', (e) => {
  const buttons = Array.from(
    menu.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
  );
  if (buttons.length === 0) return;
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    buttons[(i + 1 + buttons.length) % buttons.length].focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    buttons[(i - 1 + buttons.length) % buttons.length].focus();
  } else if (e.key === 'Home') {
    e.preventDefault();
    buttons[0].focus();
  } else if (e.key === 'End') {
    e.preventDefault();
    buttons[buttons.length - 1].focus();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeMenu();
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    (document.activeElement as HTMLButtonElement | null)?.click();
  }
});

root.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const targetNode = closestCommentNode(e.target as Node | null);
  const items = buildMenuItems(targetNode);
  openMenu(items, new DOMRect(e.clientX, e.clientY, 0, 0));
});

// ── global keyboard shortcuts ─────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + Alt + M:
  //   - non-empty selection → highlight comment
  //   - collapsed caret → point comment
  if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'm' || e.key === 'M')) {
    if (!popup.hidden || !menu.hidden) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    if (!root.contains(sel.getRangeAt(0).commonAncestorContainer)) return;
    e.preventDefault();
    if (sel.isCollapsed) insertPointAtCaret();
    else insertHighlightFromSelection();
    return;
  }

  // Shift+F10 / ContextMenu key → open context menu
  if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
    if (!popup.hidden) return;
    const anchor = caretOrFocusRect();
    if (!anchor) return;
    e.preventDefault();
    const focused = document.activeElement;
    const targetNode =
      focused instanceof HTMLElement && focused.matches(COMMENT_NODE_SELECTOR)
        ? focused
        : closestCommentNode(focused as Node | null);
    openMenu(buildMenuItems(targetNode), anchor);
  }
});

function caretOrFocusRect(): DOMRect | null {
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && root.contains(focused) && focused !== root) {
    return focused.getBoundingClientRect();
  }
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && root.contains(sel.anchorNode)) {
    const r = sel.getRangeAt(0).getBoundingClientRect();
    if (r.width || r.height) return r;
    const node = sel.anchorNode;
    if (node && node.parentElement) {
      return node.parentElement.getBoundingClientRect();
    }
  }
  return root.getBoundingClientRect();
}

// ── prose editing (debounced) ─────────────────────────────────────────────
let inputTimer: number | undefined;
root.addEventListener('input', () => {
  if (inputTimer !== undefined) window.clearTimeout(inputTimer);
  inputTimer = window.setTimeout(flushProseEdit, 500);
});

function flushProseEdit(): void {
  send({ type: 'proseEdit', html: root.innerHTML });
}

// ── helpers ───────────────────────────────────────────────────────────────
function closestCommentNode(node: Node | null): HTMLElement | null {
  let n: Node | null = node;
  while (n && n !== root) {
    if (n.nodeType === 1) {
      const el = n as HTMLElement;
      if (el.matches(COMMENT_NODE_SELECTOR)) return el;
    }
    n = n.parentNode;
  }
  return null;
}

function findBlockAncestor(node: Node | null): HTMLElement | null {
  let n: Node | null = node;
  while (n && n !== root) {
    if (n.nodeType === 1) {
      const el = n as HTMLElement;
      if (el.hasAttribute('data-block-index')) return el;
    }
    n = n.parentNode;
  }
  return null;
}

function rangeCrossesBlocks(range: Range): boolean {
  const a = findBlockAncestor(range.startContainer);
  const b = findBlockAncestor(range.endContainer);
  return a !== b || a === null;
}

function randomId(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

// ── comments sidebar ──────────────────────────────────────────────────────
function refreshSidebar(): void {
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>(COMMENT_NODE_SELECTOR)
  );
  sidebarCount.textContent = String(nodes.length);
  sidebarEmpty.hidden = nodes.length > 0;
  sidebarList.innerHTML = '';

  nodes.forEach((node, i) => {
    const id = node.getAttribute('data-id') ?? '';
    const comment = node.getAttribute('data-comment') ?? '';
    const isPin = node.matches('span.mdc-pin');
    const li = document.createElement('li');
    li.className = 'mdc-sidebar-item';
    li.dataset.id = id;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mdc-sidebar-card';

    const meta = document.createElement('div');
    meta.className = 'mdc-sidebar-meta';
    const num = document.createElement('span');
    num.className = 'mdc-sidebar-num';
    num.textContent = `#${i + 1}`;
    const kind = document.createElement('span');
    kind.className = 'mdc-sidebar-kind';
    kind.textContent = isPin ? '💬 point' : '🖍 highlight';
    meta.append(num, kind);

    const body = document.createElement('div');
    body.className = 'mdc-sidebar-body';
    body.textContent = comment || '(empty)';

    if (!isPin) {
      const snippet = document.createElement('div');
      snippet.className = 'mdc-sidebar-snippet';
      snippet.textContent = `“${(node.textContent ?? '').trim().slice(0, 80)}”`;
      btn.append(meta, snippet, body);
    } else {
      btn.append(meta, body);
    }

    btn.addEventListener('click', () => focusComment(node));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        focusComment(node);
      }
    });

    li.appendChild(btn);
    sidebarList.appendChild(li);
  });
}

function focusComment(node: HTMLElement): void {
  node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  // Brief visual emphasis so the user can spot it after scrolling.
  node.classList.add('mdc-flash');
  window.setTimeout(() => node.classList.remove('mdc-flash'), 900);
  node.focus();
}

refreshSidebar();
