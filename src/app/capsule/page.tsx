"use client";

import { useState, useEffect } from "react";
import { useWeb3 } from "@/context/Web3Context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Gift, Clock, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { CapsuleCard } from "@/components/CapsuleCard";
import { Capsule } from "@/types";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function CapsulesPage() {
  const { capsuleContract, address } = useWeb3();
  const [capsules, setCapsules] = useState<Capsule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("received");

  useEffect(() => {
    if (capsuleContract && address) {
      fetchCapsules();
    }
  }, [capsuleContract, address, activeTab]);

  const fetchCapsules = async () => {
    if (!capsuleContract || !address) return;
    
    setLoading(true);
    try {
      let capsuleIds: bigint[] = [];
      
      if (activeTab === "received") {
        const ids = await capsuleContract.getCapsulesByRecipient(address);
        capsuleIds = Array.from(ids);
      } else if (activeTab === "sent") {
        const ids = await capsuleContract.getCapsulesBySender(address);
        capsuleIds = Array.from(ids);
      } else {
        // All - get recent capsules
        const count = await capsuleContract.capsuleCount();
        const start = count > BigInt(20) ? count - BigInt(19) : BigInt(1);
        const capsuleList = await capsuleContract.getCapsulesPaginated(start, BigInt(20));
        setCapsules(capsuleList.filter((c: Capsule) => c.id !== BigInt(0)));
        setLoading(false);
        return;
      }

      const capsuleList: Capsule[] = [];
      for (const id of capsuleIds) {
        try {
          const capsule = await capsuleContract.getCapsule(id);
          capsuleList.push(capsule);
        } catch (e) {
          console.error(`Failed to fetch capsule ${id}:`, e);
        }
      }
      
      setCapsules(capsuleList.sort((a, b) => Number(b.createdAt - a.createdAt)));
    } catch (error) {
      console.error("Error fetching capsules:", error);
      toast.error("Failed to load capsules");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCapsule = async (id: bigint) => {
    if (!capsuleContract) return;
    
    try {
      const tx = await capsuleContract.openCapsule(id);
      toast.loading("Opening capsule...", { id: "open-capsule" });
      
      await tx.wait();
      
      toast.success("🎉 Capsule opened! Funds transferred.", { id: "open-capsule" });
      fetchCapsules();
    } catch (error: any) {
      console.error("Failed to open capsule:", error);
      toast.error(error.message || "Failed to open capsule", { id: "open-capsule" });
    }
  };

  const handleCancelCapsule = async (id: bigint) => {
    if (!capsuleContract) return;
    
    try {
      const tx = await capsuleContract.cancelCapsule(id);
      toast.loading("Cancelling capsule...", { id: "cancel-capsule" });
      
      await tx.wait();
      
      toast.success("Capsule cancelled and refunded.", { id: "cancel-capsule" });
      fetchCapsules();
    } catch (error: any) {
      console.error("Failed to cancel capsule:", error);
      toast.error(error.message || "Failed to cancel capsule", { id: "cancel-capsule" });
    }
  };

  const sortedCapsules = capsules.sort((a, b) => {
    // Unopened first, then by unlock date
    if (a.opened !== b.opened) return a.opened ? 1 : -1;
    return Number(a.unlockDate - b.unlockDate);
  });

  const pendingCount = capsules.filter(c => !c.opened).length;
  const openedCount = capsules.filter(c => c.opened).length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 text-white mb-8">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjwvc3ZnPg==')] opacity-50"></div>
        <div className="relative z-10 px-6 py-12 md:px-12 md:py-16 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm mb-6">
            <Gift className="w-8 h-8" />
          </div>
          <h1 className="text-3xl md:text-5xl font-bold mb-4">
            Send a Message Through Time
          </h1>
          <p className="text-lg text-white/80 max-w-2xl mx-auto mb-8">
            Create time-locked ETH capsules for gifts, trust funds, vesting, or future surprises. 
            The recipient can only unlock them on the date you set.
          </p>
          <Link href="/capsule/create">
            <Button size="lg" className="bg-white text-indigo-900 hover:bg-white/90 font-semibold">
              <Plus className="w-5 h-5 mr-2" />
              Create Time Capsule
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6 text-center">
            <Clock className="w-6 h-6 mx-auto mb-2 text-amber-500" />
            <div className="text-2xl font-bold">{pendingCount}</div>
            <div className="text-sm text-muted-foreground">Pending</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Gift className="w-6 h-6 mx-auto mb-2 text-emerald-500" />
            <div className="text-2xl font-bold">{openedCount}</div>
            <div className="text-sm text-muted-foreground">Opened</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Star className="w-6 h-6 mx-auto mb-2 text-purple-500" />
            <div className="text-2xl font-bold">{capsules.length}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs and List */}
      <Tabs defaultValue="received" className="space-y-6" onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="received">Received</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
          <TabsTrigger value="all">Discover</TabsTrigger>
        </TabsList>

        <TabsContent value="received" className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : sortedCapsules.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Sparkles className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No capsules received yet</h3>
                <p className="text-muted-foreground mb-4">
                  Someone might be preparing a surprise for you!
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {sortedCapsules.map((capsule) => (
                <CapsuleCard
                  key={capsule.id.toString()}
                  capsule={capsule}
                  onOpen={handleOpenCapsule}
                  isRecipient={capsule.recipient.toLowerCase() === address?.toLowerCase()}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sent" className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : sortedCapsules.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Gift className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No capsules sent yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first time capsule for someone special.
                </p>
                <Link href="/capsule/create">
                  <Button>Create Capsule</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {sortedCapsules.map((capsule) => (
                <CapsuleCard
                  key={capsule.id.toString()}
                  capsule={capsule}
                  onCancel={handleCancelCapsule}
                  isSender={capsule.sender.toLowerCase() === address?.toLowerCase()}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : sortedCapsules.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No capsules found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {sortedCapsules.map((capsule) => (
                <CapsuleCard
                  key={capsule.id.toString()}
                  capsule={capsule}
                  isRecipient={capsule.recipient.toLowerCase() === address?.toLowerCase()}
                  isSender={capsule.sender.toLowerCase() === address?.toLowerCase()}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
