import { useState, useEffect, useCallback, useMemo } from "react";
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

// Build the read-only RPC client once at module load. This path is completely
// independent of window.ethereum / Web3Modal / any injected wallet — it talks
// directly to Alchemy (or the configured fallback) over fetch. That matters
// for mobile Safari, where there is no injected wallet at all: this is the
// only way campaigns load before the user opts to connect.
//
// The fallback (cloudflare-eth on mainnet, rpc.sepolia.org on sepolia) is
// rate-limited and CORS-flaky from mobile networks, so VITE_ALCHEMY_RPC_URL
// should be set in production. We log loudly when it isn't.
const READ_RPC_URL = import.meta.env.VITE_ALCHEMY_RPC_URL || FALLBACK_RPC;
const ALCHEMY_CONFIGURED = Boolean(import.meta.env.VITE_ALCHEMY_RPC_URL);

if (!ALCHEMY_CONFIGURED && typeof window !== "undefined") {
  console.warn(
    `[useContract] VITE_ALCHEMY_RPC_URL is not set — falling back to public RPC (${READ_RPC_URL}). ` +
    `Public RPCs are rate-limited and may CORS-fail on mobile networks; set Alchemy in env to fix.`
  );
}

const READ_PROVIDER = (() => {
  try {
    // staticNetwork skips the eth_chainId auto-detect round-trip on every call,
    // and prevents ethers from polling for chain changes on a read-only RPC.
    const p = new ethers.JsonRpcProvider(
      READ_RPC_URL,
      { name: EXPECTED_NETWORK_NAME, chainId: EXPECTED_CHAIN_ID },
      { staticNetwork: true }
    );
    if (typeof window !== "undefined") {
      console.log(
        `[useContract] read-only provider ready (chainId=${EXPECTED_CHAIN_ID}, ` +
        `alchemy=${ALCHEMY_CONFIGURED})`
      );
    }
    return p;
  } catch (e) {
    console.error("[useContract] FATAL: could not create read-only provider:", e);
    return null;
  }
})();

const READ_CONTRACT = READ_PROVIDER
  ? new ethers.Contract(contractAddress.address, CROWDFUND_ABI, READ_PROVIDER)
  : null;
const READ_USDC = READ_PROVIDER && contractAddress.usdc
  ? new ethers.Contract(contractAddress.usdc, ERC20_ABI, READ_PROVIDER)
  : null;

if (!READ_CONTRACT && typeof window !== "undefined") {
  console.error(
    "[useContract] read-only contract is null — campaigns will not load. " +
    "Check VITE_ALCHEMY_RPC_URL and contract-address.json."
  );
}

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

  // Stable refs to the module-scope read-only contracts — exposed via the hook
  // so callers can depend on them in useCallback/useEffect deps lists.
  const readContract = useMemo(() => READ_CONTRACT, []);
  const readUsdc     = useMemo(() => READ_USDC, []);

  const [provider, setProvider]   = useState(null);
  const [signer,   setSigner]     = useState(null);
  const [contract, setContract]   = useState(null);
  const [usdc,     setUsdc]       = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error,    setError]      = useState(null);

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
