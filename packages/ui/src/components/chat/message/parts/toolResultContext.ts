import * as React from 'react';

import { isVSCodeRuntime } from '@/lib/desktop';

/** The row's own "Show the raw answer" switch, which the actions row of a tool result view ends with. */
export const RawToggleContext = React.createContext<React.ReactNode>(null);

/** Where a panel can open beside the chat: not on a phone or in VS Code, which show one surface at a time. */
export const usePanelsAvailable = (isMobile: boolean): boolean => !isMobile && !isVSCodeRuntime();
