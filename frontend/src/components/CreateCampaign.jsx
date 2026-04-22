import { useState, useRef, useCallback } from "react";
import { CATEGORIES, uploadImage, parseAmount } from "../utils";
import { Currency } from "../abi";
import styles from "./CreateCampaign.module.css";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const EMPTY = {
  title: "", description: "", category: CATEGORIES[0], goal: "", days: "",
  currency: Currency.ETH,
};

// Controlled: open/onClose managed by parent (App.jsx)
export default function CreateCampaign({ contract, onCreated, open, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadWarning, setUploadWarning] = useState(null);
  const [err, setErr] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const processFile = useCallback((file) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setErr("Invalid file type. Please upload a JPG, PNG, GIF, or WebP image.");
      return;
    }
    setErr(null);
    setUploadWarning(null);
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  }, []);

  function handleFileChange(e) {
    processFile(e.target.files[0]);
    // reset so selecting the same file again triggers onChange
    e.target.value = "";
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    processFile(e.dataTransfer.files[0]);
  }

  function handleDragOver(e) {
    e.preventDefault();
    setDragOver(true);
  }

  function clearImage(e) {
    e.stopPropagation();
    setImageFile(null);
    setImagePreview("");
    setUploadWarning(null);
  }

  function resetAfterSuccess() {
    setForm(EMPTY);
    setImageFile(null);
    setImagePreview("");
    setUploadWarning(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    setUploadWarning(null);
    if (!contract) { setErr("Connect your wallet first."); return; }
    const goalBaseUnits = parseAmount(form.goal, form.currency);
    const deadline = Math.floor(Date.now() / 1000) + Number(form.days) * 86400;

    setSubmitting(true);
    try {
      let imageUrl = "";
      if (imageFile) {
        setUploading(true);
        try {
          imageUrl = await uploadImage(imageFile);
          console.log("[Upload] image URL:", imageUrl);
        } catch (uploadErr) {
          console.error("[Upload] failed:", uploadErr);
          setUploadWarning(
            `Image upload failed: ${uploadErr?.message || String(uploadErr)}. ` +
            `Clear the image to launch without it, or retry.`
          );
          setUploading(false);
          setSubmitting(false);
          return; // stop: let user read the error and decide
        } finally {
          setUploading(false);
        }
      }

      const tx = await contract.createCampaign(
        form.title, form.description, form.category, imageUrl, goalBaseUnits, deadline, form.currency
      );
      await tx.wait();
      resetAfterSuccess();
      onClose();
      onCreated();
    } catch (e) {
      setErr(e.reason || e.message || "Transaction failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const buttonLabel = uploading
    ? <><span className="spinner" style={{ borderTopColor: "#000" }} /> Uploading image…</>
    : submitting
    ? <><span className="spinner" style={{ borderTopColor: "#000" }} /> Launching…</>
    : "Launch Campaign";

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            <span className={styles.modalIcon}>🚀</span>
            <h2>Launch Campaign</h2>
          </div>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label>Campaign Title</label>
            <input required placeholder="Help me build a school in Kenya"
              value={form.title} onChange={set("title")} />
          </div>

          <div className={styles.field}>
            <label>Description</label>
            <textarea required placeholder="Tell your story…"
              value={form.description} onChange={set("description")} />
          </div>

          <div className={styles.field}>
            <label>Category</label>
            <select value={form.category} onChange={set("category")}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* ── Image upload ── */}
          <div className={styles.field}>
            <label>
              Campaign Image&nbsp;
              <span className={styles.optional}>(optional)</span>
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.gif,.webp"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            {imagePreview ? (
              /* Preview state */
              <div
                className={`${styles.dropZone} ${styles.dropZonePreview}`}
                onClick={() => fileInputRef.current.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={() => setDragOver(false)}
                title="Click or drop to replace"
              >
                <img src={imagePreview} alt="Preview" className={styles.preview} />
                <div className={styles.previewOverlay}>
                  <span>Replace image</span>
                </div>
                <button type="button" className={styles.clearBtn} onClick={clearImage}>✕</button>
              </div>
            ) : (
              /* Empty drop zone */
              <div
                className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ""}`}
                onClick={() => fileInputRef.current.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={() => setDragOver(false)}
              >
                <div className={styles.dropIcon}>↑</div>
                <p className={styles.dropText}>Drag and drop your image here</p>
                <span className={styles.dropSub}>or</span>
                <button type="button" className={styles.browseBtn}>Browse files</button>
                <p className={styles.dropHint}>JPG, PNG, GIF, WebP accepted</p>
              </div>
            )}
          </div>

          <div className={styles.field}>
            <label>Currency</label>
            <div className={styles.currencyRow}>
              <label className={`${styles.currencyOption} ${form.currency === Currency.ETH ? styles.currencyActive : ""}`}>
                <input
                  type="radio"
                  name="currency"
                  value={Currency.ETH}
                  checked={form.currency === Currency.ETH}
                  onChange={() => setForm((f) => ({ ...f, currency: Currency.ETH, goal: "" }))}
                />
                <span className={styles.currencyLabel}>ETH</span>
                <span className={styles.currencySub}>native</span>
              </label>
              <label className={`${styles.currencyOption} ${form.currency === Currency.USDC ? styles.currencyActive : ""}`}>
                <input
                  type="radio"
                  name="currency"
                  value={Currency.USDC}
                  checked={form.currency === Currency.USDC}
                  onChange={() => setForm((f) => ({ ...f, currency: Currency.USDC, goal: "" }))}
                />
                <span className={styles.currencyLabel}>USDC</span>
                <span className={styles.currencySub}>maintains stable USD value</span>
              </label>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label>{form.currency === Currency.USDC ? "Goal (USDC)" : "Goal (ETH)"}</label>
              <input required type="number"
                step={form.currency === Currency.USDC ? "0.01" : "0.001"}
                min={form.currency === Currency.USDC ? "1" : "0.001"}
                placeholder={form.currency === Currency.USDC ? "1000" : "1.0"}
                value={form.goal} onChange={set("goal")} />
            </div>
            <div className={styles.field}>
              <label>Duration (days)</label>
              <input required type="number" min="1" max="365"
                placeholder="30" value={form.days} onChange={set("days")} />
              <span className={styles.hint}>Campaigns can run for up to 1 year.</span>
            </div>
          </div>

          {err && <p className={styles.error}>{err}</p>}
          {uploadWarning && <p className={styles.uploadWarning}>{uploadWarning}</p>}

          {uploading && (
            <div className={styles.progressTrack} aria-label="Upload in progress">
              <div className={styles.progressIndeterminate} />
            </div>
          )}

          <div className={styles.note}>
            Campaigns can be claimed once 80% funded. A 5% platform fee is deducted from whatever amount is claimed.
          </div>

          <button type="submit" className={`btn btn-primary ${styles.submitBtn}`} disabled={submitting}>
            {buttonLabel}
          </button>
        </form>
      </div>
    </div>
  );
}
