"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/client/api";
import { formatDateTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

type Item = { id: string; title: string; message: string; link: string | null; read: boolean; createdAt: string };

const POLL_MS = 60_000;

export function NotificationsBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ items: Item[]; unreadCount: number }>("/api/notifications");
      setItems(data.items);
      setUnread(data.unreadCount);
    } catch {
      // Polling failures are silent; the next poll retries.
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  async function markRead(ids: string[] | "all") {
    setItems((current) => current.map((n) => (ids === "all" || ids.includes(n.id) ? { ...n, read: true } : n)));
    setUnread((count) => (ids === "all" ? 0 : Math.max(0, count - ids.length)));
    await api("/api/notifications", { body: { ids } }).catch(() => load());
  }

  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) void load();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span
              key={unread}
              className="bg-destructive animate-pop absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold text-white"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,360px)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="xs" onClick={() => markRead("all")}>
              <CheckCheck className="size-3.5" aria-hidden="true" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <p className="text-muted-foreground px-4 py-10 text-center text-sm">You&apos;re all caught up.</p>
          ) : (
            <ul className="divide-y">
              {items.map((item) => {
                const body = (
                  <div className="flex gap-3 px-4 py-3">
                    <span
                      aria-hidden="true"
                      className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.read ? "bg-transparent" : "bg-primary")}
                    />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className={cn("text-sm", !item.read && "font-medium")}>{item.title}</p>
                      {item.message && <p className="text-muted-foreground line-clamp-2 text-xs">{item.message}</p>}
                      <p className="text-muted-foreground text-[11px]">{formatDateTime(item.createdAt)}</p>
                    </div>
                  </div>
                );
                return (
                  <li key={item.id} className="hover:bg-muted/50 transition-colors">
                    {item.link ? (
                      <Link
                        href={item.link}
                        onClick={() => {
                          setOpen(false);
                          if (!item.read) void markRead([item.id]);
                        }}
                        className="block"
                      >
                        {body}
                      </Link>
                    ) : (
                      <button type="button" className="w-full text-left" onClick={() => !item.read && markRead([item.id])}>
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
