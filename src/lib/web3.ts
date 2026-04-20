import { BrowserProvider, JsonRpcProvider, ethers } from "ethers";

export const SEPOLIA_CHAIN_ID_DEC = 11155111;
export const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";
const DEFAULT_PUBLIC_SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

export type InjectedEthereumProvider = {
  isMetaMask?: boolean;
  providers?: InjectedEthereumProvider[];
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (eventName: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (eventName: string, handler: (...args: unknown[]) => void) => void;
};

export function getInjectedProvider(): InjectedEthereumProvider | null {
  if (typeof window === "undefined") {
    return null;
  }

  const injected = window.ethereum as InjectedEthereumProvider | undefined;
  if (!injected) {
    return null;
  }

  if (Array.isArray(injected.providers) && injected.providers.length > 0) {
    return injected.providers.find((p) => p.isMetaMask) ?? injected.providers[0] ?? null;
  }

  return injected;
}

export async function connectWallet(): Promise<string[]> {
  try {
    const injectedProvider = getInjectedProvider();
    if (!injectedProvider) {
      throw new Error("MetaMask is not installed");
    }

    const currentChainId = (await injectedProvider.request({
      method: "eth_chainId",
    })) as string;

    if (currentChainId !== SEPOLIA_CHAIN_ID_HEX) {
      try {
        await injectedProvider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
        });
      } catch (switchError: unknown) {
        const error = switchError as { code?: number };
        if (error.code === 4902) {
          await injectedProvider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: SEPOLIA_CHAIN_ID_HEX,
                chainName: "Sepolia",
                nativeCurrency: {
                  name: "Sepolia ETH",
                  symbol: "ETH",
                  decimals: 18,
                },
                rpcUrls: [process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || DEFAULT_PUBLIC_SEPOLIA_RPC],
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              },
            ],
          });
        } else {
          throw switchError;
        }
      }
    }

    const accounts = (await injectedProvider.request({
      method: "eth_requestAccounts",
    })) as string[];

    return accounts;
  } catch (error) {
    console.error("connectWallet error:", error);
    throw error;
  }
}

export function getProvider(): BrowserProvider {
  const injectedProvider = getInjectedProvider();
  if (!injectedProvider) {
    throw new Error("MetaMask is not installed");
  }
  return new ethers.BrowserProvider(injectedProvider);
}

export function getPublicProvider(): JsonRpcProvider {
  const rpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || DEFAULT_PUBLIC_SEPOLIA_RPC;
  return new JsonRpcProvider(rpcUrl);
}

export async function getSigner() {
  try {
    const provider = getProvider();
    return await provider.getSigner();
  } catch (error) {
    console.error("getSigner error:", error);
    throw error;
  }
}

export async function getBalance(address: string): Promise<string> {
  try {
    const provider = getInjectedProvider() ? getProvider() : getPublicProvider();
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  } catch (error) {
    console.error("getBalance error:", error);
    throw error;
  }
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
