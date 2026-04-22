import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { CROWDFUND_ABI, ERC20_ABI } from "./abi";
import contractAddress from "./contract-address.json";

// Map the network name written by the deploy script into the chainId we expect
// MetaMask to be on. Anything not listed falls back to localhost/Hardhat.
const CHAIN_IDS = {
  sepolia:   11155111,
  mainnet:   1,
  localhost: 31337,
  hardhat:   31337,
};
const EXPECTED_CHAIN_ID = CHAIN_IDS[contractAddress.network] ?? 31337;
const EXPECTED_NETWORK_NAME = contractAddress.network;

const FALLBACK_RPC =
  contractAddress.network === "sepolia"
    ? "https://rpc.sepolia.org"
    : "http://127.0.0.1:8545";

// ethers v6 BrowserProvider caches the chainId it was constructed with, so any
// in-flight RPC call after a MetaMask network switch rejects with
// "network changed: X => Y" (code: NETWORK_ERROR). Swallow those at the window
// level — the chainChanged listener will reload the page a beat later.
function isStaleNetworkError(err) {
  return err?.code === "NETWORK_ERROR" || /network changed/i.test(err?.message || "");
}

export function useContract() {
  const [readContract, setReadContract] = useState(null);
  const [readUsdc, setReadUsdc] = useState(null);

  useEffect(() => {
    try {
      const provider = window.ethereum
        ? new ethers.BrowserProvider(window.ethereum)
        : new ethers.JsonRpcProvider(FALLBACK_RPC);
      setReadContract(new ethers.Contract(contractAddress.address, CROWDFUND_ABI, provider));
      if (contractAddress.usdc) {
        setReadUsdc(new ethers.Contract(contractAddress.usdc, ERC20_ABI, provider));
      }
    } catch (e) {
      console.warn("[useContract] could not create read-only provider/contract:", e);
    }
  }, []);

  const [provider, setProvider]   = useState(null);
  const [signer,   setSigner]     = useState(null);
  const [contract, setContract]   = useState(null);
  const [usdc,     setUsdc]       = useState(null);
  const [account,  setAccount]    = useState(null);
  const [chainId,  setChainId]    = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error,    setError]      = useState(null);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("MetaMask not detected. Please install MetaMask.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const _provider = new ethers.BrowserProvider(window.ethereum);
      const accounts  = await _provider.send("eth_requestAccounts", []);
      const _signer   = await _provider.getSigner();
      const network   = await _provider.getNetwork();
      const _contract = new ethers.Contract(contractAddress.address, CROWDFUND_ABI, _signer);
      const _usdc     = contractAddress.usdc
        ? new ethers.Contract(contractAddress.usdc, ERC20_ABI, _signer)
        : null;

      setProvider(_provider);
      setSigner(_signer);
      setContract(_contract);
      setUsdc(_usdc);
      setAccount(accounts[0]);
      setChainId(Number(network.chainId));
    } catch (e) {
      if (isStaleNetworkError(e)) {
        // The user changed networks mid-connect; the reload below handles it.
        return;
      }
      console.error("[useContract] connect failed:", e);
      setError(e.shortMessage || e.message || "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  }, []);

  // MetaMask events: chainChanged is handled with a hard reload (standard
  // ethers v6 pattern — the cached BrowserProvider can't survive a chain
  // change). accountsChanged we can handle in place.
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      setAccount(accounts[0] || null);
      if (!accounts[0]) { setSigner(null); setContract(null); setUsdc(null); }
    };
    const handleChainChanged = () => {
      // Full reload re-initializes the provider on the new chain cleanly.
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged",    handleChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged",    handleChainChanged);
    };
  }, []);

  // Global safety net: any in-flight RPC rejected by ethers with NETWORK_ERROR
  // after a chain switch shouldn't show up as a scary unhandled rejection in
  // DevTools. The chainChanged reload handles the state reset.
  useEffect(() => {
    const onUnhandled = (event) => {
      if (isStaleNetworkError(event.reason)) {
        console.warn("[useContract] swallowing stale NETWORK_ERROR (reload pending)");
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => window.removeEventListener("unhandledrejection", onUnhandled);
  }, []);

  const isWrongNetwork = chainId !== null && chainId !== EXPECTED_CHAIN_ID;

  return {
    provider, signer, contract, readContract,
    usdc, readUsdc,
    account, chainId, connecting, error, connect,
    expectedChainId: EXPECTED_CHAIN_ID,
    expectedNetworkName: EXPECTED_NETWORK_NAME,
    isWrongNetwork,
  };
}
