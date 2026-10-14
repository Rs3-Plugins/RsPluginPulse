import { useEffect, useRef, useState } from "react";
import { ZoomInIcon, ZoomOutIcon } from "../components/icons";

const CANVAS = 300; // display px, square -- the checkerboard area a zoomed-out image can show through
const FRAME = 220; // the actual crop square, centered in CANVAS -- this is what gets exported
const PREVIEW = 72; // the small live preview, same crop just smaller
const EXPORT_SIZE = 512; // Discord's own avatar size
const MIN_SCALE = 1; // the image just covers the frame, no gaps
const MAX_SCALE = 4;
const ZOOM_STEP = 0.1;

interface Offset {
  x: number;
  y: number;
}

function clamp(offset: Offset, maxX: number, maxY: number): Offset {
  return { x: Math.min(maxX, Math.max(-maxX, offset.x)), y: Math.min(maxY, Math.max(-maxY, offset.y)) };
}

// Pan-and-zoom cropping down to Discord's 512x512 avatar size -- `offset`
// is always kept in FRAME-sized display pixels (not CANVAS, which is just
// the wider checkerboard viewing area around it), and only converted to
// EXPORT_SIZE pixels at the very end (confirm()), so the same scale/offset
// state drives the live preview, the dimmed-outside-frame overlay, and the
// final render.
export function ImageCropper({ file, onConfirm, onCancel }: { file: File; onConfirm: (dataUrl: string) => void; onCancel: () => void }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startOffset: Offset } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    setNatural(null);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }

  const coverRatio = natural ? Math.max(FRAME / natural.w, FRAME / natural.h) : 1;
  const displayW = natural ? natural.w * coverRatio * scale : FRAME;
  const displayH = natural ? natural.h * coverRatio * scale : FRAME;
  const maxOffsetX = Math.max(0, (displayW - FRAME) / 2);
  const maxOffsetY = Math.max(0, (displayH - FRAME) / 2);

  function handlePointerDown(e: React.PointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffset: offset };
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const next = { x: dragRef.current.startOffset.x + (e.clientX - dragRef.current.startX), y: dragRef.current.startOffset.y + (e.clientY - dragRef.current.startY) };
    setOffset(clamp(next, maxOffsetX, maxOffsetY));
  }
  function handlePointerUp() {
    dragRef.current = null;
  }

  // Scroll up (negative deltaY) zooms in, matching the usual map/photo-app
  // convention. Scaled down a lot -- a mouse wheel notch is ~100 deltaY
  // units, a trackpad sends many small continuous ones, and either way a
  // single step should feel like one click of the zoom buttons, not a jump.
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    setScaleClamped(scale - e.deltaY * 0.0025);
  }

  function setScaleClamped(next: number) {
    const clampedScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    setScale(clampedScale);
    if (!natural) return;
    const w = natural.w * coverRatio * clampedScale;
    const h = natural.h * coverRatio * clampedScale;
    setOffset((prev) => clamp(prev, Math.max(0, (w - FRAME) / 2), Math.max(0, (h - FRAME) / 2)));
  }

  function reset() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  function confirm() {
    if (!natural || !imgRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = EXPORT_SIZE;
    canvas.height = EXPORT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const exportCoverRatio = Math.max(EXPORT_SIZE / natural.w, EXPORT_SIZE / natural.h);
    const factor = EXPORT_SIZE / FRAME;
    const drawW = natural.w * exportCoverRatio * scale;
    const drawH = natural.h * exportCoverRatio * scale;
    ctx.drawImage(imgRef.current, (EXPORT_SIZE - drawW) / 2 + offset.x * factor, (EXPORT_SIZE - drawH) / 2 + offset.y * factor, drawW, drawH);
    onConfirm(canvas.toDataURL("image/png"));
  }

  return (
    <div className="avatar-cropper">
      <div
        className="avatar-cropper__canvas"
        style={{ width: CANVAS, height: CANVAS }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        {imgUrl && (
          <img
            ref={imgRef}
            src={imgUrl}
            alt=""
            draggable={false}
            onLoad={handleImgLoad}
            style={{ width: displayW, height: displayH, transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)` }}
          />
        )}
        <div className="avatar-cropper__frame" style={{ width: FRAME, height: FRAME }} />
      </div>

      <div className="avatar-cropper__toolbar">
        <button type="button" aria-label="Zoom out" disabled={!natural || scale <= MIN_SCALE} onClick={() => setScaleClamped(scale - ZOOM_STEP)}>
          <ZoomOutIcon />
        </button>
        <input type="range" min={MIN_SCALE} max={MAX_SCALE} step={0.01} value={scale} onChange={(e) => setScaleClamped(Number(e.target.value))} disabled={!natural} />
        <button type="button" aria-label="Zoom in" disabled={!natural || scale >= MAX_SCALE} onClick={() => setScaleClamped(scale + ZOOM_STEP)}>
          <ZoomInIcon />
        </button>
      </div>

      <div className="avatar-cropper__footer">
        <div className="avatar-cropper__preview" style={{ width: PREVIEW, height: PREVIEW }}>
          {imgUrl && (
            <img
              src={imgUrl}
              alt=""
              draggable={false}
              style={{
                width: displayW * (PREVIEW / FRAME),
                height: displayH * (PREVIEW / FRAME),
                transform: `translate(-50%, -50%) translate(${offset.x * (PREVIEW / FRAME)}px, ${offset.y * (PREVIEW / FRAME)}px)`,
              }}
            />
          )}
        </div>
        <button type="button" className="dc-chip-btn" onClick={reset}>
          Reset
        </button>
        <div className="avatar-cropper__spacer" />
        <button type="button" className="dc-pill-outline" onClick={onCancel}>
          Back
        </button>
        <button type="button" className="legal-ok" disabled={!natural} onClick={confirm}>
          Use this image
        </button>
      </div>
    </div>
  );
}
