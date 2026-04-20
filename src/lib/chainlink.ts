import { Contract, ethers } from "ethers";
import { getPublicProvider } from "@/lib/web3";

const DEFAULT_ETH_USD_FEED_SEPOLIA = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

const AGGREGATOR_ABI = [
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { internalType: "uint80", name: "roundId", type: "uint80" },
      { internalType: "int256", name: "answer", type: "int256" },
      { internalType: "uint256", name: "startedAt", type: "uint256" },
      { internalType: "uint256", name: "updatedAt", type: "uint256" },
      { internalType: "uint80", name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export type EthUsdQuote = {
  price: number; // e.g. 3241.5
  updatedAt: number; // unix seconds
};

let cached: { value: EthUsdQuote; fetchedAtMs: number } | null = null;

export async function getEthUsdQuote(opts?: { maxAgeMs?: number }): Promise<EthUsdQuote> {
  const maxAgeMs = opts?.maxAgeMs ?? 60_000;
  if (cached && Date.now() - cached.fetchedAtMs < maxAgeMs) return cached.value;

  const provider = getPublicProvider();
  const feedAddress = (process.env.NEXT_PUBLIC_CHAINLINK_ETH_USD_FEED || DEFAULT_ETH_USD_FEED_SEPOLIA).trim();
  if (!ethers.isAddress(feedAddress)) {
    throw new Error("Invalid Chainlink ETH/USD feed address");
  }

  const feed = new Contract(feedAddress, AGGREGATOR_ABI, provider);
  const [decimals, round] = await Promise.all([feed.decimals(), feed.latestRoundData()]);

  const answer = round.answer as bigint;
  const updatedAt = Number(round.updatedAt as bigint);
  if (answer <= 0n) throw new Error("Chainlink returned invalid price");

  const price = Number(answer) / 10 ** Number(decimals);
  const value = { price, updatedAt };
  cached = { value, fetchedAtMs: Date.now() };
  return value;
}

export function formatUsd(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function ethToUsd(eth: bigint, ethUsdPrice: number) {
  const ethFloat = Number(ethers.formatEther(eth));
  return ethFloat * ethUsdPrice;
}

