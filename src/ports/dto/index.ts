/**
 * Callback-action tags for the Active-list inline buttons, encoded as
 * `<tag>:<reminderId>` in callback_data (≤ 64 bytes, sad §8). Shared between
 * the list handler that renders them and the router that routes them.
 * `SOURCE` reuses the existing fired-reminder source action. `DELETE` has
 * its own `list_delete` tag, distinct from the fired-reminder notification's
 * own `delete` callback — the two need different post-action behavior
 * (issue #8: only the list's own Delete refreshes a /list message).
 */
export const LIST_CALLBACK = {
  CANCEL: "cancel",
  SOURCE: "source",
  DELETE: "list_delete",
} as const;
