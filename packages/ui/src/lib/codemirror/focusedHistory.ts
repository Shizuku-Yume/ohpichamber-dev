import { undo, redo } from '@codemirror/commands';
import { Prec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

export const focusedHistory = Prec.highest(EditorView.domEventHandlers({
  beforeinput(event, view) {
    const command = event.inputType === 'historyUndo' ? undo : event.inputType === 'historyRedo' ? redo : null;
    if (!command || view.hasFocus) return false;

    // Native history can target a previously edited contenteditable.
    event.preventDefault();
    const activeElement = view.dom.ownerDocument.activeElement;
    const focused = activeElement instanceof HTMLElement ? EditorView.findFromDOM(activeElement) : null;
    if (focused?.hasFocus && focused.contentDOM.contains(activeElement) && focused.state.facet(EditorView.editable)) {
      command(focused);
    }
    return true;
  },
}));
