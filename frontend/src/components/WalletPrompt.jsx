import styles from "./WalletPrompt.module.css";

const REASON_COPY = {
  donate:            "You need a connected wallet to donate to this campaign.",
  "create a campaign": "You need a connected wallet to create a campaign.",
};

export default function WalletPrompt({ open, reason, onConnect, onClose }) {
  if (!open) return null;

  const body = REASON_COPY[reason] || "You need a connected wallet to continue.";

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.icon}>⬡</div>
        <h2 className={styles.heading}>Connect Your Wallet</h2>
        <p className={styles.body}>{body}</p>
        <div className={styles.actions}>
          <button className="btn btn-primary" onClick={onConnect}>
            Connect MetaMask
          </button>
          <button className={`btn ${styles.cancel}`} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
