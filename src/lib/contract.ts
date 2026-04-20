import { Contract, ethers } from "ethers";
import abi from "@/lib/abi.json";
import { getEnvStatus, requireContractAddress } from "@/lib/env";
import { getPublicProvider, getSigner } from "@/lib/web3";
import type { Escrow, EscrowActivity } from "@/types";

function getDeployBlock(): number | null {
  return getEnvStatus().deployBlock;
}

async function getEventBlockRange(provider: { getBlockNumber: () => Promise<number> }) {
  const latest = await provider.getBlockNumber();
  const deployBlock = getDeployBlock();
  const maxWindow = 80_000; // keeps RPCs happy on public endpoints
  const from = Math.max(0, (deployBlock ?? latest - maxWindow));
  return { fromBlock: from, toBlock: latest };
}

export async function getContract(withSigner = true): Promise<Contract> {
  const contractAddress = requireContractAddress();
  const runner = withSigner ? await getSigner() : getPublicProvider();
  return new Contract(contractAddress, abi, runner);
}

export async function createEscrow(
  seller: string,
  amount: string,
  description: string
): Promise<{ hash: string }> {
  try {
    const contract = await getContract(true);

    const tx = await contract.createEscrow(seller, description, {
      value: ethers.parseEther(amount),
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
    const normalizedDays = Number.isFinite(deadlineDays) ? Math.max(0, Math.floor(deadlineDays)) : 0;

    const tx = await contract.createEscrowWithDeadline(seller, description, normalizedDays, {
      value: ethers.parseEther(amount),
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

export async function getEscrowActivities(limit = 25): Promise<EscrowActivity[]> {
  try {
    const contract = await getContract(false);
    const provider = getPublicProvider();
    const range = await getEventBlockRange(provider);

    const cacheKey = `${range.fromBlock}:${range.toBlock}:${limit}`;
    if (activityCache && activityCache.key === cacheKey && Date.now() - activityCache.createdAt < 15_000) {
      return activityCache.value;
    }

    const [createdLogs, releasedLogs, refundedLogs] = await Promise.all([
      contract.queryFilter(contract.filters.EscrowCreated(), range.fromBlock, range.toBlock),
      contract.queryFilter(contract.filters.PaymentReleased(), range.fromBlock, range.toBlock),
      contract.queryFilter(contract.filters.PaymentRefunded(), range.fromBlock, range.toBlock),
    ]);

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
    throw error;
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

    const [createdLogs, releasedLogs, refundedLogs] = await Promise.all([
      contract.queryFilter(contract.filters.EscrowCreated(id), range.fromBlock, range.toBlock),
      contract.queryFilter(contract.filters.PaymentReleased(id), range.fromBlock, range.toBlock),
      contract.queryFilter(contract.filters.PaymentRefunded(id), range.fromBlock, range.toBlock),
    ]);

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
    throw error;
  }
}
