import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

let sharedSocket: Socket | null = null;

function getSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io({
      path: "/api/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
  }
  return sharedSocket;
}

/** Force a fresh socket connection (call after login/logout so rooms re-join). */
export function reconnectSocket(): void {
  if (sharedSocket) {
    sharedSocket.disconnect();
    sharedSocket = null;
  }
  getSocket();
}

/**
 * Subscribe to realtime events. Handlers are kept in a ref so re-renders
 * don't re-bind listeners.
 */
export function useSocket(
  events: Record<string, (payload: any) => void>,
  options?: { categories?: string[] }
) {
  const handlersRef = useRef(events);
  handlersRef.current = events;

  const categoriesKey = options?.categories?.join(",") ?? "";

  useEffect(() => {
    const socket = getSocket();

    const bound: Record<string, (payload: any) => void> = {};
    for (const eventName of Object.keys(handlersRef.current)) {
      bound[eventName] = (payload: any) => handlersRef.current[eventName]?.(payload);
      socket.on(eventName, bound[eventName]);
    }

    const subscribe = () => {
      if (categoriesKey) {
        socket.emit("subscribe-categories", categoriesKey.split(","));
      }
    };
    subscribe();
    socket.on("connect", subscribe);

    return () => {
      for (const eventName of Object.keys(bound)) {
        socket.off(eventName, bound[eventName]);
      }
      socket.off("connect", subscribe);
    };
  }, [categoriesKey]);
}
