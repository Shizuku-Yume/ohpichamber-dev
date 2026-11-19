import { undo, redo } from '@codemirror/commands';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

const runFocusedHistory = (document: Document, action: 'undo' | 'redo', event?: Event): void => {
  const activeElement = document.activeElement;
  const focused = activeElement instanceof HTMLElement ? EditorView.findFromDOM(activeElement) : null;
  if (!focused?.hasFocus || !focused.contentDOM.contains(activeElement)) return;
  event?.preventDefault();
  if (focused.state.facet(EditorView.editable) && !focused.state.facet(EditorState.readOnly)) {
    (action === 'undo' ? undo : redo)(focused);
  }
};

export const handleNativeHistoryMenu = (event: Event): void => {
  const action = (event as CustomEvent<unknown>).detail;
  if (action === 'undo' || action === 'redo') {
    runFocusedHistory(document, action, event);
  }
};

export const focusedHistory = Prec.highest(EditorView.domEventHandlers({
  beforeinput(event, view) {
    const command = event.inputType === 'historyUndo' ? undo : event.inputType === 'historyRedo' ? redo : null;
    if (!command || view.hasFocus) return false;

    // Native history can target a previously edited contenteditable.
    event.preventDefault();
    runFocusedHistory(view.dom.ownerDocument, event.inputType === 'historyUndo' ? 'undo' : 'redo');
    return true;
  },
}));
