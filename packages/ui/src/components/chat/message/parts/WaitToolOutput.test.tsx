import { expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '@/lib/i18n';
import { WaitListedBody, WaitStartedBody } from './WaitToolOutput';

const render = (body: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{body}</I18nProvider>);

test('Host timer waits render their subject', () => {
    expect(render(<WaitStartedBody data={{ waiting: { waitId: 'wait-1', source: 'timer', title: 'Timer', args: { minutes: 10 } } }} />)).toContain('10');
});

test('an empty authoritative wait list still renders the sources section', () => {
    expect(render(<WaitListedBody data={{ waiting: [], sources: [] }} />)).not.toBe('');
});

test('malformed Host wait answers have no specialized view', () => {
    expect(render(<WaitStartedBody data={{ waiting: { source: 'timer' } }} />)).toBe('');
    expect(render(<WaitListedBody data={{ waiting: [], sources: null }} />)).toBe('');
});
