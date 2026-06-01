import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api.js";

const palette = ["#0b66b2", "#15a884", "#f59e0b", "#7c3aed", "#ef4444", "#0891b2", "#64748b"];

function downloadText(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function bucketYear(year) {
  const value = Number(year);
  if (!value) return "未知";
  if (value < 1900) return "1900前";
  if (value < 1920) return "1900-1919";
  if (value < 1940) return "1920-1939";
  if (value < 1960) return "1940-1959";
  if (value < 1980) return "1960-1979";
  if (value < 2000) return "1980-1999";
  if (value < 2020) return "2000-2019";
  return "2020后";
}

function topCounts(items, key, limit = 8) {
  const counts = new Map();
  items.forEach((item) => {
    const value = item[key] || "未知";
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function short(text, limit = 14) {
  const value = String(text || "未知");
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function arc(cx, cy, r1, r2, start, end) {
  const large = end - start > Math.PI ? 1 : 0;
  const p = (r, a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  const [x1, y1] = p(r2, start);
  const [x2, y2] = p(r2, end);
  const [x3, y3] = p(r1, end);
  const [x4, y4] = p(r1, start);
  return `M ${x1} ${y1} A ${r2} ${r2} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r1} ${r1} 0 ${large} 0 ${x4} ${y4} Z`;
}

function PanelFrame({ x, y, title, children }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="472" height="330" fill="#fff" stroke="#dbe7f3" />
      <text className="chart-title" x="22" y="34">{title}</text>
      {children}
    </g>
  );
}

export default function StatisticsPanel({ items = [], title = "全库统计可视化" }) {
  const svgRef = useRef(null);
  const [mode, setMode] = useState("overview");
  const [selected, setSelected] = useState(null);
  const [backendStats, setBackendStats] = useState(null);
  const localYearBuckets = useMemo(() => {
    const order = ["1900前", "1900-1919", "1920-1939", "1940-1959", "1960-1979", "1980-1999", "2000-2019", "2020后", "未知"];
    const counts = new Map(order.map((name) => [name, 0]));
    items.forEach((item) => counts.set(bucketYear(item.year), (counts.get(bucketYear(item.year)) || 0) + 1));
    return order.map((name) => [name, counts.get(name) || 0]);
  }, [items]);
  const localLangTop = useMemo(() => topCounts(items, "language", 7), [items]);
  const localCountryTop = useMemo(() => topCounts(items, "country", 7), [items]);
  const localAuthorTop = useMemo(() => topCounts(items, "translator", 8), [items]);
  const localStoryTop = useMemo(() => topCounts(items, "canonicalName", 12), [items]);
  const localCarrierTop = useMemo(() => topCounts(items, "carrier", 5), [items]);
  const localModeTop = useMemo(() => topCounts(items, "translationMode", 5), [items]);

  useEffect(() => {
    let canceled = false;
    api.statsVisual(items)
      .then((data) => { if (!canceled) setBackendStats(data); })
      .catch(() => { if (!canceled) setBackendStats(null); });
    return () => { canceled = true; };
  }, [items]);

  const yearBuckets = backendStats?.yearBuckets || localYearBuckets;
  const langTop = backendStats?.languageTop || localLangTop;
  const countryTop = backendStats?.countryTop || localCountryTop;
  const authorTop = backendStats?.authorTop || localAuthorTop;
  const storyTop = backendStats?.storyTop || localStoryTop;
  const carrierTop = backendStats?.carrierTop || localCarrierTop;
  const modeTop = backendStats?.modeTop || localModeTop;
  const maxYear = Math.max(1, ...yearBuckets.map(([, value]) => value));
  const maxCountry = Math.max(1, ...countryTop.map(([, value]) => value));
  const maxAuthor = Math.max(1, ...authorTop.map(([, value]) => value));
  const maxStory = Math.max(1, ...storyTop.map(([, value]) => value));
  const donutTotal = Math.max(1, langTop.reduce((sum, [, value]) => sum + value, 0));

  function exportSvg() {
    if (!svgRef.current) return;
    downloadText("统计图表.svg", new XMLSerializer().serializeToString(svgRef.current), "image/svg+xml");
  }

  function exportCsv() {
    const rows = [
      "类型,名称,数量",
      ...yearBuckets.map(([name, value]) => `时间流变,${name},${value}`),
      ...langTop.map(([name, value]) => `语种,${name},${value}`),
      ...countryTop.map(([name, value]) => `国家地区,${name},${value}`),
      ...authorTop.map(([name, value]) => `译者编者,${name},${value}`),
      ...storyTop.map(([name, value]) => `故事母题,${name},${value}`),
      ...carrierTop.map(([name, value]) => `文献载体,${name},${value}`),
      ...modeTop.map(([name, value]) => `翻译方式,${name},${value}`)
    ];
    downloadText("统计图表数据.csv", rows.join("\n"), "text/csv;charset=utf-8");
  }

  let donutStart = -Math.PI / 2;

  return (
    <div className="work-panel stats-panel compact-stats">
      <div className="panel-title-row stats-title-row">
        <div>
          <strong>{title}</strong>
          <span>{items.length} 条数据 · 后端聚合 / 时间 / 语种 / 国家地区 / 故事母题 / 译者编者</span>
        </div>
        <div className="segmented stats-view-tabs">
          <button className={mode === "overview" ? "active" : ""} type="button" onClick={() => setMode("overview")}>总览</button>
          <button className={mode === "relations" ? "active" : ""} type="button" onClick={() => setMode("relations")}>关系图</button>
          <button type="button" onClick={exportSvg}>导出图表</button>
          <button type="button" onClick={exportCsv}>导出数据</button>
        </div>
      </div>
      <svg ref={svgRef} className="stats-svg interactive-stats" viewBox="0 0 1120 820" role="img" aria-label={title}>
        <rect width="1120" height="820" fill="#fff" />
        {mode === "overview" ? (
          <>
            <PanelFrame x="54" y="72" title="时间流变">
              <line className="chart-axis-line" x1="62" x2="430" y1="270" y2="270" />
              <line className="chart-axis-line" x1="62" x2="62" y1="68" y2="270" />
              {[0, 1, 2, 3, 4].map((tick) => (
                <g key={tick}>
                  <line className="chart-grid" x1="62" x2="430" y1={270 - tick * 48} y2={270 - tick * 48} />
                  <text className="chart-axis" x="52" y={274 - tick * 48} textAnchor="end">{Math.round(maxYear * tick / 4)}</text>
                </g>
              ))}
              {yearBuckets.map(([bucket, value], index) => {
                const x = 78 + index * 39;
                const h = (value / maxYear) * 178;
                return (
                  <g className="atlas-clickable" key={bucket} onClick={() => setSelected({ title: bucket, detail: `${value} 条记录` })}>
                    <rect className="chart-bar" x={x} y={270 - h} width="24" height={h} />
                    <text className="chart-value small" x={x + 12} y={260 - h} textAnchor="middle">{value}</text>
                    <text className="chart-axis rotated-axis" x={x + 12} y="294" textAnchor="end" transform={`rotate(-45 ${x + 12} 294)`}>{bucket}</text>
                  </g>
                );
              })}
            </PanelFrame>

            <PanelFrame x="594" y="72" title="语种占比">
              {langTop.map(([name, value], index) => {
                const angle = value / donutTotal * Math.PI * 2;
                const path = arc(160, 170, 68, 112, donutStart, donutStart + angle);
                donutStart += angle;
                return <path className="atlas-clickable" key={name} d={path} fill={palette[index % palette.length]} onClick={() => setSelected({ title: name, detail: `${value} 条记录` })} />;
              })}
              {langTop.slice(0, 6).map(([name, value], index) => (
                <g className="atlas-clickable" key={name} transform={`translate(304 ${78 + index * 34})`} onClick={() => setSelected({ title: name, detail: `${value} 条记录` })}>
                  <circle cx="0" cy="-5" r="6" fill={palette[index % palette.length]} />
                  <text className="chart-legend" x="16" y="0">{short(name, 12)} {value}</text>
                </g>
              ))}
            </PanelFrame>

            <PanelFrame x="54" y="430" title="国家/地区 Top">
              {countryTop.slice(0, 7).map(([name, value], index) => (
                <g className="atlas-clickable" key={name} transform={`translate(36 ${72 + index * 34})`} onClick={() => setSelected({ title: name, detail: `${value} 条记录` })}>
                  <text className="chart-axis" x="0" y="14">{short(name, 10)}</text>
                  <rect fill="#eaf2fb" height="14" rx="4" width="274" x="92" y="2" />
                  <rect fill={palette[index % palette.length]} height="14" rx="4" width={(value / maxCountry) * 274} x="92" y="2" />
                  <text className="chart-value small" x={(value / maxCountry) * 274 + 104} y="14">{value}</text>
                </g>
              ))}
            </PanelFrame>

            <PanelFrame x="594" y="430" title="故事母题与文献类型">
              {storyTop.slice(0, 6).map(([name, value], index) => {
                const x = 48 + index * 63;
                const r = 10 + (value / maxStory) * 24;
                return (
                  <g className="atlas-clickable" key={name} transform={`translate(${x} 94)`} onClick={() => setSelected({ title: name, detail: `${value} 条记录` })}>
                    <circle cx="0" cy="0" r={r} fill={palette[index % palette.length]} opacity="0.84" />
                    <text className="chart-value small" x="0" y="5" textAnchor="middle" fill="#fff">{value}</text>
                    <text className="chart-axis rotated-axis" x="0" y="82" textAnchor="end" transform="rotate(-45 0 82)">{short(name, 7)}</text>
                  </g>
                );
              })}
              <g transform="translate(38 212)">
                {carrierTop.slice(0, 3).map(([name, value], index) => (
                  <g className="atlas-clickable" key={name} transform={`translate(0 ${index * 31})`} onClick={() => setSelected({ title: name, detail: `${value} 条记录` })}>
                    <text className="chart-axis" x="0" y="14">{short(name, 7)}</text>
                    <rect fill="#eaf2fb" height="14" rx="4" width="126" x="74" y="2" />
                    <rect fill={palette[(index + 2) % palette.length]} height="14" rx="4" width={Math.max(8, value / Math.max(1, carrierTop[0]?.[1] || 1) * 126)} x="74" y="2" />
                    <text className="chart-value small" x="210" y="14">{value}</text>
                  </g>
                ))}
                {modeTop.slice(0, 3).map(([name, value], index) => (
                  <g className="atlas-clickable" key={name} transform={`translate(242 ${index * 31})`} onClick={() => setSelected({ title: name, detail: `${value} 条记录` })}>
                    <text className="chart-axis" x="0" y="14">{short(name, 7)}</text>
                    <rect fill="#eaf2fb" height="14" rx="4" width="126" x="74" y="2" />
                    <rect fill={palette[(index + 4) % palette.length]} height="14" rx="4" width={Math.max(8, value / Math.max(1, modeTop[0]?.[1] || 1) * 126)} x="74" y="2" />
                    <text className="chart-value small" x="210" y="14">{value}</text>
                  </g>
                ))}
              </g>
            </PanelFrame>
          </>
        ) : (
          <g transform="translate(70 72)">
            <rect width="980" height="640" fill="#fff" stroke="#dbe7f3" />
            <text className="chart-title" x="28" y="42">译者/编者与故事集关系</text>
            {authorTop.map(([name, value], index) => {
              const y = 84 + index * 62;
              return (
                <g className="atlas-clickable" key={name} transform={`translate(40 ${y})`} onClick={() => setSelected({ title: name, detail: `${value} 条记录` })}>
                  <circle cx="26" cy="18" r="16" fill={palette[index % palette.length]} />
                  <text className="chart-label" x="58" y="24">{short(name, 28)}</text>
                  <line x1="330" x2={330 + (value / maxAuthor) * 520} y1="18" y2="18" stroke={palette[index % palette.length]} strokeWidth="8" strokeLinecap="round" />
                  <circle cx={344 + (value / maxAuthor) * 520} cy="18" r="18" fill="#fff" stroke={palette[index % palette.length]} strokeWidth="3" />
                  <text className="chart-value" x={344 + (value / maxAuthor) * 520} y="24" textAnchor="middle">{value}</text>
                </g>
              );
            })}
          </g>
        )}
      </svg>
      {selected && (
        <div className="stats-bottom">
          <strong>{selected.title}</strong>
          <span>{selected.detail}</span>
        </div>
      )}
    </div>
  );
}
