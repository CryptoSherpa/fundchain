import { useState } from "react";
import {
  getStatus, formatDate, timeLeft, progressPct,
  formatAmount, currencySymbol, parseAmount, canClaim,
} from "../utils";
import ShareButton from "./ShareButton";
import styles from "./CampaignCard.module.css";

export default function CampaignCard({ campaign, contract, usdc, account, onRefresh, onOpenModal, onConnectPrompt }) {
  const [donating, setDonating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [donateAmount, setDonateAmount] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [err, setErr] = useState(null);
  const [txMsg, setTxMsg] = useState(null);

  const status = getStatus(campaign);
  const progress = progressPct(campaign);
  const isCreator = account?.toLowerCase() === campaign.creator?.toLowerCase();
  const deadlinePassed = Date.now() / 1000 > Number(campaign.deadline);
  const isUsdc = campaign.currency === 1;
  const claimOpen = canClaim(campaign);

  async function handleDonate(e) {
    e.preventDefault();
    e.stopPropagation();
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
    setTxMsg("Donated!");
    onRefresh();
  }

  async function handleClaim(e) {
    e.stopPropagation();
    setErr(null); setTxMsg(null);
    setClaiming(true);
    try {
      const tx = await contract.claimFunds(campaign.id);
      await tx.wait();
      setTxMsg("Funds claimed!");
      onRefresh();
    } catch (e) {
      setErr(e.reason || e.message || "Claim failed");
    } finally {
      setClaiming(false);
    }
  }

  const statusLabel = {
    active: "Active",
    "almost-funded": "Almost Funded",
    completed: "Completed",
    failed: "Failed",
    refunded: "Failed",
  }[status];

  const donateBtnLabel = approving
    ? <><span className="spinner" /> Approving…</>
    : donating
    ? <span className="spinner" />
    : "Donate";

  return (
    <div className={styles.card} onClick={() => onOpenModal(campaign)}>
      <div className={styles.imageWrap}>
        {campaign.imageUrl ? (
          <img src={campaign.imageUrl} alt={campaign.title} className={styles.image} />
        ) : (
          <div className={styles.imagePlaceholder} />
        )}
        <span className={`badge badge-${status} ${styles.statusBadge}`}>{statusLabel}</span>
        <span className={styles.currencyBadge}>{currencySymbol(campaign.currency)}</span>
      </div>

      <div className={styles.body}>
        {campaign.category && <span className={styles.category}>{campaign.category}</span>}

        <div className={styles.titleRow}>
          <h3 className={styles.title}>{campaign.title}</h3>
        </div>

        <p className={styles.desc}>{campaign.description}</p>

        <div className={styles.progress}>
          <div className={styles.progressBar} title="80% is the claim threshold">
            <div
              className={styles.progressFill}
              style={{
                width: `${progress}%`,
                background: status === "failed" ? "var(--danger)" : undefined,
              }}
            />
            <div className={styles.progressThreshold} aria-hidden="true" />
          </div>
          <div className={styles.progressStats}>
            <span className={styles.raised}>
              <strong>{formatAmount(campaign.amountRaised, campaign.currency)}</strong> raised
            </span>
            <span className={styles.pct}>{progress}%</span>
          </div>
          {status === "almost-funded" && claimOpen && (
            <p className={styles.thresholdNote}>80% funded — creator can claim</p>
          )}
          {status === "almost-funded" && !claimOpen && (
            <p className={styles.thresholdNote}>Claim available in last 7 days of campaign</p>
          )}
          <div className={styles.meta}>
            <span>Goal: {formatAmount(campaign.goal, campaign.currency)}</span>
            <span>
              {deadlinePassed
                ? `Ended ${formatDate(campaign.deadline)}`
                : timeLeft(campaign.deadline)}
            </span>
          </div>
        </div>

        {err && <p className={styles.error} onClick={(e) => e.stopPropagation()}>{err}</p>}
        {txMsg && <p className={styles.successMsg} onClick={(e) => e.stopPropagation()}>{txMsg}</p>}

        <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
          {(status === "active" || status === "almost-funded") && account && (
            <form onSubmit={handleDonate} className={styles.donateForm}>
              <input
                type="number"
                step={isUsdc ? "0.01" : "0.001"}
                min={isUsdc ? "0.01" : "0.001"}
                placeholder={currencySymbol(campaign.currency)}
                value={donateAmount}
                onChange={(e) => setDonateAmount(e.target.value)}
                required
                className={styles.donateInput}
              />
              <button type="submit" className="btn btn-primary" disabled={donating || approving}>
                {donateBtnLabel}
              </button>
            </form>
          )}

          {(status === "active" || status === "almost-funded") && !account && (
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => onConnectPrompt("donate")}>
              Donate
            </button>
          )}

          {status === "almost-funded" && isCreator && claimOpen && (
            <button className="btn btn-success" onClick={handleClaim} disabled={claiming}>
              {claiming ? <><span className="spinner" /> Claiming…</> : "Claim Funds"}
            </button>
          )}

          {status === "completed" && <span className={styles.claimedNote}>Funds claimed</span>}

          {(status === "failed" || status === "refunded") && (
            <span className={styles.claimedNote}>
              {campaign.refundsProcessed ? "Refunds processed" : "Awaiting refund processing…"}
            </span>
          )}

          <ShareButton campaign={campaign} compact />
        </div>

        <div className={styles.footer}>
          <span className={styles.creator}>
            {campaign.creator?.slice(0, 6)}…{campaign.creator?.slice(-4)}
          </span>
          <span className={styles.donorCount}>
            {campaign.donorCount ?? 0} donor{campaign.donorCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
