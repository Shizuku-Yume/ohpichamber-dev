import * as React from 'react';

import { isVSCodeRuntime } from '@/lib/desktop';

export const RawToggleContext = React.createContext<React.ReactNode>(null);

/** Where a panel can open beside the chat: not on a phone or in VS Code, which show one surface at a time. */
export const usePanelsAvailable = (isMobile: boolean): boolean => !isMobile && !isVSCodeRuntime();
