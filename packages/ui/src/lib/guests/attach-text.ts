import type { AttachIssueRequest } from 'ohpichamber-sdk';

export const guestAttachContextText = (issue: AttachIssueRequest): string => issue.text
  ?? `Attached ${issue.providerId} ${issue.id}${issue.title === issue.id ? '' : `: ${issue.title}`}\n${issue.url}`;
