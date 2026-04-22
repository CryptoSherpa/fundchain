import styles from "./Header.module.css";

const ChainIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="chainGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop stopColor="#00c896" />
        <stop offset="1" stopColor="#00e8ff" />
      </linearGradient>
    </defs>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
      stroke="url(#chainGrad)" strokeWidth="2" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
      stroke="url(#chainGrad)" strokeWidth="2" />
  </svg>
);

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

export default function Header({ account, connecting, onConnect, onOpenCreate, tab, onTabChange, searchQuery, onSearch }) {
  const short = account ? `${account.slice(0, 6)}…${account.slice(-4)}` : null;

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        {/* Left: Logo + tabs */}
        <div className={styles.left}>
          <div className={styles.brand}>
            <ChainIcon />
            <span className={styles.brandName}>FundChain</span>
            <a
              className={styles.aiBadge}
              href="/api-docs"
              title="FundChain exposes its smart contract directly — AI agents can read and write on-chain. Click for docs."
            >
              AI Agent Compatible
            </a>
          </div>
          <nav className={styles.tabs}>
            <button
              className={`${styles.tab} ${tab === "explore" ? styles.tabActive : ""}`}
              onClick={() => onTabChange("explore")}
            >
              Explore
            </button>
            <button
              className={`${styles.tab} ${tab === "my-campaigns" ? styles.tabActive : ""}`}
              onClick={() => onTabChange("my-campaigns")}
            >
              My Campaigns
            </button>
          </nav>
        </div>

        {/* Center: Search */}
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}><SearchIcon /></span>
          <input
            className={styles.search}
            type="text"
            placeholder="Search projects…"
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>

        {/* Right: wallet + create */}
        <div className={styles.right}>
          {account ? (
            <div className={styles.wallet}>
              <span className={styles.walletDot} />
              <span className={styles.walletAddr}>{short}</span>
            </div>
          ) : (
            <button className={`btn btn-outline ${styles.connectBtn}`} onClick={onConnect} disabled={connecting}>
              {connecting ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
              {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
          )}
          <button className={`btn btn-orange ${styles.createBtn}`} onClick={onOpenCreate}>
            + Create Campaign
          </button>
        </div>
      </div>
    </header>
  );
}
