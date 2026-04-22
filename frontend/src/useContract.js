import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  useWeb3Modal,
  useWeb3ModalAccount,
  useWeb3ModalProvider,
  useDisconnect,
} from "@web3modal/ethers/react";
import { CROWDFUND_ABI, ERC20_ABI } from "./abi";
import contractAddress from "./contract-address.json";
import { EXPECTED_CHAIN, WALLETCONNECT_CONFIGURED } from "./web3modal";

const EXPECTED_CHAIN_ID = EXPECTED_CHAIN.chainId;
const EXPECTED_NETWORK_NAME = contractAddress.network;
const FALLBACK_RPC = EXPECTED_CHAIN.rpcUrl;

// ethers v6 BrowserProvider caches the chainId it was constructed with, so any
// in-flight RPC call after a wallet network switch rejects with
// "network changed: X => Y" (code: NETWORK_ERROR). Web3Modal triggers a
// re-render and we rebuild the provider, but swallow those unhandled rejections
// so DevTools stays quiet.
function isStaleNetworkError(err) {
  return err?.code === "NETWORK_ERROR" || /network changed/i.test(err?.message || "");
}

export function useContract() {
  const { open } = useWeb3Modal();
  const { disconnect } = useDisconnect();
  const { address, chainId: connectedChainId, isConnected } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();

  const [readContract, setReadContract] = useState(null);
  const [readUsdc, setReadUsdc] = useState(null);

  const [provider, setProvider]   = useState(null);
  const [signer,   setSigner]     = useState(null);
  const [contract, setContract]   = useState(null);
  const [usdc,     setUsdc]       = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error,    setError]      = useState(null);

  // Read-only provider — uses Alchemy if configured, else the chain's public RPC.
  // Independent of the connected wallet so public reads work even when signed
  // out, or if the wallet is on the wrong chain.
  useEffect(() => {
    try {
      const rpcUrl = import.meta.env.VITE_ALCHEMY_RPC_URL || FALLBACK_RPC;
      const p = new ethers.JsonRpcProvider(rpcUrl);
      setReadContract(new ethers.Contract(contractAddress.address, CROWDFUND_ABI, p));
      if (contractAddress.usdc) {
        setReadUsdc(new ethers.Contract(contractAddress.usdc, ERC20_ABI, p));
      }
    } catch (e) {
      console.warn("[useContract] could not create read-only provider/contract:", e);
    }
  }, []);

  // Wallet-signer provider — rebuilt whenever the connected wallet or chain changes.
  useEffect(() => {
    let cancelled = false;
    async function setup() {
      if (!walletProvider || !isConnected) {
        setProvider(null); setSigner(null); setContract(null); setUsdc(null);
        return;
      }
      try {
        const p = new ethers.BrowserProvider(walletProvider);
        const s = await p.getSigner();
        if (cancelled) return;
        setProvider(p);
        setSigner(s);
        setContract(new ethers.Contract(contractAddress.address, CROWDFUND_ABI, s));
        setUsdc(
          contractAddress.usdc
            ? new ethers.Contract(contractAddress.usdc, ERC20_ABI, s)
            : null
        );
      } catch (e) {
        if (cancelled || isStaleNetworkError(e)) return;
        console.error("[useContract] signer setup failed:", e);
        setError(e.shortMessage || e.message || "Failed to load wallet signer");
      }
    }
    setup();
    return () => { cancelled = true; };
  }, [walletProvider, isConnected, connectedChainId]);

  const connect = useCallback(async () => {
    setError(null);
    if (!WALLETCONNECT_CONFIGURED) {
      setError(
        "Wallet connect is not configured (missing VITE_WALLETCONNECT_PROJECT_ID)."
      );
      return;
    }
    setConnecting(true);
    try {
      await open();
    } catch (e) {
      if (!isStaleNetworkError(e)) {
        setError(e.shortMessage || e.message || "Failed to connect wallet");
      }
    } finally {
      setConnecting(false);
    }
  }, [open]);

  // Swallow stale NETWORK_ERROR rejections from in-flight reads that race a
  // chain switch — the effect above rebuilds the provider on the next render.
  useEffect(() => {
    const onUnhandled = (event) => {
      if (isStaleNetworkError(event.reason)) {
        console.warn("[useContract] swallowing stale NETWORK_ERROR");
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => window.removeEventListener("unhandledrejection", onUnhandled);
  }, []);

  const chainId = connectedChainId ?? null;
  const isWrongNetwork = chainId !== null && chainId !== EXPECTED_CHAIN_ID;

  return {
    provider, signer, contract, readContract,
    usdc, readUsdc,
    account: address ?? null,
    chainId,
    connecting, error, connect, disconnect,
    expectedChainId: EXPECTED_CHAIN_ID,
    expectedNetworkName: EXPECTED_NETWORK_NAME,
    isWrongNetwork,
  };
}
