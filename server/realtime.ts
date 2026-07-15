import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { verifyAccountSession, parseCookies, ACCOUNT_COOKIE } from "./accountAuth";

let io: SocketIOServer | null = null;

/**
 * Room layout:
 *  - `jewellers:{category}`  → jewellers subscribed per category (lead feed)
 *  - `buyer:{accountId}`     → each buyer's private room (quote updates)
 *  - `jeweller:{accountId}`  → each jeweller's private room (quote status updates)
 *  - `admins`                → admin dashboard live counters
 */
export function initRealtime(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    path: "/api/socket.io",
    cors: { origin: true, credentials: true },
  });

  io.on("connection", async socket => {
    // Authenticate from session cookie (or token passed in auth payload)
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const token =
      cookies[ACCOUNT_COOKIE] || (socket.handshake.auth?.token as string | undefined);
    const session = token ? await verifyAccountSession(token) : null;

    if (!session) {
      // Unauthenticated sockets may stay connected but join no rooms.
      return;
    }

    if (session.role === "buyer") {
      socket.join(`buyer:${session.accountId}`);
    } else if (session.role === "jeweller") {
      socket.join(`jeweller:${session.accountId}`);
      // Client tells us which categories the jeweller serves.
      socket.on("subscribe-categories", (categories: string[]) => {
        if (!Array.isArray(categories)) return;
        for (const cat of categories.slice(0, 10)) {
          if (typeof cat === "string" && cat.length < 50) {
            socket.join(`jewellers:${cat}`);
          }
        }
      });
    } else if (session.role === "admin") {
      socket.join("admins");
    }
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

export function emitNewRequest(category: string, payload: unknown): void {
  io?.to(`jewellers:${category}`).emit("new-request", payload);
  io?.to("admins").emit("admin-update", { type: "request" });
}

export function emitNewQuote(buyerId: number, payload: unknown): void {
  io?.to(`buyer:${buyerId}`).emit("new-quote", payload);
  io?.to("admins").emit("admin-update", { type: "quote" });
}

export function emitQuoteStatus(jewellerId: number, payload: unknown): void {
  io?.to(`jeweller:${jewellerId}`).emit("quote-status", payload);
  io?.to("admins").emit("admin-update", { type: "quote-status" });
}
