import { useState, useEffect } from "react";
import {
  getStatus, formatDate, timeLeft, progressPct,
  formatAmount, currencySymbol, parseAmount,
} from "../utils";
import ShareButton from "./ShareButton";
import styles from "./CampaignModal.module.css";

export default function CampaignModal({ campaign, contract, usdc, account, onClose, onRefresh, onConnectPrompt }) {
  const [donateAmount, setDonateAmount] = useState("");
  const [donating, setDonating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [err, setErr] = useState(null);
  const [txMsg, setTxMsg] = useState(null);
  const isUsdc = campaign.currency === 1;

  const status = getStatus(campaign);
  const progress = progressPct(campaign);
  const isCreator = account?.toLowerCase() === campaign.creator?.toLowerCase();
  const deadlinePassed = Date.now() / 1000 > Number(campaign.deadline);

  // Close on ESC
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Push campaign id into URL so the link can be shared
  useEffect(() => {
    const url = new URL(window.location);
    url.searchParams.set("campaign", campaign.id);
    window.history.replaceState(null, "", url);
    return () => {
      const clean = new URL(window.location);
      clean.searchParams.delete("campaign");
      window.history.replaceState(null, "", clean);
    };
  }, [campaign.id]);

  async function handleDonate(e) {
    e.preventDefault();
    setErr(null); setTxMsg(null);

    let amountBase;
    try {
      amountBase = parseAmount(donateAmount, campaign.currency);
    } catch {
      setErr("Invalid donation amount.");
      return;
    }

    if (isUsdc) {
      if (!usdc) { setErr("USDC contract not configured — redeploy and refresh."); return; }

      // 1. Balance check — fail fast if the wallet doesn't have enough USDC.
      try {
        const balance = await usdc.balanceOf(account);
        if (balance < amountBase) {
          setErr("Insufficient USDC balance");
          return;
        }
      } catch (err) {
        setErr(`Could not read USDC balance: ${err.reason || err.shortMessage || err.message}`);
        return;
      }

      // 2. Approve (only if existing allowance is too low). Wait for confirmation
      //    BEFORE sending the donate tx — otherwise donate reverts with CALL_EXCEPTION
      //    because the Crowdfund can't transferFrom more than its allowance.
      try {
        const allowance = await usdc.allowance(account, contract.target);
        if (allowance < amountBase) {
          setApproving(true);
          const approveTx = await usdc.approve(contract.target, amountBase);
          await approveTx.wait();
          setApproving(false);
        }
      } catch (err) {
        setApproving(false);
        setErr(`Approval failed: ${err.reason || err.shortMessage || err.message}`);
        return;
      }

      // 3. Donate. At this point the allowance is guaranteed ≥ amount.
      try {
        setDonating(true);
        const tx = await contract.donate(campaign.id, amountBase);
        await tx.wait();
      } catch (err) {
        setErr(`Donation failed: ${err.reason || err.shortMessage || err.message}`);
        return;
      } finally {
        setDonating(false);
      }
    } else {
      // ETH path — single tx, amount flows via msg.value.
      try {
        setDonating(true);
        const tx = await contract.donate(campaign.id, 0, { value: amountBase });
        await tx.wait();
      } catch (err) {
        setErr(`Donation failed: ${err.reason || err.shortMessage || err.message}`);
        return;
      } finally {
        setDonating(false);
      }
    }

    setDonateAmount("");
    setTxMsg("Donation successful! Thank you.");
    onRefresh();
  }

  async function handleClaim() {
    setErr(null); setTxMsg(null);
    setClaiming(true);
    try {
      const tx = await contract.claimFunds(campaign.id);
      await tx.wait();
      setTxMsg("Funds claimed successfully!");
      onRefresh();
    } catch (e) {
      setErr(e.reason || e.message || "Claim failed");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        {/* Image / Placeholder */}
        <div className={styles.imageWrap}>
          {campaign.imageUrl ? (
            <img src={campaign.imageUrl} alt={campaign.title} className={styles.image} />
          ) : (
            <div className={styles.imagePlaceholder}>
              <span className={styles.placeholderIcon}>⬡</span>
            </div>
          )}
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
          <div className={styles.imageOverlay}>
            <div className={styles.badges}>
              <span className={`badge badge-${status}`}>
                {status === "active" ? "Active"
                  : status === "claimable" ? "Claim Available"
                  : status === "completed" ? "Completed"
                  : "Failed"}
              </span>
              {campaign.category && (
                <span className={styles.categoryBadge}>{campaign.category}</span>
              )}
              <span className={styles.categoryBadge}>{currencySymbol(campaign.currency)}</span>
            </div>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>{campaign.title}</h2>
            <ShareButton campaign={campaign} compact />
          </div>

          <p className={styles.desc}>{campaign.description}</p>

          {/* Progress */}
          <div className={styles.progressSection}>
            <div className={styles.progressBar} title="80% is the claim threshold">
              <div
                className={styles.progressFill}
                style={{
                  width: `${progress}%`,
                  background: status === "failed" ? "var(--danger)" : undefined,
                }}
              />
              <div className={styles.progressThreshold} aria-hidden="true" />
              <span className={styles.progressThresholdLabel}>80%</span>
            </div>
            <div className={styles.progressStats}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{formatAmount(campaign.amountRaised, campaign.currency)}</span>
                <span className={styles.statLabel}>raised of {formatAmount(campaign.goal, campaign.currency)} goal</span>
              </div>
              <div className={styles.stat} style={{ textAlign: "center" }}>
                <span className={styles.statValue}>{progress}%</span>
                <span className={styles.statLabel}>funded</span>
              </div>
              <div className={styles.stat} style={{ textAlign: "right" }}>
                <span className={styles.statValue}>{campaign.donorCount ?? 0}</span>
                <span className={styles.statLabel}>donor{campaign.donorCount !== 1 ? "s" : ""}</span>
              </div>
            </div>
          </div>

          {/* Time info */}
          <div className={styles.timeRow}>
            <span className={styles.timeIcon}>⏱</span>
            {deadlinePassed
              ? `Deadline passed on ${formatDate(campaign.deadline)}`
              : `${timeLeft(campaign.deadline)} · Deadline: ${formatDate(campaign.deadline)}`}
          </div>

          {/* Creator */}
          <div className={styles.creatorRow}>
            <span className={styles.creatorLabel}>Creator</span>
            <span className={styles.creatorAddr}>{campaign.creator}</span>
          </div>

          {err && <p className={styles.error}>{err}</p>}
          {txMsg && <p className={styles.success}>{txMsg}</p>}

          {/* Actions */}
          <div className={styles.actions}>
            {(status === "active" || status === "claimable") && account && (
              <form onSubmit={handleDonate} className={styles.donateForm}>
                <input
                  type="number"
                  step={isUsdc ? "0.01" : "0.001"}
                  min={isUsdc ? "0.01" : "0.001"}
                  placeholder={`Amount in ${currencySymbol(campaign.currency)}`}
                  value={donateAmount}
                  onChange={(e) => setDonateAmount(e.target.value)}
                  required
                />
                <button type="submit" className="btn btn-primary" disabled={donating || approving}>
                  {approving ? <><span className="spinner" /> Approving…</>
                   : donating ? <><span className="spinner" /> Donating…</>
                   : isUsdc ? "Approve & Donate"
                   : "Donate"}
                </button>
              </form>
            )}

            {(status === "active" || status === "claimable") && !account && (
              <button
                className="btn btn-primary"
                style={{ width: "100%" }}
                onClick={() => onConnectPrompt("donate")}
              >
                Donate
              </button>
            )}

            {status === "claimable" && isCreator && (
              <button className="btn btn-success" onClick={handleClaim} disabled={claiming} style={{ width: "100%" }}>
                {claiming ? <><span className="spinner" /> Claiming…</> : "Claim Funds (95% after platform fee)"}
              </button>
            )}

            {status === "completed" && (
              <div className={styles.resolvedNote}>
                ✓ Funds have been claimed by the creator.
              </div>
            )}

            {(status === "failed" || status === "refunded") && (
              <div className={styles.resolvedNote}>
                {campaign.refundsProcessed
                  ? "✓ All donations have been refunded to donors."
                  : "Campaign failed. Refunds are being processed automatically."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
