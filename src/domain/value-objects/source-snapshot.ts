export interface SourceSnapshot {
  readonly id: number;
  readonly chatId: number;
  readonly messageId: number;
  readonly chatUsername: string | null;
  readonly senderName: string | null;
  readonly senderUsername: string | null;
  readonly messageText: string | null;
  readonly mediaFileId: string | null;
  readonly mediaType: string | null;
  readonly isMediaProtected: boolean;
  readonly createdAt: number;
}

export function hasPublicDeepLink(snapshot: SourceSnapshot): boolean {
  return snapshot.chatUsername !== null && snapshot.messageId !== null;
}

export function buildDeepLink(snapshot: SourceSnapshot): string | null {
  if (!hasPublicDeepLink(snapshot)) return null;
  return `https://t.me/${snapshot.chatUsername}/${snapshot.messageId}`;
}
