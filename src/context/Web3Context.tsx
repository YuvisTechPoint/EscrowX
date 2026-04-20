"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { BrowserProvider, Contract, isAddress } from "ethers";
import abi from "@/lib/abi.json";
import capsuleAbi from "@/lib/capsuleAbi.json";
import poolAbi from "@/lib/poolAbi.json";
import subscriptionAbi from "@/lib/subscriptionAbi.json";
import { connectWallet, getBalance, getInjectedProvider, SEPOLIA_CHAIN_ID_DEC } from "@/lib/web3";
import type { Web3ContextType } from "@/types";

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

function getValidContractAddress(): string | null {
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (!contractAddress) return null;
  if (!isAddress(contractAddress)) {
    console.warn("Invalid NEXT_PUBLIC_CONTRACT_ADDRESS. Wallet connection will still work.");
    return null;
  }
  return contractAddress;
}

function getCapsuleContractAddress(): string | null {
  const address = process.env.NEXT_PUBLIC_CAPSULE_CONTRACT_ADDRESS;
  if (!address) return null;
  if (!isAddress(address)) {
    console.warn("Invalid NEXT_PUBLIC_CAPSULE_CONTRACT_ADDRESS.");
    return null;
  }
  return address;
}

function getPoolContractAddress(): string | null {
  const address = process.env.NEXT_PUBLIC_POOL_CONTRACT_ADDRESS;
  if (!address) return null;
  if (!isAddress(address)) {
    console.warn("Invalid NEXT_PUBLIC_POOL_CONTRACT_ADDRESS.");
    return null;
  }
  return address;
}

function getSubscriptionContractAddress(): string | null {
  const address = process.env.NEXT_PUBLIC_SUBSCRIPTION_CONTRACT_ADDRESS;
  if (!address) return null;
  if (!isAddress(address)) {
    console.warn("Invalid NEXT_PUBLIC_SUBSCRIPTION_CONTRACT_ADDRESS.");
    return null;
  }
  return address;
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<Web3ContextType["signer"]>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [capsuleContract, setCapsuleContract] = useState<Contract | null>(null);
  const [poolContract, setPoolContract] = useState<Contract | null>(null);
  const [subscriptionContract, setSubscriptionContract] = useState<Contract | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [balance, setBalance] = useState<string>("0");
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  const clearWalletState = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setContract(null);
    setCapsuleContract(null);
    setPoolContract(null);
    setSubscriptionContract(null);
    setAddress(null);
    setBalance("0");
    setChainId(null);
  }, []);

  const initializeProvider = useCallback(async () => {
    try {
      const injectedProvider = getInjectedProvider();
      if (!injectedProvider) {
        return;
      }

      const walletProvider = new BrowserProvider(injectedProvider);
      const network = await walletProvider.getNetwork();

      setProvider(walletProvider);
      setChainId(Number(network.chainId));
    } catch (error) {
      console.error("initializeProvider error:", error);
    }
  }, []);

  const syncConnectedAccount = useCallback(async () => {
    try {
      const injectedProvider = getInjectedProvider();
      if (!injectedProvider) {
        return;
      }

      const walletProvider = new BrowserProvider(injectedProvider);
      const network = await walletProvider.getNetwork();
      const accounts = (await injectedProvider.request({ method: "eth_accounts" })) as string[];

      setProvider(walletProvider);
      setChainId(Number(network.chainId));

      if (accounts.length > 0) {
        const activeSigner = await walletProvider.getSigner();
        const activeAddress = await activeSigner.getAddress();

        setSigner(activeSigner);
        setAddress(activeAddress);

        const contractAddress = getValidContractAddress();
        if (contractAddress) {
          setContract(new Contract(contractAddress, abi, activeSigner));
        } else {
          setContract(null);
        }

        const capsuleAddress = getCapsuleContractAddress();
        if (capsuleAddress) {
          setCapsuleContract(new Contract(capsuleAddress, capsuleAbi, activeSigner));
        } else {
          setCapsuleContract(null);
        }

        const poolAddress = getPoolContractAddress();
        if (poolAddress) {
          setPoolContract(new Contract(poolAddress, poolAbi, activeSigner));
        } else {
          setPoolContract(null);
        }

        const subscriptionAddress = getSubscriptionContractAddress();
        if (subscriptionAddress) {
          setSubscriptionContract(new Contract(subscriptionAddress, subscriptionAbi, activeSigner));
        } else {
          setSubscriptionContract(null);
        }

        const walletBalance = await getBalance(activeAddress);
        setBalance(Number(walletBalance).toFixed(4));
      } else {
        clearWalletState();
      }
    } catch (error) {
      console.error("syncConnectedAccount error:", error);
    }
  }, [clearWalletState]);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      const accounts = await connectWallet();
      if (!accounts.length) {
        throw new Error("No wallet accounts were returned");
      }

      const injectedProvider = getInjectedProvider();
      if (!injectedProvider) {
        throw new Error("MetaMask is not installed");
      }

      const walletProvider = new BrowserProvider(injectedProvider);
      const activeSigner = await walletProvider.getSigner();
      const network = await walletProvider.getNetwork();
      const activeAddress = await activeSigner.getAddress();

      setProvider(walletProvider);
      setSigner(activeSigner);
      setAddress(activeAddress);
      setChainId(Number(network.chainId));

      const contractAddress = getValidContractAddress();
      if (contractAddress) {
        setContract(new Contract(contractAddress, abi, activeSigner));
      } else {
        setContract(null);
      }

      const capsuleAddress = getCapsuleContractAddress();
      if (capsuleAddress) {
        setCapsuleContract(new Contract(capsuleAddress, capsuleAbi, activeSigner));
      } else {
        setCapsuleContract(null);
      }

      const poolAddress = getPoolContractAddress();
      if (poolAddress) {
        setPoolContract(new Contract(poolAddress, poolAbi, activeSigner));
      } else {
        setPoolContract(null);
      }

      const subscriptionAddress = getSubscriptionContractAddress();
      if (subscriptionAddress) {
        setSubscriptionContract(new Contract(subscriptionAddress, subscriptionAbi, activeSigner));
      } else {
        setSubscriptionContract(null);
      }

      const walletBalance = await getBalance(activeAddress);
      setBalance(Number(walletBalance).toFixed(4));
      console.log("Wallet connected:", activeAddress);

      // Keep state consistent with currently authorized account in MetaMask.
      await syncConnectedAccount();
    } catch (error) {
      console.error("connect error:", error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [syncConnectedAccount]);

  const disconnect = useCallback(() => {
    clearWalletState();
    console.log("Disconnected local app state.");
  }, [clearWalletState]);

  const refreshBalance = useCallback(async () => {
    try {
      if (!address) {
        return;
      }
      const walletBalance = await getBalance(address);
      setBalance(Number(walletBalance).toFixed(4));
    } catch (error) {
      console.error("refreshBalance error:", error);
    }
  }, [address]);

  useEffect(() => {
    void initializeProvider();
    // Sync silently if user already authorized this site in MetaMask.
    void syncConnectedAccount();

    const handleAccountsChanged = (accounts: unknown) => {
      const parsedAccounts = accounts as string[];
      if (!parsedAccounts.length) {
        disconnect();
      } else {
        // Keep state in sync even if account was connected outside app UI.
        void syncConnectedAccount();
      }
    };

    const handleChainChanged = () => {
      void syncConnectedAccount();
    };

    const handleConnect = () => {
      void syncConnectedAccount();
    };

    const handleDisconnect = () => {
      disconnect();
    };

    const injectedProvider = getInjectedProvider();
    const canSubscribe =
      !!injectedProvider &&
      typeof injectedProvider.on === "function" &&
      typeof injectedProvider.removeListener === "function";

    if (canSubscribe) {
      injectedProvider.on("accountsChanged", handleAccountsChanged);
      injectedProvider.on("chainChanged", handleChainChanged);
      injectedProvider.on("connect", handleConnect);
      injectedProvider.on("disconnect", handleDisconnect);
    }

    return () => {
      if (canSubscribe && injectedProvider) {
        injectedProvider.removeListener("accountsChanged", handleAccountsChanged);
        injectedProvider.removeListener("chainChanged", handleChainChanged);
        injectedProvider.removeListener("connect", handleConnect);
        injectedProvider.removeListener("disconnect", handleDisconnect);
      }
    };
  }, [disconnect, initializeProvider, syncConnectedAccount]);

  useEffect(() => {
    if (!address) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshBalance();
    }, 15000);

    const handleWindowFocus = () => {
      void refreshBalance();
    };

    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [address, refreshBalance]);

  const value = useMemo<Web3ContextType>(
    () => ({
      provider,
      signer,
      contract,
      capsuleContract,
      poolContract,
      subscriptionContract,
      address,
      chainId,
      balance,
      isConnecting,
      connect,
      disconnect,
      refreshBalance,
    }),
    [provider, signer, contract, capsuleContract, poolContract, subscriptionContract, address, chainId, balance, isConnecting, connect, disconnect, refreshBalance]
  );

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3(): Web3ContextType {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error("useWeb3 must be used within Web3Provider");
  }
  return context;
}

export function isSepolia(chainId: number | null): boolean {
  return chainId === SEPOLIA_CHAIN_ID_DEC;
}
