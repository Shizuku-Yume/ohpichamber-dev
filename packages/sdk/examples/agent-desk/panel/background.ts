<<<<<<< HEAD
// Actions run here, in a hidden frame: each one files its target with the service.
import { connectHost } from 'ohpichamber-sdk';
||||||| bc50ba56aa
// Actions run here, in a hidden frame: each one files its target with the service.
import { connectHost } from '@openchamber/sdk';
=======
import { connectHost } from '@openchamber/sdk';
>>>>>>> upstream/main

const host = connectHost();
host.onAction(async (item) => {
  await host.serviceRequest({ method: 'POST', path: '/note', body: JSON.stringify({ note: JSON.stringify(item) }) });
});
