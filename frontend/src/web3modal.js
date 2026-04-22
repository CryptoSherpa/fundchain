// Web3Modal v3 (ethers flavour) — must be imported before <App /> mounts so the
// modal web-components are registered and session state is restored.
import { createWeb3Modal, defaultConfig } from "@web3modal/ethers/react";
import contractAddress from "./contract-address.json";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "";

const NETWORKS = {
  sepolia: {
    chainId: 11155111,
    name: "Sepolia",
    currency: "ETH",
    explorerUrl: "https://sepolia.etherscan.io",
    rpcUrl: import.meta.env.VITE_ALCHEMY_RPC_URL || "https://rpc.sepolia.org",
  },
  mainnet: {
    chainId: 1,
    name: "Ethereum",
    currency: "ETH",
    explorerUrl: "https://etherscan.io",
    rpcUrl: "https://cloudflare-eth.com",
  },
  localhost: {
    chainId: 31337,
    name: "Hardhat Local",
    currency: "ETH",
    explorerUrl: "",
    rpcUrl: "http://127.0.0.1:8545",
  },
};
const chain = NETWORKS[contractAddress.network] ?? NETWORKS.localhost;

const metadata = {
  name: "FundChain",
  description:
    "The first crowdfunding platform built for humans and AI agents. Powered by Ethereum. x402 ready.",
  url: typeof window !== "undefined" ? window.location.origin : "https://fundchain.vercel.app",
  icons: [
    typeof window !== "undefined"
      ? `${window.location.origin}/favicon.svg`
      : "https://fundchain.vercel.app/favicon.svg",
  ],
};

// Without a projectId, Web3Modal would throw at init. Skip in that case so the
// rest of the app (read-only views) can still load on misconfigured deploys —
// the connect button will surface a friendly error instead.
if (projectId) {
  createWeb3Modal({
    ethersConfig: defaultConfig({
      metadata,
      defaultChainId: chain.chainId,
      rpcUrl: chain.rpcUrl,
      enableEIP6963: true,
      enableInjected: true,
      enableCoinbase: true,
    }),
    chains: [chain],
    projectId,
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "#00c896",
      "--w3m-border-radius-master": "2px",
      "--w3m-font-family": "Inter, system-ui, sans-serif",
    },
    // MetaMask, Coinbase Wallet, Phantom — surfaced at the top of the list.
    featuredWalletIds: [
      "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96",
      "fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa",
      "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393",
    ],
  });
} else if (typeof window !== "undefined") {
  console.warn(
    "[web3modal] VITE_WALLETCONNECT_PROJECT_ID is not set — wallet connect modal disabled."
  );
}

export const WALLETCONNECT_CONFIGURED = Boolean(projectId);
export const EXPECTED_CHAIN = chain;
