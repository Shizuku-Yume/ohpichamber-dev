import React from 'react';

import { SyncActions } from './SyncActions';

export const GitPanelSyncActions: React.FC<React.ComponentProps<typeof SyncActions>> = (props) => <SyncActions {...props} />;
