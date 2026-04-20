import { ethers } from "ethers";

type EnvStatus = {
  contractAddress: string | null;
  contractAddressValid: boolean;
  sepoliaRpcUrl: string;
  deployBlock: number | null;
};

const DEFAULT_PUBLIC_SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

export function getEnvStatus(): EnvStatus {
  const contractAddressRaw = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? null;
  const contractAddress = contractAddressRaw?.trim() ? contractAddressRaw.trim() : null;
  const contractAddressValid = contractAddress ? ethers.isAddress(contractAddress) : false;

  const sepoliaRpcUrl = (process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || DEFAULT_PUBLIC_SEPOLIA_RPC).trim();

  const deployBlockRaw = process.env.NEXT_PUBLIC_DEPLOY_BLOCK?.trim();
  const deployBlockParsed = deployBlockRaw ? Number(deployBlockRaw) : NaN;
  const deployBlock =
    Number.isFinite(deployBlockParsed) && deployBlockParsed > 0 ? Math.floor(deployBlockParsed) : null;

  return { contractAddress, contractAddressValid, sepoliaRpcUrl, deployBlock };
}

export function requireContractAddress(): string {
  const { contractAddress, contractAddressValid } = getEnvStatus();
  if (!contractAddress) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS is not set");
  if (!contractAddressValid) {
    throw new Error(
      "NEXT_PUBLIC_CONTRACT_ADDRESS is invalid. Set it to your deployed Sepolia contract address (0x...)."
    );
  }
  return contractAddress;
}

