/**
 * Live Session Components Barrel Export
 *
 * This module re-exports all live session components for convenient imports.
 * Import from '@/components/live-session' instead of individual files.
 *
 * Components:
 * - SessionContainer: Main container with state management and orchestration
 * - MessageList: Scrollable chat message list
 * - MessageInput: Text input with send button
 * - SessionProgress: Progress bar through recall points
 * - SessionControls: "I've got it" and "End Session" buttons
 * - StreamingMessage: Message that streams in chunks
 *
 * @example
 * ```tsx
 * import {
 *   SessionContainer,
 *   MessageList,
 *   MessageInput,
 *   SessionProgress,
 *   SessionControls,
 *   StreamingMessage,
 * } from '@/components/live-session';
 *
 * // Full session interface
 * <SessionContainer sessionId={id} />
 *
 * // Or individual components for custom layouts
 * <MessageList messages={messages} streamingContent={content} />
 * ```
 */

// Main container component (most common import)
export { SessionContainer } from './SessionContainer';
export type { SessionContainerProps, SessionState } from './SessionContainer';

// Message display components
export { MessageList } from './MessageList';
export type { MessageListProps } from './MessageList';

export { StreamingMessage } from './StreamingMessage';
export type { StreamingMessageProps } from './StreamingMessage';

// Input and control components
export { MessageInput } from './MessageInput';
export type { MessageInputProps } from './MessageInput';

export { SessionControls } from './SessionControls';
export type { SessionControlsProps } from './SessionControls';

// Progress display
export { SessionProgress } from './SessionProgress';
export type { SessionProgressProps } from './SessionProgress';
