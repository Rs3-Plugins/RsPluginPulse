import { useRef, useState } from "react";
import { LockIcon, UploadIcon } from "../components/icons";
import { AVATAR_PRESETS } from "./avatarPresets";
import { fetchAsDataUrl } from "./imageData";
import { ImageCropper } from "./ImageCropper";
import { SubscribeModal } from "./SubscribeModal";

const MAX_UPLOAD_BYTES = 15_000_000; // generous -- the cropper re-encodes down to 512x512 regardless of source size

// Hardcoded off -- there's no actual subscription billing yet (no Stripe
// integration, no entitlement/subscribers table). Shows the upload card
// locked/blurred with a £5/month pitch (SubscribeModal) for everyone until
// that's built; flip this once it is. See memory
// (project_discord_avatar_picker_paid_tier).
const CUSTOM_UPLOAD_UNLOCKED = false;

type Step = { kind: "pick" } | { kind: "crop"; file: File; key: number };

// Preset icons are ready-made 512x512 art -- picked directly, no framing
// needed. A custom upload can be any size/aspect ratio, so it goes through
// ImageCropper first.
export function AvatarPickerModal({ onSelect, onClose }: { onSelect: (dataUrl: string) => void; onClose: () => void }) {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [presetBusyId, setPresetBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadCount = useRef(0);

  async function choosePreset(id: string, url: string) {
    setError(null);
    setPresetBusyId(id);
    try {
      onSelect(await fetchAsDataUrl(url));
    } catch {
      setError("Couldn't load that preset, try again.");
    } finally {
      setPresetBusyId(null);
    }
  }

  function handleUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("That image is too big -- try one under 15MB.");
      return;
    }
    uploadCount.current += 1;
    setStep({ kind: "crop", file, key: uploadCount.current });
  }

  return (
    <>
      <div className="legal-overlay" onClick={onClose}>
        <div role="dialog" aria-modal="true" className="legal-dialog avatar-picker-dialog" onClick={(e) => e.stopPropagation()}>
          <div className="legal-dialog-header">
            <h2>{step.kind === "crop" ? "Frame your image" : "Choose a bot avatar"}</h2>
            <button className="legal-close" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="legal-body">
            {step.kind === "pick" ? (
              <>
                <div className="avatar-preset-grid">
                  {AVATAR_PRESETS.map((p) => (
                    <button key={p.id} type="button" className="avatar-preset" disabled={presetBusyId !== null} onClick={() => choosePreset(p.id, p.url)}>
                      <img src={p.url} alt="" />
                      <span>{presetBusyId === p.id ? "Loading…" : p.label}</span>
                    </button>
                  ))}
                </div>
                {error && <p className="dc-warn">{error}</p>}
                <div className={`avatar-upload-slot${CUSTOM_UPLOAD_UNLOCKED ? "" : " avatar-upload-locked"}`}>
                  <button type="button" className="avatar-upload-card" disabled={!CUSTOM_UPLOAD_UNLOCKED} onClick={() => fileRef.current?.click()}>
                    <span className="avatar-upload-card__icon">
                      <UploadIcon />
                    </span>
                    <span className="avatar-upload-card__text">
                      <b>Upload your own image</b>
                      <span className="dc-dim">You&rsquo;ll be able to frame it to fit next.</span>
                    </span>
                  </button>
                  {!CUSTOM_UPLOAD_UNLOCKED && (
                    <div className="avatar-upload-locked__overlay">
                      <div className="avatar-upload-locked__msg">
                        <LockIcon size={18} />
                        <span>
                          <b>Supporters only</b> — unlock custom uploads for £5/month.
                        </span>
                      </div>
                      <button type="button" className="legal-ok" onClick={() => setSubscribeOpen(true)}>
                        Subscribe
                      </button>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="dc-hidden-input" onChange={handleUploadChange} />
              </>
            ) : (
              <ImageCropper key={step.key} file={step.file} onCancel={() => setStep({ kind: "pick" })} onConfirm={onSelect} />
            )}
          </div>
        </div>
      </div>
      {subscribeOpen && <SubscribeModal onClose={() => setSubscribeOpen(false)} />}
    </>
  );
}
