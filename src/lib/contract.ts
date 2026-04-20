import { Contract, ethers } from "ethers";
import abi from "@/lib/abi.json";
import { getEnvStatus, requireContractAddress } from "@/lib/env";
import { getPublicProvider, getSigner } from "@/lib/web3";
import type { Escrow, EscrowActivity } from "@/types";

const FALLBACK_ACTIVITY_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
const ACTIVITY_SCAN_WINDOW = 5_000;

function getDeployBlock(): number | null {
  return getEnvStatus().deployBlock;
}

async function getEventBlockRange(provider: { getBlockNumber: () => Promise<number> }) {
  const latest = await provider.getBlockNumber();
  const deployBlock = getDeployBlock();
  const windowFloor = Math.max(0, latest - ACTIVITY_SCAN_WINDOW);
  const from = deployBlock ? Math.max(windowFloor, deployBlock) : windowFloor;
  return { fromBlock: from, toBlock: latest };
}

export async function getContract(withSigner = true): Promise<Contract> {
  const contractAddress = requireContractAddress();
  const runner = withSigner ? await getSigner() : getPublicProvider();
  return new Contract(contractAddress, abi, runner);
}

async function contractHasSelector(contract: Contract, selector: string): Promise<boolean> {
  try {
    const runner = contract.runner as
      | { provider?: { getCode: (address: string) => Promise<string> }; getCode?: (address: string) => Promise<string> }
      | null;

    const getCode = runner?.provider?.getCode ?? runner?.getCode;
    if (!getCode) {
      return true;
    }

    const contractAddress = await contract.getAddress();
    const code = await getCode(contractAddress);
    if (!code || code === "0x") {
      return false;
    }

    return code.toLowerCase().includes(selector.toLowerCase().replace("0x", ""));
  } catch {
    // If bytecode probing fails, don't block transactions by default.
    return true;
  }
}

export async function createEscrow(
  seller: string,
  amount: string,
  description: string
): Promise<{ hash: string }> {
  try {
    const contract = await getContract(true);
    const parsedAmount = ethers.parseEther(amount);
    if (parsedAmount <= 0n) {
      throw new Error("Amount must be greater than 0.");
    }

    const tx = await contract.createEscrow(seller, description, {
      value: parsedAmount,
    });

    const receipt = await tx.wait();
    console.log("createEscrow tx receipt:", receipt);
    return { hash: tx.hash };
  } catch (error) {
    console.error("createEscrow error:", error);
    throw error;
  }
}

export async function createEscrowWithDeadline(
  seller: string,
  amount: string,
  description: string,
  deadlineDays: number
): Promise<{ hash: string }> {
  try {
    const contract = await getContract(true);
    const parsedAmount = ethers.parseEther(amount);
    if (parsedAmount <= 0n) {
      throw new Error("Amount must be greater than 0.");
    }

    const normalizedDays = Number.isFinite(deadlineDays) ? Math.max(0, Math.floor(deadlineDays)) : 0;

    // Backward compatibility: older deployed contracts only expose createEscrow(address,string).
    if (normalizedDays === 0) {
      const tx = await contract.createEscrow(seller, description, {
        value: parsedAmount,
      });

      const receipt = await tx.wait();
      console.log("createEscrow (no deadline) tx receipt:", receipt);
      return { hash: tx.hash };
    }

    const deadlineSelector = ethers.id("createEscrowWithDeadline(address,string,uint256)").slice(0, 10);
    const supportsDeadline = await contractHasSelector(contract, deadlineSelector);
    if (!supportsDeadline) {
      throw new Error(
        "Deployed contract does not support deadline escrows. Set deadline days to 0 or redeploy the latest contract."
      );
    }

    const tx = await contract.createEscrowWithDeadline(seller, description, normalizedDays, {
      value: parsedAmount,
    });

    const receipt = await tx.wait();
    console.log("createEscrowWithDeadline tx receipt:", receipt);
    return { hash: tx.hash };
  } catch (error) {
    console.error("createEscrowWithDeadline error:", error);
    throw error;
  }
}

export async function releasePayment(escrowId: bigint | number): Promise<{ hash: string }> {
  try {
    const contract = await getContract(true);
    const tx = await contract.releasePayment(escrowId);
    await tx.wait();
    console.log("releasePayment tx:", tx.hash);
    return { hash: tx.hash };
  } catch (error) {
    console.error("releasePayment error:", error);
    throw error;
  }
}

export async function refundBuyer(escrowId: bigint | number): Promise<{ hash: string }> {
  try {
    const contract = await getContract(true);
    const tx = await contract.refundBuyer(escrowId);
    await tx.wait();
    console.log("refundBuyer tx:", tx.hash);
    return { hash: tx.hash };
  } catch (error) {
    console.error("refundBuyer error:", error);
    throw error;
  }
}

export async function claimExpiredRefund(escrowId: bigint | number): Promise<{ hash: string }> {
  try {
    const contract = await getContract(true);
    const tx = await contract.claimExpiredRefund(escrowId);
    await tx.wait();
    console.log("claimExpiredRefund tx:", tx.hash);
    return { hash: tx.hash };
  } catch (error) {
    console.error("claimExpiredRefund error:", error);
    throw error;
  }
}

export async function getEscrow(escrowId: bigint | number): Promise<Escrow> {
  try {
    const contract = await getContract(false);
    const escrow = await contract.getEscrow(escrowId);
    return escrow as Escrow;
  } catch (error) {
    console.error("getEscrow error:", error);
    throw error;
  }
}

export async function getAllEscrows(): Promise<Escrow[]> {
  try {
    const contract = await getContract(false);
    const escrows = await contract.getAllEscrows();
    return escrows as Escrow[];
  } catch (error) {
    console.error("getAllEscrows error:", error);
    throw error;
  }
}

type ActivityCache = {
  key: string;
  createdAt: number;
  value: EscrowActivity[];
};

let activityCache: ActivityCache | null = null;

type ActivityLogs = {
  createdLogs: any[];
  releasedLogs: any[];
  refundedLogs: any[];
};

function isLikelyGetLogsRangeError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  return (
    message.includes("eth_getlogs") ||
    message.includes("block range") ||
    message.includes("could not coalesce error")
  );
}

function extractSuggestedBlockRange(error: unknown): number | null {
  const message = String((error as { message?: string })?.message ?? "");
  const match = message.match(/up to a\s+(\d+)\s+block range/i);
  if (!match) return null;

  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.floor(parsed);
}

async function queryFilterAdaptive(
  contract: Contract,
  filter: any,
  fromBlock: number,
  toBlock: number
): Promise<any[]> {
  const totalWindow = Math.max(1, toBlock - fromBlock + 1);
  const windowCandidates = [totalWindow, 2_000, 500, 100, 10];
  const seen = new Set<number>();
  let lastError: unknown;

  for (let i = 0; i < windowCandidates.length; i += 1) {
    const candidate = Math.max(1, Math.min(totalWindow, windowCandidates[i]));
    if (seen.has(candidate)) continue;
    seen.add(candidate);

    const candidateFrom = Math.max(fromBlock, toBlock - candidate + 1);

    try {
      return await contract.queryFilter(filter, candidateFrom, toBlock);
    } catch (error) {
      lastError = error;
      const suggested = extractSuggestedBlockRange(error);
      if (suggested && !seen.has(suggested)) {
        windowCandidates.push(suggested);
      }
    }
  }

  throw lastError ?? new Error("Failed to query activity logs");
}

async function queryActivityLogsForContract(
  contract: Contract,
  fromBlock: number,
  toBlock: number,
  escrowId?: bigint
): Promise<ActivityLogs> {
  const createdFilter = escrowId !== undefined
    ? contract.filters.EscrowCreated(escrowId)
    : contract.filters.EscrowCreated();
  const releasedFilter = escrowId !== undefined
    ? contract.filters.PaymentReleased(escrowId)
    : contract.filters.PaymentReleased();
  const refundedFilter = escrowId !== undefined
    ? contract.filters.PaymentRefunded(escrowId)
    : contract.filters.PaymentRefunded();

  const [createdLogs, releasedLogs, refundedLogs] = await Promise.all([
    queryFilterAdaptive(contract, createdFilter, fromBlock, toBlock),
    queryFilterAdaptive(contract, releasedFilter, fromBlock, toBlock),
    queryFilterAdaptive(contract, refundedFilter, fromBlock, toBlock),
  ]);

  return { createdLogs, releasedLogs, refundedLogs };
}

async function queryActivityLogsWithFallback(
  primaryContract: Contract,
  fromBlock: number,
  toBlock: number,
  escrowId?: bigint
): Promise<ActivityLogs> {
  try {
    return await queryActivityLogsForContract(primaryContract, fromBlock, toBlock, escrowId);
  } catch (primaryError) {
    if (!isLikelyGetLogsRangeError(primaryError)) {
      throw primaryError;
    }

    const contractAddress = await primaryContract.getAddress();
    const fallbackProvider = new ethers.JsonRpcProvider(FALLBACK_ACTIVITY_RPC_URL);
    const fallbackContract = new Contract(contractAddress, abi, fallbackProvider);
    const fallbackRange = await getEventBlockRange(fallbackProvider);

    return queryActivityLogsForContract(
      fallbackContract,
      fallbackRange.fromBlock,
      fallbackRange.toBlock,
      escrowId
    );
  }
}

export async function getEscrowActivities(limit = 25): Promise<EscrowActivity[]> {
  try {
    const contract = await getContract(false);
    const provider = getPublicProvider();
    const range = await getEventBlockRange(provider);

    const cacheKey = `${range.fromBlock}:${range.toBlock}:${limit}`;
    if (activityCache && activityCache.key === cacheKey && Date.now() - activityCache.createdAt < 15_000) {
      return activityCache.value;
    }

    const { createdLogs, releasedLogs, refundedLogs } = await queryActivityLogsWithFallback(
      contract,
      range.fromBlock,
      range.toBlock
    );

    const activityPromises = [
      ...createdLogs.map(async (log: any): Promise<EscrowActivity> => {
        const block = await log.getBlock();
        return {
          escrowId: BigInt(log.args.escrowId),
          type: "CREATED",
          amount: BigInt(log.args.amount),
          actor: String(log.args.buyer),
          counterparty: String(log.args.seller),
          txHash: String(log.transactionHash),
          timestamp: Number(block.timestamp),
        };
      }),
      ...releasedLogs.map(async (log: any): Promise<EscrowActivity> => {
        const block = await log.getBlock();
        return {
          escrowId: BigInt(log.args.escrowId),
          type: "RELEASED",
          amount: BigInt(log.args.amount),
          actor: String(log.args.buyer),
          counterparty: String(log.args.seller),
          txHash: String(log.transactionHash),
          timestamp: Number(block.timestamp),
        };
      }),
      ...refundedLogs.map(async (log: any): Promise<EscrowActivity> => {
        const block = await log.getBlock();
        return {
          escrowId: BigInt(log.args.escrowId),
          type: "REFUNDED",
          amount: BigInt(log.args.amount),
          actor: String(log.args.buyer),
          counterparty: String(log.args.buyer),
          txHash: String(log.transactionHash),
          timestamp: Number(block.timestamp),
        };
      }),
    ];

    const activities = await Promise.all(activityPromises);

    const result = activities
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.max(1, limit));
    activityCache = { key: cacheKey, createdAt: Date.now(), value: result };
    return result;
  } catch (error) {
    console.error("getEscrowActivities error:", error);
    return [];
  }
}

export async function getEscrowActivitiesForEscrow(
  escrowId: bigint | number,
  limit = 50
): Promise<EscrowActivity[]> {
  try {
    const contract = await getContract(false);
    const id = BigInt(escrowId);
    const provider = getPublicProvider();
    const range = await getEventBlockRange(provider);

    const { createdLogs, releasedLogs, refundedLogs } = await queryActivityLogsWithFallback(
      contract,
      range.fromBlock,
      range.toBlock,
      id
    );

    const activityPromises = [
      ...createdLogs.map(async (log: any): Promise<EscrowActivity> => {
        const block = await log.getBlock();
        return {
          escrowId: BigInt(log.args.escrowId),
          type: "CREATED",
          amount: BigInt(log.args.amount),
          actor: String(log.args.buyer),
          counterparty: String(log.args.seller),
          txHash: String(log.transactionHash),
          timestamp: Number(block.timestamp),
        };
      }),
      ...releasedLogs.map(async (log: any): Promise<EscrowActivity> => {
        const block = await log.getBlock();
        return {
          escrowId: BigInt(log.args.escrowId),
          type: "RELEASED",
          amount: BigInt(log.args.amount),
          actor: String(log.args.buyer),
          counterparty: String(log.args.seller),
          txHash: String(log.transactionHash),
          timestamp: Number(block.timestamp),
        };
      }),
      ...refundedLogs.map(async (log: any): Promise<EscrowActivity> => {
        const block = await log.getBlock();
        return {
          escrowId: BigInt(log.args.escrowId),
          type: "REFUNDED",
          amount: BigInt(log.args.amount),
          actor: String(log.args.buyer),
          counterparty: String(log.args.buyer),
          txHash: String(log.transactionHash),
          timestamp: Number(block.timestamp),
        };
      }),
    ];

    const activities = await Promise.all(activityPromises);
    return activities
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.max(1, limit));
  } catch (error) {
    console.error("getEscrowActivitiesForEscrow error:", error);
    return [];
  }
}
