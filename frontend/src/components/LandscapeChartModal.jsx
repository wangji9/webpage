import { useEffect, useRef, useState } from "react";
import { echarts } from "../utils/echartsCore.js";

export function LandscapeChartButton({ disabled = false, label = "横屏查看", onClick }) {
  return (
    <button
      className="landscape-chart-trigger"
      type="button"
      disabled={disabled}
      onClick={onClick}
      title="旋转 90 度全屏查看图表"
      aria-label={label}
    >
      {label}
    </button>
  );
}

export default function LandscapeChartModal({ open, title = "图表", subtitle = "旋转 90 度横屏全屏查看", option, onClose }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.body.classList.add("landscape-chart-modal-open");
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("landscape-chart-modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open || !ref.current) return undefined;
    try {
      chartRef.current = echarts.init(ref.current);
      chartRef.current.setOption(option || {}, true);
      setRenderError("");
    } catch (error) {
      setRenderError(error.message || String(error));
    }

    const resize = () => chartRef.current?.resize();
    const frame = requestAnimationFrame(resize);
    const timer = window.setTimeout(resize, 180);
    window.addEventListener("resize", resize);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (observer) observer.observe(ref.current);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("resize", resize);
      observer?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [open, option]);

  if (!open) return null;

  return (
    <div className="landscape-chart-backdrop" role="presentation" onClick={onClose}>
      <button className="landscape-chart-floating-close" type="button" onClick={onClose} aria-label="关闭横屏图表">
        关闭
      </button>
      <section className="landscape-chart-frame" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <header className="landscape-chart-header">
          <div>
            <strong>{title}</strong>
            <span>{subtitle}</span>
          </div>
        </header>
        <div className="landscape-chart-stage">
          <div className="landscape-chart-canvas" ref={ref} />
          {renderError && (
            <div className="advanced-text-render-error landscape">
              <strong>图表渲染失败</strong>
              <span>{renderError}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
