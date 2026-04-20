"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  clearNotifications,
  getUnreadCount,
  loadNotifications,
  markAllNotificationsRead,
  saveNotifications,
} from "@/lib/notifications";
import type { NotificationItem } from "@/types";

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setItems(loadNotifications());
  }, []);

  const unreadCount = useMemo(() => getUnreadCount(items), [items]);

  const markRead = (id: string) => {
    setItems((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      saveNotifications(next);
      return next;
    });
  };

  const onMarkAllRead = () => {
    setItems(markAllNotificationsRead());
  };

  const onClear = () => {
    clearNotifications();
    setItems([]);
  };

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="relative"
        onClick={() => setOpen(true)}
        title={unreadCount ? `${unreadCount} unread notifications` : "Notifications"}
      >
        <Bell className="h-4 w-4" />
        {unreadCount ? (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Notifications</DialogTitle>
            <DialogDescription>On-chain updates for your marketplace activity.</DialogDescription>
          </DialogHeader>

          {items.length === 0 ? (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">No notifications yet.</div>
          ) : (
            <div className="max-h-[55vh] space-y-2 overflow-auto pr-1">
              {items.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "rounded-md border p-3 text-sm transition-colors",
                    n.read ? "bg-background" : "bg-primary/5"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("font-semibold", n.read ? "text-foreground" : "text-foreground")}>
                          {n.title}
                        </span>
                        {!n.read ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs">New</span> : null}
                      </div>
                      <p className="mt-1 break-words text-muted-foreground">{n.message}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{new Date(n.createdAt).toLocaleString()}</span>
                        {n.escrowId ? (
                          <Link className="underline hover:text-foreground" href={`/escrow/${n.escrowId}`}>
                            Escrow #{n.escrowId}
                          </Link>
                        ) : null}
                        {n.txHash ? (
                          <Link
                            className="underline hover:text-foreground"
                            href={`https://sepolia.etherscan.io/tx/${n.txHash}`}
                            target="_blank"
                          >
                            View tx
                          </Link>
                        ) : null}
                      </div>
                    </div>

                    {!n.read ? (
                      <Button variant="secondary" size="sm" onClick={() => markRead(n.id)}>
                        Mark read
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            <div className="flex gap-2">
              <Button variant="outline" onClick={onMarkAllRead} disabled={!items.length || unreadCount === 0}>
                <CheckCheck className="mr-2 h-4 w-4" />
                Mark all read
              </Button>
              <Button variant="outline" onClick={onClear} disabled={!items.length}>
                <Trash2 className="mr-2 h-4 w-4" />
                Clear
              </Button>
            </div>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

