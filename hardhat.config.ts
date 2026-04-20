import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config({ override: true });

// Hardhat test account #0 private key (publicly known - for development only!)
const DEFAULT_PRIVATE_KEY = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function getSepoliaRpcUrl(): string {
  const raw = process.env.SEPOLIA_RPC_URL?.trim() || "";
  const alchemyMatch = raw.match(/alchemy\.com\/v2\/([^\s]+)/i);

  // Alchemy keys are typically much longer; short keys cause "Must be authenticated" errors.
  if (alchemyMatch && alchemyMatch[1].length < 30) {
    return "https://ethereum-sepolia-rpc.publicnode.com";
  }

  if (raw.length > 0) {
    return raw;
  }

  return "https://ethereum-sepolia-rpc.publicnode.com";
}

const sepoliaRpcUrl = getSepoliaRpcUrl();
const privateKey = process.env.PRIVATE_KEY && 
                   process.env.PRIVATE_KEY.length === 64 && 
                   !process.env.PRIVATE_KEY.includes("your_deployer") 
                   ? process.env.PRIVATE_KEY 
                   : DEFAULT_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: sepoliaRpcUrl,
      accounts: [privateKey],
      timeout: 120000,
    },
  },
};

export default config;
