import React from 'react';
import { FormDockModeContext } from './formsInChat';

export function useFormDockFold(docked: boolean): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
    const mode = React.useContext(FormDockModeContext);
    const [collapsed, setCollapsed] = React.useState(docked && mode === 'reading');
    const manual = React.useRef(false);
    const previousMode = React.useRef(mode);
    React.useLayoutEffect(() => {
        if (previousMode.current === mode) return;
        previousMode.current = mode;
        setCollapsed(docked && mode === 'reading' ? true : manual.current);
    }, [docked, mode]);
    const setFold = React.useCallback<React.Dispatch<React.SetStateAction<boolean>>>((next) => {
        setCollapsed((previous) => {
            const value = typeof next === 'function' ? next(previous) : next;
            if (!docked || mode === 'dock') manual.current = value;
            return value;
        });
    }, [docked, mode]);
    return [collapsed, setFold];
}
