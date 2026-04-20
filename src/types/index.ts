import type { BrowserProvider, Contract, JsonRpcSigner } from "ethers";

export enum EscrowStatus {
  PENDING = 0,
  COMPLETED = 1,
  REFUNDED = 2,
}

export interface Escrow {
  id: bigint;
  buyer: string;
  seller: string;
  amount: bigint;
  description: string;
  createdAt: bigint;
  deadline: bigint;
  status: EscrowStatus;
}

export type EscrowActivityType = "CREATED" | "RELEASED" | "REFUNDED";

export interface EscrowActivity {
  escrowId: bigint;
  type: EscrowActivityType;
  amount: bigint;
  actor: string;
  counterparty: string;
  txHash: string;
  timestamp: number;
}

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  escrowId?: string;
  txHash?: string;
  createdAt: number;
  read: boolean;
};

export type TransactionState = {
  isOpen: boolean;
  status: "idle" | "loading" | "success" | "error";
  txHash?: string;
  message?: string;
};

export interface Web3ContextType {
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  contract: Contract | null;
  capsuleContract: Contract | null;
  poolContract: Contract | null;
  subscriptionContract: Contract | null;
  address: string | null;
  chainId: number | null;
  balance: string;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (eventName: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (eventName: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

// Time Capsule Types
export interface Capsule {
  id: bigint;
  sender: string;
  recipient: string;
  amount: bigint;
  unlockDate: bigint;
  messageIpfsHash: string;
  opened: boolean;
  title: string;
  createdAt: bigint;
}

// Escrow Pool Types
export enum PoolStatus {
  FUNDING = 0,
  FUNDED = 1,
  COMPLETED = 2,
  REFUNDED = 3,
}

export interface PoolEscrow {
  id: bigint;
  seller: string;
  targetAmount: bigint;
  currentAmount: bigint;
  fundingDeadline: bigint;
  description: string;
  status: PoolStatus;
  releaseVotesWeight: bigint;
  refundVotesWeight: bigint;
  voterCount: bigint;
  creator: string;
  createdAt: bigint;
}

// Subscription Types
export enum SubscriptionStatus {
  ACTIVE = 0,
  CANCELLED = 1,
  COMPLETED = 2,
}

export interface Subscription {
  id: bigint;
  buyer: string;
  seller: string;
  amountPerCycle: bigint;
  totalCycles: bigint;
  cyclesCompleted: bigint;
  nextReleaseAt: bigint;
  intervalSeconds: bigint;
  vaultBalance: bigint;
  status: SubscriptionStatus;
  description: string;
  createdAt: bigint;
}

