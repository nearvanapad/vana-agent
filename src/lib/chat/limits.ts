/**
 * Chat messages allowed per day (UTC). Each wallet gets CHAT_PER_DAY; each IP gets more, since
 * everyone on one network (venue wifi, an office) shares it, and it is there to stop one person
 * with many wallets. Shared by the server, the landing page and the chat.
 */
export const CHAT_PER_DAY = 100;
export const IP_CHAT_PER_DAY = 300;

/**
 * Of those, how many may use the Partner tier: its model costs about 20 times the others, so it
 * gets a smaller budget of its own, per wallet and per IP.
 */
export const PARTNER_PER_DAY = 10;
export const IP_PARTNER_PER_DAY = 30;

/** Which budget a count belongs to, as the chat's `x-chat-left` header names it. */
export type Budget = "wallet" | "network" | "partner" | "partner-network";

/** Show the "left today" hint once this few remain. */
export const WARN_AT: Record<Budget, number> = { wallet: 10, network: 10, partner: 3, "partner-network": 3 };
