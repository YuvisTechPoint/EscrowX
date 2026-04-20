"use client";

import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { Copy, Download, ExternalLink, RefreshCcw, Star } from "lucide-react";
import { toast } from "sonner";
import EscrowCard from "@/components/EscrowCard";
import EthAmountWithUsd from "@/components/EthAmountWithUsd";
import TransactionModal from "@/components/TransactionModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWeb3 } from "@/context/Web3Context";
import { claimExpiredRefund, getAllEscrows, getEscrowActivities, refundBuyer, releasePayment } from "@/lib/contract";
import { addNotificationsFromActivities } from "@/lib/notifications";
import { truncateAddress } from "@/lib/web3";
import { EscrowStatus, type Escrow, type EscrowActivity, type TransactionState } from "@/types";
import EscrowDetailsDialog from "@/components/EscrowDetailsDialog";
import DeadlineTimer from "@/components/DeadlineTimer";

type ConfirmAction = "release" | "refund" | null;
type SortMode = "newest" | "oldest" | "amount-high" | "amount-low";

const WATCHLIST_STORAGE_KEY = "escrow-watchlist-v1";

function statusBadge(status: EscrowStatus) {
  if (status === EscrowStatus.PENDING) return <Badge className="bg-yellow-500 text-black">PENDING</Badge>;
  if (status === EscrowStatus.COMPLETED) return <Badge className="bg-green-600 text-white">COMPLETED</Badge>;
  return <Badge className="bg-red-600 text-white">REFUNDED</Badge>;
}

export default function DashboardPage() {
  const { address, connect } = useWeb3();
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [activities, setActivities] = useState<EscrowActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActivityLoading, setIsActivityLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionableOnly, setActionableOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("10");
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [autoRefreshSeconds, setAutoRefreshSeconds] = useState("15");
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set());
  const [confirmEscrowId, setConfirmEscrowId] = useState<bigint | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [detailsEscrow, setDetailsEscrow] = useState<Escrow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [expiringSoonOnly, setExpiringSoonOnly] = useState(false);

  const [txState, setTxState] = useState<TransactionState>({
    isOpen: false,
    status: "idle",
  });

  const loadEscrows = async () => {
    try {
      setIsLoading(true);
      const data = await getAllEscrows();
      setEscrows(data);
      console.log("Loaded escrows:", data.length);
    } catch (error) {
      console.error("loadEscrows error:", error);
      toast.error("Failed to load escrows. Check contract address and network.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadActivities = async () => {
    try {
      setIsActivityLoading(true);
      const data = await getEscrowActivities(20);
      setActivities(data);
      try {
        addNotificationsFromActivities(data);
      } catch {
        // ignore (SSR / localStorage disabled)
      }
    } catch (error) {
      console.error("loadActivities error:", error);
      toast.error("Failed to load on-chain activity feed.");
    } finally {
      setIsActivityLoading(false);
    }
  };

  const refreshAllData = async () => {
    await Promise.all([loadEscrows(), loadActivities()]);
  };

  useEffect(() => {
    void refreshAllData();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as string[];
      if (Array.isArray(parsed)) {
        setWatchlistIds(new Set(parsed));
      }
    } catch {
      window.localStorage.removeItem(WATCHLIST_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(Array.from(watchlistIds)));
  }, [watchlistIds]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const seconds = Number(autoRefreshSeconds);
    if (!Number.isFinite(seconds) || seconds < 5) return;

    const interval = window.setInterval(() => {
      void refreshAllData();
    }, seconds * 1000);

    return () => window.clearInterval(interval);
  }, [autoRefreshEnabled, autoRefreshSeconds]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, statusFilter, searchQuery, actionableOnly, sortMode, pageSize, expiringSoonOnly]);

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}.`);
    }
  };

  const filteredEscrows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return escrows.filter((escrow) => {
      const lowerAddress = address?.toLowerCase();
      const isBuyer = escrow.buyer.toLowerCase() === lowerAddress;
      const matchTab =
        activeTab === "all" ||
        (activeTab === "buyer" && isBuyer) ||
        (activeTab === "seller" && escrow.seller.toLowerCase() === lowerAddress) ||
        (activeTab === "watchlist" && watchlistIds.has(escrow.id.toString()));

      const matchStatus =
        statusFilter === "all" ||
        Number(escrow.status) ===
          (statusFilter === "pending" ? 0 : statusFilter === "completed" ? 1 : 2);

      const isActionable = isBuyer && Number(escrow.status) === EscrowStatus.PENDING;
      const matchActionable = !actionableOnly || isActionable;

      const deadlineSeconds = Number(escrow.deadline || 0n);
      const nowSeconds = Math.floor(Date.now() / 1000);
      const isPending = Number(escrow.status) === EscrowStatus.PENDING;
      const isExpiringSoon =
        isPending && deadlineSeconds > 0 && deadlineSeconds > nowSeconds && deadlineSeconds - nowSeconds <= 48 * 60 * 60;
      const matchExpiringSoon = !expiringSoonOnly || isExpiringSoon;

      const matchSearch =
        normalizedQuery.length === 0 ||
        escrow.id.toString().includes(normalizedQuery) ||
        escrow.buyer.toLowerCase().includes(normalizedQuery) ||
        escrow.seller.toLowerCase().includes(normalizedQuery) ||
        escrow.description.toLowerCase().includes(normalizedQuery);

      return matchTab && matchStatus && matchActionable && matchExpiringSoon && matchSearch;
    });
  }, [escrows, activeTab, statusFilter, address, actionableOnly, expiringSoonOnly, searchQuery, watchlistIds]);

  const sortedEscrows = useMemo(() => {
    const sorted = [...filteredEscrows];
    sorted.sort((a, b) => {
      if (sortMode === "newest") return Number(b.createdAt) - Number(a.createdAt);
      if (sortMode === "oldest") return Number(a.createdAt) - Number(b.createdAt);
      if (sortMode === "amount-high") return Number(b.amount) - Number(a.amount);
      return Number(a.amount) - Number(b.amount);
    });

    return sorted;
  }, [filteredEscrows, sortMode]);

  const totalPages = Math.max(1, Math.ceil(sortedEscrows.length / Number(pageSize)));

  const paginatedEscrows = useMemo(() => {
    const start = (page - 1) * Number(pageSize);
    return sortedEscrows.slice(start, start + Number(pageSize));
  }, [sortedEscrows, page, pageSize]);

  const stats = useMemo(() => {
    const pendingCount = sortedEscrows.filter((e) => Number(e.status) === EscrowStatus.PENDING).length;
    const completedCount = sortedEscrows.filter((e) => Number(e.status) === EscrowStatus.COMPLETED).length;
    const escrowVolume = sortedEscrows.reduce((acc, e) => acc + Number(ethers.formatEther(e.amount)), 0);

    return {
      total: sortedEscrows.length,
      pendingCount,
      completedCount,
      escrowVolume,
    };
  }, [sortedEscrows]);

  const toggleWatchlist = (id: bigint) => {
    setWatchlistIds((prev) => {
      const next = new Set(prev);
      const key = id.toString();
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const exportVisibleAsCsv = () => {
    if (!sortedEscrows.length) {
      toast.error("No escrows to export for current filters.");
      return;
    }

    const rows = sortedEscrows.map((escrow) => ({
      id: escrow.id.toString(),
      buyer: escrow.buyer,
      seller: escrow.seller,
      amountEth: ethers.formatEther(escrow.amount),
      description: escrow.description.replaceAll('"', '""'),
      status:
        Number(escrow.status) === EscrowStatus.PENDING
          ? "PENDING"
          : Number(escrow.status) === EscrowStatus.COMPLETED
            ? "COMPLETED"
            : "REFUNDED",
      createdAt: new Date(Number(escrow.createdAt) * 1000).toISOString(),
    }));

    const header = "id,buyer,seller,amountEth,description,status,createdAt";
    const body = rows
      .map((row) => `${row.id},${row.buyer},${row.seller},${row.amountEth},"${row.description}",${row.status},${row.createdAt}`)
      .join("\n");

    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `escrows-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast.success("CSV exported.");
  };

  const openEscrowDetails = (escrow: Escrow) => {
    setDetailsEscrow(escrow);
    setDetailsOpen(true);
  };

  const runAction = async () => {
    if (!confirmEscrowId || !confirmAction) return;

    try {
      setTxState({ isOpen: true, status: "loading" });
      let txHash = "";

      if (confirmAction === "release") {
        const result = await releasePayment(confirmEscrowId);
        txHash = result.hash;
        toast.success("Payment released successfully.");
      }

      if (confirmAction === "refund") {
        const result = await refundBuyer(confirmEscrowId);
        txHash = result.hash;
        toast.success("Refund sent successfully.");
      }

      setTxState({ isOpen: true, status: "success", txHash });
      setConfirmEscrowId(null);
      setConfirmAction(null);
      await refreshAllData();
    } catch (error: unknown) {
      console.error("runAction error:", error);
      const message = error instanceof Error ? error.message : "Transaction failed.";
      setTxState({ isOpen: true, status: "error", message });
      toast.error(message);
    }
  };

  const runExpiredRefund = async (escrowId: bigint) => {
    try {
      setTxState({ isOpen: true, status: "loading" });
      const result = await claimExpiredRefund(escrowId);
      toast.success("Expired refund claimed.");
      setTxState({ isOpen: true, status: "success", txHash: result.hash });
      await refreshAllData();
    } catch (error: unknown) {
      console.error("runExpiredRefund error:", error);
      const message = error instanceof Error ? error.message : "Transaction failed.";
      setTxState({ isOpen: true, status: "error", message });
      toast.error(message);
    }
  };

  return (
    <div className="space-y-6">
      {!address ? (
        <div className="flex flex-col gap-2 rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-semibold">Read-only mode</div>
            <div className="text-muted-foreground">
              You can browse marketplace escrows without connecting. Connect wallet to create, release, or refund.
            </div>
          </div>
          <Button onClick={() => void connect()}>Connect Wallet</Button>
        </div>
      ) : null}

      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <h1 className="text-2xl font-bold">Escrow Dashboard</h1>

        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, address, description..."
            className="md:w-80"
          />
          <div className="w-full md:w-64">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full md:w-56">
            <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
              <SelectTrigger>
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="amount-high">Amount: High to Low</SelectItem>
                <SelectItem value="amount-low">Amount: Low to High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full md:w-28">
            <Select value={pageSize} onValueChange={setPageSize}>
              <SelectTrigger>
                <SelectValue placeholder="Page size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / page</SelectItem>
                <SelectItem value="25">25 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant={actionableOnly ? "default" : "outline"} onClick={() => setActionableOnly((v) => !v)}>
            Actionable Only
          </Button>
          <Button variant={expiringSoonOnly ? "default" : "outline"} onClick={() => setExpiringSoonOnly((v) => !v)}>
            Expiring Soon
          </Button>
          <Button variant="outline" onClick={exportVisibleAsCsv}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button variant={autoRefreshEnabled ? "default" : "outline"} onClick={() => setAutoRefreshEnabled((v) => !v)}>
            Auto Refresh {autoRefreshEnabled ? "On" : "Off"}
          </Button>
          <div className="w-full md:w-28">
            <Select value={autoRefreshSeconds} onValueChange={setAutoRefreshSeconds}>
              <SelectTrigger>
                <SelectValue placeholder="Interval" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 sec</SelectItem>
                <SelectItem value="30">30 sec</SelectItem>
                <SelectItem value="60">60 sec</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="icon" onClick={() => void refreshAllData()} title="Refresh escrows">
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Visible Escrows</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{stats.total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{stats.pendingCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{stats.completedCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Visible Volume</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{stats.escrowVolume.toFixed(4)} ETH</CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="buyer">As Buyer</TabsTrigger>
          <TabsTrigger value="seller">As Seller</TabsTrigger>
          <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Recent On-Chain Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {isActivityLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity found yet.</p>
          ) : (
            <div className="space-y-2">
              {activities.map((activity) => (
                <div
                  key={`${activity.txHash}-${activity.escrowId.toString()}`}
                  className="flex flex-col gap-1 rounded-md border p-2 text-sm md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <span className="font-medium">Escrow #{activity.escrowId.toString()}</span>{" "}
                    <span className="text-muted-foreground">
                      {activity.type} <EthAmountWithUsd wei={activity.amount} />
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(activity.timestamp * 1000).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Escrow ID</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedEscrows.map((escrow) => {
                  const lowerAddress = address?.toLowerCase();
                  const canAct =
                    Boolean(lowerAddress) &&
                    lowerAddress === escrow.buyer.toLowerCase() &&
                    Number(escrow.status) === EscrowStatus.PENDING;
                  const isWatched = watchlistIds.has(escrow.id.toString());
                  const isExpired =
                    Number(escrow.status) === EscrowStatus.PENDING &&
                    Number(escrow.deadline || 0n) > 0 &&
                    Math.floor(Date.now() / 1000) >= Number(escrow.deadline);

                  return (
                    <TableRow key={escrow.id.toString()} id={`escrow-${escrow.id.toString()}`}>
                      <TableCell>{escrow.id.toString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{truncateAddress(escrow.buyer)}</span>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => void copyToClipboard(escrow.buyer, "Buyer address")}
                            title="Copy buyer address"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{truncateAddress(escrow.seller)}</span>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => void copyToClipboard(escrow.seller, "Seller address")}
                            title="Copy seller address"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <a
                            href={`https://sepolia.etherscan.io/address/${escrow.seller}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                            title="Open seller on Etherscan"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell>
                        <EthAmountWithUsd wei={escrow.amount} />
                      </TableCell>
                      <TableCell>{escrow.description}</TableCell>
                      <TableCell>{statusBadge(escrow.status)}</TableCell>
                      <TableCell>{new Date(Number(escrow.createdAt) * 1000).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" onClick={() => openEscrowDetails(escrow)}>
                            Details
                          </Button>
                          {Number(escrow.deadline || 0n) > 0 ? <DeadlineTimer deadline={escrow.deadline} /> : null}
                          <Button
                            size="sm"
                            variant={isWatched ? "default" : "outline"}
                            onClick={() => toggleWatchlist(escrow.id)}
                          >
                            <Star className="mr-2 h-3.5 w-3.5" />
                            {isWatched ? "Watching" : "Watch"}
                          </Button>
                          {isExpired ? (
                            <Button size="sm" variant="destructive" onClick={() => void runExpiredRefund(escrow.id)}>
                              Claim Expired Refund
                            </Button>
                          ) : null}
                          {canAct ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setConfirmEscrowId(escrow.id);
                                  setConfirmAction("release");
                                }}
                              >
                                Release Payment
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setConfirmEscrowId(escrow.id);
                                  setConfirmAction("refund");
                                }}
                              >
                                Refund
                              </Button>
                            </>
                          ) : (
                            <span className="self-center text-muted-foreground">No buyer actions</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-4 md:hidden">
            {paginatedEscrows.map((escrow) => (
              <EscrowCard
                key={escrow.id.toString()}
                escrow={escrow}
                currentAddress={address}
                isWatched={watchlistIds.has(escrow.id.toString())}
                onCopyAddress={(value, label) => void copyToClipboard(value, label)}
                onOpenDetails={openEscrowDetails}
                onRelease={(id) => {
                  setConfirmEscrowId(id);
                  setConfirmAction("release");
                }}
                onRefund={(id) => {
                  setConfirmEscrowId(id);
                  setConfirmAction("refund");
                }}
                onToggleWatch={toggleWatchlist}
              />
            ))}
          </div>

          <div className="flex items-center justify-between rounded-md border p-3 text-sm">
            <span className="text-muted-foreground">
              Page {page} of {totalPages} ({stats.total} escrows)
            </span>
            <div className="flex gap-2">
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={Boolean(confirmEscrowId && confirmAction)} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Action</DialogTitle>
            <DialogDescription>
              {confirmAction === "release"
                ? "Release escrow funds to seller? This cannot be undone."
                : "Refund this escrow to buyer?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              variant={confirmAction === "refund" ? "destructive" : "default"}
              onClick={() => void runAction()}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransactionModal
        state={txState}
        onClose={() => setTxState((prev) => ({ ...prev, isOpen: false }))}
        onRetry={() => void runAction()}
      />

      <EscrowDetailsDialog open={detailsOpen} onOpenChange={setDetailsOpen} escrow={detailsEscrow} />
    </div>
  );
}
