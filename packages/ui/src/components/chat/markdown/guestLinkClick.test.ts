import { afterEach, describe, expect, test } from 'bun:test';
import { useGuestsStore } from '@/lib/guests/store';
import type { InstalledGuest } from '@/lib/guests/types';
import { useInputStore } from '@/sync/input-store';
import { runGuestLink } from './guestLinkClick';

const originalGuests = useGuestsStore.getState().guests;
const originalIssue = useInputStore.getState().pendingGuestIssue;
const guest: InstalledGuest = {
  id: 'tasks', name: 'Tasks', icon: 'tasks.svg',
  capabilities: { requested: ['links'], granted: ['links'] },
};
const claim = { guestId: 'tasks', action: 'attach' as const, identifier: 'TASK-12', url: 'https://tasks.example/items/TASK-12' };

afterEach(() => {
  useGuestsStore.setState({ guests: originalGuests });
  useInputStore.getState().setPendingGuestIssue(originalIssue);
});

describe('guest link actions', () => {
  test('an approved attachment becomes pending input rather than sending a message', () => {
    useGuestsStore.setState({ guests: [guest] });
    useInputStore.getState().setPendingGuestIssue(null);
    expect(runGuestLink(claim, 'identifier', '/repo', (key) => key)).toBe(true);
    expect(useInputStore.getState().pendingGuestIssue).toEqual({
      kind: 'issue', providerId: 'tasks', id: 'TASK-12', title: 'TASK-12', url: claim.url,
    });
  });

  test('an attachment without a URL leaves existing pending input alone', () => {
    useGuestsStore.setState({ guests: [guest] });
    const previous = useInputStore.getState().pendingGuestIssue;
    expect(runGuestLink({ ...claim, url: undefined }, 'identifier', '/repo', (key) => key)).toBe(false);
    expect(useInputStore.getState().pendingGuestIssue).toBe(previous);
  });

  test('a removed extension cannot act on a cached claim', () => {
    useGuestsStore.setState({ guests: [] });
    const previous = useInputStore.getState().pendingGuestIssue;
    expect(runGuestLink(claim, 'identifier', '/repo', (key) => key)).toBe(false);
    expect(useInputStore.getState().pendingGuestIssue).toBe(previous);
  });

  test('revoked capability and paused extensions cannot attach a claimed link', () => {
    for (const blocked of [
      { ...guest, capabilities: { requested: ['links' as const], granted: [] } },
      { ...guest, enabled: false },
    ]) {
      useGuestsStore.setState({ guests: [blocked] });
      const previous = useInputStore.getState().pendingGuestIssue;
      expect(runGuestLink(claim, 'link', '/repo', (key) => key)).toBe(false);
      expect(useInputStore.getState().pendingGuestIssue).toBe(previous);
    }
  });
});
