import { useEffect, useState } from "react";

export function ExpandButton({ onClick, label = "放大查看" }) {
  return (
    <button className="visual-expand-button" type="button" onClick={onClick} title={label} aria-label={label}>
      <span aria-hidden="true">⛶</span>
      {label}
    </button>
  );
}

export default function VisualModal({ open, title, subtitle, onClose, children }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
      if ((event.ctrlKey || event.metaKey) && event.key === "=") {
        event.preventDefault();
        setScale((value) => Math.min(1.8, Number((value + 0.1).toFixed(2))));
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "-") {
        event.preventDefault();
        setScale((value) => Math.max(0.72, Number((value - 0.1).toFixed(2))));
      }
    };
    document.body.classList.add("visual-modal-open");
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("visual-modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (open) setScale(1);
  }, [open]);

  if (!open) return null;

  return (
    <div className="visual-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="visual-modal" role="dialog" aria-modal="true" aria-label={title || "放大可视化"} onClick={(event) => event.stopPropagation()}>
        <header className="visual-modal-header">
          <div>
            <strong>{title || "放大可视化"}</strong>
            {subtitle && <span>{subtitle}</span>}
          </div>
          <div className="visual-modal-actions">
            <button type="button" onClick={() => setScale((value) => Math.max(0.72, Number((value - 0.1).toFixed(2))))}>缩小</button>
            <span>{Math.round(scale * 100)}%</span>
            <button type="button" onClick={() => setScale((value) => Math.min(1.8, Number((value + 0.1).toFixed(2))))}>放大</button>
            <button type="button" onClick={() => setScale(1)}>重置</button>
            <button type="button" onClick={onClose}>关闭</button>
          </div>
        </header>
        <div className="visual-modal-viewport">
          <div className="visual-modal-scale" style={{ transform: `scale(${scale})` }}>
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}
