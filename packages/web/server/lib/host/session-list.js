import { z } from 'zod';

const SESSION_LIST_ALLOWED_FIELDS = [
  'id', 'parentID', 'projectID', 'location', 'subpath', 'agent', 'model',
  'cost', 'tokens', 'outcome', 'time', 'fork', 'revert',
];

export const sanitizeSessionListItem = (session) => {
  const parsed = z.record(z.string(), z.unknown()).parse(session);
  const sanitized = {};
  for (const key of SESSION_LIST_ALLOWED_FIELDS) {
    if (key in parsed) sanitized[key] = parsed[key];
  }
  return sanitized;
};
