import { isHiddenUserMessage } from '../../message/hiddenUserMessage';
import type { ChatMessageEntry } from './types';

export const turnHeaderCanStick = (userMessage: ChatMessageEntry): boolean => (
 userMessage.role === 'user' && !isHiddenUserMessage(userMessage)
);
