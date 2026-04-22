import { useState } from "react";
import { ethers } from "ethers";
import { getStatus, formatEth, formatAmount, formatDate, timeLeft, progressPct, isPast } from "../utils";
import styles from "./MyCampaigns.module.css";

function StatCard({ value, label }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

export default function MyCampaigns({ campaigns, contract, account, onRefresh, onOpenModal }) {
  const [claiming, setClaiming] = useState(null); // id being claimed

  const mine = campaigns.filter(
    (c) => c.creator?.toLowerCase() === account?.toLowerCase()
  );

  // Aggregate totals scoped to ETH campaigns only — mixing 1e18 wei and 1e6
  // USDC base units in one sum would be nonsense.
  const ethMine = mine.filter((c) => c.currency !== 1);
  const totalRaised = ethMine.reduce((s, c) => s + c.amountRaised, 0n);
  const totalFees = ethMine
    .filter((c) => c.claimed)
    .reduce((s, c) => s + (c.amountRaised * 500n) / 10000n, 0n);

  async function handleClaim(id, e) {
    e.stopPropagation();
    setClaiming(id);
    try {
      const tx = await contract.claimFunds(id);
      await tx.wait();
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setClaiming(null);
    }
  }

  if (!account) {
    return (
      <div className={styles.empty}>
        <p>Connect your wallet to see your campaigns.</p>
      </div>
    );
  }

  if (mine.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>🚀</span>
        <p>You haven't created any campaigns yet.</p>
        <p className={styles.emptySub}>Switch to Explore and hit "+ Create Campaign" to get started.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {/* Summary */}
      <div className={styles.summary}>
        <StatCard value={mine.length} label="Campaigns launched" />
        <StatCard value={`${formatEth(totalRaised)} ETH`} label="Total raised" />
        <StatCard value={`${formatEth(totalFees)} ETH`} label="Platform fees paid" />
      </div>

      {/* Campaign rows */}
      <div className={styles.list}>
        {mine.map((c) => {
          const status = getStatus(c);
          const progress = progressPct(c);
          const deadlinePassed = Date.now() / 1000 > Number(c.deadline);
          const statusLabel = {
            active: "Active", claimable: "Claim Available", completed: "Completed",
            failed: "Failed", refunded: "Failed",
          }[status];

          return (
            <div key={c.id} className={styles.row} onClick={() => onOpenModal(c)}>
              {/* Image / Placeholder */}
              <div className={styles.thumb}>
                {c.imageUrl
                  ? <img src={c.imageUrl} alt={c.title} className={styles.thumbImg} />
                  : <div className={styles.thumbPlaceholder} />}
              </div>

              <div className={styles.info}>
                <div className={styles.rowTop}>
                  <span className={styles.rowTitle}>{c.title}</span>
                  <span className={`badge badge-${status}`}>{statusLabel}</span>
                </div>

                {c.category && <span className={styles.rowCategory}>{c.category}</span>}

                {/* Mini progress bar */}
                <div className={styles.miniBar}>
                  <div
                    className={styles.miniFill}
                    style={{
                      width: `${progress}%`,
                      background: status === "failed" ? "var(--danger)" : undefined,
                    }}
                  />
                </div>

                <div className={styles.rowMeta}>
                  <span>
                    <strong>{formatAmount(c.amountRaised, c.currency)}</strong> of {formatAmount(c.goal, c.currency)}
                    <span className={styles.pct}> · {progress}%</span>
                  </span>
                  <span>
                    {deadlinePassed ? `Ended ${formatDate(c.deadline)}` : timeLeft(c.deadline)}
                  </span>
                </div>
              </div>

              {/* Quick action */}
              <div className={styles.rowAction} onClick={(e) => e.stopPropagation()}>
                {status === "claimable" && (
                  <button
                    className="btn btn-success"
                    onClick={(e) => handleClaim(c.id, e)}
                    disabled={claiming === c.id}
                  >
                    {claiming === c.id ? <><span className="spinner" /> Claiming…</> : "Claim"}
                  </button>
                )}
                {status === "completed" && (
                  <span className={styles.resolvedTag}>Claimed</span>
                )}
                {(status === "failed" || status === "refunded") && (
                  <span className={styles.resolvedTag}>
                    {c.refundsProcessed ? "Refunded" : "Refunding…"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
