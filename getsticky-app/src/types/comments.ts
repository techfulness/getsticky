/**
 * Comment thread types shared across frontend components.
 * Mirrors server/src/types/index.ts CommentMessage & CommentThread.
 */

export interface CommentMessage {
  id: string;
  author: 'user' | 'claude';
  text: string;
  createdAt: string;
}

export interface CommentThread {
  id: string;
  selectedText: string;
  from: number;
  to: number;
  messages: CommentMessage[];
  status: 'open' | 'resolved';
  createdAt: string;
}
