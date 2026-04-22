import { useState, useEffect, useCallback, useRef } from "react";
import { useContract } from "./useContract";
import { getStatus, isPast, CATEGORIES } from "./utils";
import Header from "./components/Header";
import HeroSection from "./components/HeroSection";
import CategoryBar from "./components/CategoryBar";
import CreateCampaign from "./components/CreateCampaign";
import CampaignCard from "./components/CampaignCard";
import CampaignModal from "./components/CampaignModal";
import MyCampaigns from "./components/MyCampaigns";
import WalletPrompt from "./components/WalletPrompt";
import ApiDocs from "./components/ApiDocs";
import styles from "./App.module.css";

function prettyNetworkName(name) {
  return { sepolia: "Sepolia", mainnet: "Ethereum Mainnet", localhost: "Hardhat Local", hardhat: "Hardhat Local" }[name] || name;
}

const SORT_OPTIONS = [
  { value: "recent",       label: "Most Recent" },
  { value: "ending-soon",  label: "Ending Soonest" },
  { value: "most-funded",  label: "Most Funded" },
  { value: "most-popular", label: "Most Popular" },
];

export default function App() {
  // Simple pathname-based routing — no React Router dep.
  if (typeof window !== "undefined" && window.location.pathname === "/api-docs") {
    return <ApiDocs />;
  }
  return <MainApp />;
}

function MainApp() {
  const {
    contract, readContract, usdc, account, connecting, error, connect,
    chainId, expectedChainId, expectedNetworkName, isWrongNetwork,
  } = useContract();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);

  // Wallet prompt
  const [walletPromptOpen,   setWalletPromptOpen]   = useState(false);
  const [walletPromptReason, setWalletPromptReason] = useState("");

  // Navigation
  const [tab, setTab] = useState("explore");

  // Filters
  const [searchQuery,    setSearchQuery]    = useState("");
  const [statusFilter,   setStatusFilter]   = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sort,           setSort]           = useState("recent");

  // UI state
  const [createOpen,       setCreateOpen]       = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [pastOpen,         setPastOpen]         = useState(false);

  const autoRefundFired = useRef(new Set());
  const gridSectionRef  = useRef(null);
  const skipScrollOnce  = useRef(true);

  // Show wallet prompt instead of gating the UI
  const onConnectPrompt = useCallback((reason = "") => {
    setWalletPromptReason(reason);
    setWalletPromptOpen(true);
  }, []);

  // ── Load campaigns ────────────────────────────────────────────────────────
  const loadCampaigns = useCallback(async () => {
    const rc = contract || readContract;
    if (!rc) return;
    setLoading(true);
    try {
      const count = Number(await rc.campaignCount());
      const items = await Promise.all(
        Array.from({ length: count }, async (_, i) => {
          const c = await rc.getCampaign(i);
          return {
            id: i,
            creator: c[0], title: c[1], description: c[2],
            category: c[3], imageUrl: c[4], goal: c[5],
            deadline: c[6], amountRaised: c[7],
            claimed: c[8], refundsProcessed: c[9],
            donorCount: Number(c[10]),
            currency: Number(c[11]), // 0 = ETH, 1 = USDC
          };
        })
      );
      setCampaigns(items.reverse());
    } catch (e) {
      console.error("Failed to load campaigns:", e);
    } finally {
      setLoading(false);
    }
  }, [contract, readContract]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  // ── Auto-trigger processRefunds ───────────────────────────────────────────
  useEffect(() => {
    if (!contract || campaigns.length === 0) return;
    const now = Date.now() / 1000;
    campaigns.forEach((c) => {
      if (!c.refundsProcessed && now > Number(c.deadline) && c.amountRaised < c.goal
          && !autoRefundFired.current.has(c.id)) {
        autoRefundFired.current.add(c.id);
        contract.processRefunds(c.id)
          .then((tx) => tx.wait())
          .then(() => loadCampaigns())
          .catch(() => {});
      }
    });
  }, [campaigns, contract, loadCampaigns]);

  // ── URL deep-link ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (campaigns.length === 0) return;
    const id = parseInt(new URLSearchParams(window.location.search).get("campaign"), 10);
    if (!isNaN(id)) {
      const found = campaigns.find((c) => c.id === id);
      if (found && (!selectedCampaign || selectedCampaign.id !== id)) setSelectedCampaign(found);
    }
  }, [campaigns]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep open modal in sync after refresh
  useEffect(() => {
    if (!selectedCampaign) return;
    const fresh = campaigns.find((c) => c.id === selectedCampaign.id);
    if (fresh) setSelectedCampaign(fresh);
  }, [campaigns]); // eslint-disable-line react-hooks/exhaustive-deps

  // Smooth-scroll to grid when user picks a category (skip the initial render)
  useEffect(() => {
    if (skipScrollOnce.current) {
      skipScrollOnce.current = false;
      return;
    }
    if (categoryFilter !== "all") {
      gridSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [categoryFilter]);

  // ── Partition + filter + sort ─────────────────────────────────────────────
  const activeFeed   = campaigns.filter((c) => !isPast(c));
  const pastCampaigns = campaigns.filter((c) => isPast(c));

  const categoryCounts = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = activeFeed.filter((c) => c.category === cat).length;
    return acc;
  }, {});

  const filtered = activeFeed
    .filter((c) => {
      const statusOk = statusFilter === "all" || getStatus(c) === statusFilter;
      const catOk    = categoryFilter === "all" || c.category === categoryFilter;
      const q        = searchQuery.trim().toLowerCase();
      const searchOk = !q || c.title.toLowerCase().includes(q) ||
                       c.description.toLowerCase().includes(q) ||
                       c.category.toLowerCase().includes(q);
      return statusOk && catOk && searchOk;
    })
    .sort((a, b) => {
      if (sort === "ending-soon") return Number(a.deadline) - Number(b.deadline);
      if (sort === "most-popular") {
        if (b.amountRaised > a.amountRaised) return 1;
        if (b.amountRaised < a.amountRaised) return -1;
        return 0;
      }
      if (sort === "most-funded") {
        // Compare progress% without BigInt→Number precision loss.
        const diff = b.amountRaised * a.goal - a.amountRaised * b.goal;
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      }
      return b.id - a.id; // recent (default): newest campaign id first
    });

  return (
    <div className={styles.app}>
      <Header
        account={account}
        connecting={connecting}
        onConnect={connect}
        onOpenCreate={() => account ? setCreateOpen(true) : onConnectPrompt("create a campaign")}
        tab={tab}
        onTabChange={setTab}
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
      />

      {/* Hero is full-width, outside the constrained main container */}
      {tab === "explore" && (
        <HeroSection account={account} connecting={connecting} onConnect={connect} />
      )}

      <main className={styles.main}>
        {error && <div className={styles.alertError}>{error}</div>}

        {isWrongNetwork && (
          <div className={styles.alertWarn}>
            <strong>Wrong network.</strong>{" "}
            This deployment is on <code>{expectedNetworkName}</code> (chain {expectedChainId}),
            but MetaMask is connected to chain <code>{chainId}</code>.
            Open MetaMask and switch to <strong>{prettyNetworkName(expectedNetworkName)}</strong> to donate or create campaigns.
          </div>
        )}

        {/* ── Explore tab ── */}
        {tab === "explore" && (
          <>
            <CategoryBar
              counts={categoryCounts}
              selected={categoryFilter}
              onSelect={setCategoryFilter}
            />

            {/* Status row */}
            <div className={styles.filterRow}>
              <div className={styles.statusPills}>
                {[
                  { key: "all",       label: "All" },
                  { key: "active",    label: "Active" },
                  { key: "claimable", label: "Claim Available" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    className={`${styles.statusPill} ${statusFilter === key ? styles.statusActive : ""}`}
                    onClick={() => setStatusFilter(key)}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* Sort row */}
            <div className={styles.sortRow}>
              <span className={styles.sortLabel}>Sort by</span>
              <div className={styles.sortPills}>
                {SORT_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    className={`${styles.sortPill} ${sort === value ? styles.sortPillActive : ""}`}
                    onClick={() => setSort(value)}
                    type="button"
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* Section heading */}
            <div ref={gridSectionRef} className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>
                {categoryFilter === "all" ? "Fund the Future." : `Showing: ${categoryFilter}`}
              </h2>
              {!loading && (
                <span className={styles.count}>{filtered.length} project{filtered.length !== 1 ? "s" : ""}</span>
              )}
            </div>

            {/* Campaign grid */}
            {loading ? (
              <div className={styles.loadingState}>
                <div className={styles.loadingSpinner} />
                <p>Loading campaigns…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className={styles.empty}>
                <span className={styles.emptyIcon}>🌱</span>
                {categoryFilter !== "all" ? (
                  <>
                    <p>No campaigns in this category yet.</p>
                    <p className={styles.emptySub}>Be the first to create one!</p>
                  </>
                ) : (
                  <>
                    <p>No campaigns found.</p>
                    {!searchQuery && statusFilter === "all" && (
                      <p className={styles.emptySub}>
                        {account ? 'Hit "+ Create Campaign" to launch the first one!' : "Connect your wallet to get started."}
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className={styles.grid}>
                {filtered.map((c) => (
                  <CampaignCard key={c.id} campaign={c} contract={contract} usdc={usdc} account={account}
                    onRefresh={loadCampaigns} onOpenModal={setSelectedCampaign}
                    onConnectPrompt={onConnectPrompt} />
                ))}
              </div>
            )}

            {/* Past campaigns */}
            {pastCampaigns.length > 0 && (
              <div className={styles.pastSection}>
                <button className={styles.pastToggle} onClick={() => setPastOpen((o) => !o)}>
                  <span className={styles.pastChevron}>{pastOpen ? "▾" : "▸"}</span>
                  Past Campaigns
                  <span className={styles.pastCount}>{pastCampaigns.length}</span>
                </button>
                {pastOpen && (
                  <div className={styles.grid} style={{ marginTop: 20 }}>
                    {pastCampaigns.map((c) => (
                      <CampaignCard key={c.id} campaign={c} contract={contract} account={account}
                        onRefresh={loadCampaigns} onOpenModal={setSelectedCampaign}
                        onConnectPrompt={onConnectPrompt} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── My Campaigns tab ── */}
        {tab === "my-campaigns" && (
          <MyCampaigns campaigns={campaigns} contract={contract} account={account}
            onRefresh={loadCampaigns} onOpenModal={setSelectedCampaign} />
        )}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.footerBrand}>⬡ FundChain</span>
          <span>Decentralized crowdfunding · 5% platform fee on successful campaigns.</span>
        </div>
      </footer>

      {/* Modals */}
      <CreateCampaign
        contract={contract}
        onCreated={loadCampaigns}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      {selectedCampaign && (
        <CampaignModal
          campaign={selectedCampaign}
          contract={contract}
          usdc={usdc}
          account={account}
          onClose={() => setSelectedCampaign(null)}
          onRefresh={loadCampaigns}
          onConnectPrompt={onConnectPrompt}
        />
      )}

      <WalletPrompt
        open={walletPromptOpen}
        reason={walletPromptReason}
        onConnect={() => { setWalletPromptOpen(false); connect(); }}
        onClose={() => setWalletPromptOpen(false)}
      />
    </div>
  );
}
