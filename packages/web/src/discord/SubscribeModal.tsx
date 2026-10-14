// Pricing/CTA shell for the supporter subscription -- no Stripe wiring
// yet (see CUSTOM_UPLOAD_UNLOCKED in AvatarPickerModal.tsx), the Subscribe
// button is intentionally inert until that exists. See memory
// (project_discord_avatar_picker_paid_tier).
export function SubscribeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="legal-overlay" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="legal-dialog confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="legal-dialog-header">
          <h2>Unlock custom avatars</h2>
          <button className="legal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="legal-body">
          <p>Upload and frame your own bot avatar for this server, plus anything else that lands behind the supporter tier later.</p>
          <div className="subscribe-price">
            <b>£5</b>
            <span>/ month</span>
          </div>
          <p className="dc-dim">Cancel anytime. Billed securely through Stripe.</p>
        </div>
        <div className="legal-dialog-footer subscribe-dialog-footer">
          <button type="button" className="legal-ok" disabled>
            Subscribe
          </button>
          <span className="dc-dim">Subscriptions aren&rsquo;t live yet — check back soon.</span>
        </div>
      </div>
    </div>
  );
}
