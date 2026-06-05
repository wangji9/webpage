import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api.js";

const palette = ["#0b66b2", "#15a884", "#f59e0b", "#7c3aed", "#ef4444", "#0891b2", "#64748b", "#d97706"];
const stageDefs = [
  ["1910s-1930s", 1910, 1940],
  ["1950s-1970s", 1950, 1980],
  ["1980s-2000s", 1980, 2010],
  ["2010s-2020s", 2010, 2031],
  ["年代不明", 0, 1],
];

function downloadText(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([type.includes("csv") ? `\uFEFF${text}` : text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function asText(value, fallback = "未知") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function field(item, keys, fallback = "未知") {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return fallback;
}

function yearOf(item) {
  const raw = field(item, ["year", "年份", "出版时间", "yearText", "date"], "");
  const matched = String(raw).match(/\d{4}/);
  return matched ? Number(matched[0]) : 0;
}

function bucketYear(year) {
  const value = Number(year);
  if (!value) return "年代不明";
  if (value < 1900) return "1900前";
  if (value < 1920) return "1900-1919";
  if (value < 1940) return "1920-1939";
  if (value < 1960) return "1940-1959";
  if (value < 1980) return "1960-1979";
  if (value < 2000) return "1980-1999";
  if (value < 2020) return "2000-2019";
  return "2020后";
}

function stageOf(year) {
  const value = Number(year);
  if (!value) return "年代不明";
  return stageDefs.find(([, start, end]) => value >= start && value < end)?.[0] || "年代不明";
}

function topCounts(items, keys, limit = 8) {
  const counts = new Map();
  items.forEach((item) => {
    const value = field(item, Array.isArray(keys) ? keys : [keys]);
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function short(text, limit = 12) {
  const value = asText(text);
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function arc(cx, cy, r1, r2, start, end) {
  const large = end - start > Math.PI ? 1 : 0;
  const point = (radius, angle) => [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  const [x1, y1] = point(r2, start);
  const [x2, y2] = point(r2, end);
  const [x3, y3] = point(r1, end);
  const [x4, y4] = point(r1, start);
  return `M ${x1} ${y1} A ${r2} ${r2} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r1} ${r1} 0 ${large} 0 ${x4} ${y4} Z`;
}

function ChartCard({ title, note, children }) {
  return (
    <article className="stat-chart-card">
      <header>
        <strong>{title}</strong>
        {note && <span>{note}</span>}
      </header>
      {children}
    </article>
  );
}

function AxisLabel({ x, y, children, anchor = "middle", rotate = 0 }) {
  return <text className="stat-axis-label" x={x} y={y} textAnchor={anchor} transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}>{children}</text>;
}

function TimelineChart({ buckets, items, onSelect }) {
  const max = Math.max(1, ...buckets.map(([, value]) => value));
  let cumulative = 0;
  const points = buckets.map(([label, value], index) => {
    cumulative += value;
    return { label, value, total: cumulative, x: 64 + index * 52 };
  });
  const maxTotal = Math.max(1, ...points.map((item) => item.total));
  return (
    <svg className="stat-card-svg" viewBox="0 0 520 300" role="img">
      <line className="chart-axis-line" x1="52" x2="474" y1="242" y2="242" />
      <line className="chart-axis-line" x1="52" x2="52" y1="44" y2="242" />
      {[0, 1, 2, 3, 4].map((tick) => <g key={tick}><line className="chart-grid" x1="52" x2="474" y1={242 - tick * 46} y2={242 - tick * 46} /><AxisLabel x="44" y={246 - tick * 46} anchor="end">{Math.round(max * tick / 4)}</AxisLabel></g>)}
      <path className="stat-soft-area" d={`M${points.map((point) => `${point.x},${242 - (point.total / maxTotal) * 164}`).join(" L")}`} fill="none" />
      {points.map((point, index) => {
        const h = Math.max(2, (point.value / max) * 168);
        return (
          <g className="atlas-clickable" key={point.label} onClick={() => onSelect(point.label, `${point.value} 条记录；累计 ${point.total} 条；样本 ${items.length} 条`)}>
            <rect x={point.x - 13} y={242 - h} width="26" height={h} rx="4" fill={palette[index % palette.length]} opacity="0.86" />
            <circle cx={point.x} cy={242 - (point.total / maxTotal) * 164} r="5" fill="#fff" stroke="#0b66b2" strokeWidth="2" />
            <AxisLabel x={point.x} y={260} rotate={-38} anchor="end">{point.label}</AxisLabel>
            <text className="chart-value small" x={point.x} y={236 - h} textAnchor="middle">{point.value}</text>
          </g>
        );
      })}
    </svg>
  );
}

function DonutChart({ data, onSelect }) {
  const total = Math.max(1, data.reduce((sum, [, value]) => sum + value, 0));
  let start = -Math.PI / 2;
  return (
    <svg className="stat-card-svg" viewBox="0 0 520 300" role="img">
      {data.map(([name, value], index) => {
        const angle = value / total * Math.PI * 2;
        const path = arc(154, 150, 58, 102, start, start + angle);
        start += angle;
        return <path className="atlas-clickable" key={name} d={path} fill={palette[index % palette.length]} opacity="0.92" onClick={() => onSelect(name, `${value} 条，占 ${(value / total * 100).toFixed(1)}%`)} />;
      })}
      <text className="stat-big-number" x="154" y="144" textAnchor="middle">{total}</text>
      <AxisLabel x="154" y="168">总量</AxisLabel>
      {data.slice(0, 7).map(([name, value], index) => (
        <g className="atlas-clickable" key={name} transform={`translate(296 ${58 + index * 30})`} onClick={() => onSelect(name, `${value} 条记录`)}>
          <circle cx="0" cy="-5" r="6" fill={palette[index % palette.length]} />
          <text className="chart-legend" x="16" y="0">{short(name, 14)} {value}</text>
        </g>
      ))}
    </svg>
  );
}

function HorizontalBars({ data, onSelect }) {
  const max = Math.max(1, ...data.map(([, value]) => value));
  return (
    <svg className="stat-card-svg" viewBox="0 0 520 300" role="img">
      {data.slice(0, 8).map(([name, value], index) => {
        const y = 42 + index * 31;
        const width = Math.max(4, (value / max) * 286);
        return (
          <g className="atlas-clickable" key={name} onClick={() => onSelect(name, `${value} 条记录`)}>
            <AxisLabel x="34" y={y + 13} anchor="start">{short(name, 12)}</AxisLabel>
            <rect x="150" y={y} width="300" height="14" rx="5" fill="#eaf2fb" />
            <rect x="150" y={y} width={width} height="14" rx="5" fill={palette[index % palette.length]} />
            <text className="chart-value small" x={Math.min(472, 158 + width)} y={y + 12}>{value}</text>
          </g>
        );
      })}
    </svg>
  );
}

function MatrixChart({ items, motifs, types, onSelect }) {
  const cells = motifs.flatMap(([motif]) => types.map(([type]) => {
    const value = items.filter((item) => field(item, ["canonicalName", "规范故事名", "title", "题名"]) === motif && field(item, ["carrier", "文献载体", "resourceType", "文献类型", "type"]) === type).length;
    return { motif, type, value };
  }));
  const max = Math.max(1, ...cells.map((item) => item.value));
  return (
    <svg className="stat-card-svg" viewBox="0 0 520 300" role="img">
      {types.slice(0, 4).map(([type], index) => <AxisLabel key={type} x={188 + index * 82} y="42">{short(type, 8)}</AxisLabel>)}
      {motifs.slice(0, 5).map(([motif], row) => (
        <g key={motif}>
          <AxisLabel x="36" y={76 + row * 38} anchor="start">{short(motif, 12)}</AxisLabel>
          {types.slice(0, 4).map(([type], col) => {
            const value = cells.find((item) => item.motif === motif && item.type === type)?.value || 0;
            return (
              <g className="atlas-clickable" key={`${motif}-${type}`} onClick={() => onSelect(`${short(motif, 10)} × ${short(type, 8)}`, `${value} 条耦合记录`)}>
                <rect x={150 + col * 82} y={58 + row * 38} width="64" height="26" rx="4" fill="#eef6ff" stroke="#dbe7f3" />
                <rect x={150 + col * 82} y={58 + row * 38} width="64" height="26" rx="4" fill="#0b66b2" opacity={0.12 + value / max * 0.72} />
                <text className="chart-value small" x={182 + col * 82} y={76 + row * 38} textAnchor="middle">{value}</text>
              </g>
            );
          })}
        </g>
      ))}
      <AxisLabel x="150" y="260" anchor="start">颜色越深表示该母题与文献类型耦合越强</AxisLabel>
    </svg>
  );
}

function AuthorChart({ data, onSelect }) {
  const max = Math.max(1, ...data.map(([, value]) => value));
  return (
    <svg className="stat-card-svg" viewBox="0 0 520 300" role="img">
      {data.slice(0, 7).map(([name, value], index) => {
        const y = 48 + index * 34;
        const x2 = 166 + (value / max) * 278;
        return (
          <g className="atlas-clickable" key={name} onClick={() => onSelect(name, `${value} 条译介/编选相关记录`)}>
            <circle cx="36" cy={y} r="10" fill={palette[index % palette.length]} />
            <AxisLabel x="56" y={y + 5} anchor="start">{short(name, 18)}</AxisLabel>
            <line x1="166" x2={x2} y1={y} y2={y} stroke={palette[index % palette.length]} strokeWidth="7" strokeLinecap="round" />
            <circle cx={x2} cy={y} r="14" fill="#fff" stroke={palette[index % palette.length]} strokeWidth="3" />
            <text className="chart-value small" x={x2} y={y + 4} textAnchor="middle">{value}</text>
          </g>
        );
      })}
    </svg>
  );
}

function StageLanguageChart({ items, languages, onSelect }) {
  const stages = stageDefs.map(([name]) => name);
  const rows = stages.map((stage) => {
    const stageItems = items.filter((item) => stageOf(yearOf(item)) === stage);
    return { stage, values: languages.map(([lang]) => stageItems.filter((item) => field(item, ["language", "语种"]) === lang).length), total: stageItems.length };
  });
  const max = Math.max(1, ...rows.map((row) => row.total));
  return (
    <svg className="stat-card-svg" viewBox="0 0 520 300" role="img">
      <line className="chart-axis-line" x1="62" x2="470" y1="238" y2="238" />
      {rows.map((row, index) => {
        const x = 88 + index * 82;
        let y = 238;
        return (
          <g className="atlas-clickable" key={row.stage} onClick={() => onSelect(row.stage, `${row.total} 条记录；语种结构：${languages.map(([lang], langIndex) => `${short(lang, 5)} ${row.values[langIndex]}`).join(" / ")}`)}>
            {row.values.map((value, langIndex) => {
              const h = row.total ? (value / max) * 178 : 0;
              y -= h;
              return <rect key={languages[langIndex]?.[0] || langIndex} x={x - 19} y={y} width="38" height={h} fill={palette[langIndex % palette.length]} opacity="0.86" />;
            })}
            <AxisLabel x={x} y="260" rotate={-24}>{row.stage}</AxisLabel>
            <text className="chart-value small" x={x} y={Math.max(36, y - 8)} textAnchor="middle">{row.total}</text>
          </g>
        );
      })}
      {languages.slice(0, 4).map(([lang], index) => (
        <g key={lang} transform={`translate(${78 + index * 96} 28)`}>
          <circle cx="0" cy="0" r="5" fill={palette[index % palette.length]} />
          <text className="chart-legend" x="12" y="4">{short(lang, 7)}</text>
        </g>
      ))}
    </svg>
  );
}

function PathCouplingChart({ items, countries, languages, onSelect }) {
  const left = countries.slice(0, 4).map(([name], index) => ({ id: name, label: name, x: 70, y: 58 + index * 54 }));
  const right = languages.slice(0, 4).map(([name], index) => ({ id: name, label: name, x: 420, y: 58 + index * 54 }));
  const max = Math.max(1, ...left.flatMap((country) => right.map((lang) => items.filter((item) => field(item, ["country", "国家", "国家/地区"]) === country.id && field(item, ["language", "语种"]) === lang.id).length)));
  return (
    <svg className="stat-card-svg" viewBox="0 0 520 300" role="img">
      <AxisLabel x="70" y="32">出版地</AxisLabel>
      <AxisLabel x="420" y="32">语种</AxisLabel>
      {left.flatMap((country) => right.map((lang, index) => {
        const value = items.filter((item) => field(item, ["country", "国家", "国家/地区"]) === country.id && field(item, ["language", "语种"]) === lang.id).length;
        if (!value) return null;
        return <path className="atlas-clickable" key={`${country.id}-${lang.id}`} d={`M${country.x + 48},${country.y} C210,${country.y} 282,${lang.y} ${lang.x - 48},${lang.y}`} fill="none" stroke={palette[index % palette.length]} strokeWidth={1 + value / max * 9} opacity="0.34" onClick={() => onSelect(`${short(country.id, 8)} → ${short(lang.id, 8)}`, `${value} 条跨语种传播记录`)} />;
      }))}
      {[...left, ...right].map((node, index) => (
        <g className="atlas-clickable" key={node.id} onClick={() => onSelect(node.label, "点击连线查看出版地与语种的传播耦合")}>
          <circle cx={node.x} cy={node.y} r="20" fill={palette[index % palette.length]} opacity="0.86" />
          <text className="stat-network-label" x={node.x} y={node.y + 5} textAnchor="middle">{short(node.label, 5)}</text>
        </g>
      ))}
    </svg>
  );
}

function TypeDecadeChart({ items, types, onSelect }) {
  const decades = ["1900前", "1900-1919", "1920-1939", "1940-1959", "1960-1979", "1980-1999", "2000-2019", "2020后"];
  const max = Math.max(1, ...types.flatMap(([type]) => decades.map((decade) => items.filter((item) => bucketYear(yearOf(item)) === decade && field(item, ["carrier", "文献载体", "resourceType", "文献类型", "type"]) === type).length)));
  return (
    <svg className="stat-card-svg" viewBox="0 0 520 300" role="img">
      <line className="chart-axis-line" x1="58" x2="470" y1="240" y2="240" />
      <line className="chart-axis-line" x1="58" x2="58" y1="42" y2="240" />
      {decades.map((decade, index) => <AxisLabel key={decade} x={76 + index * 54} y="262" rotate={-36}>{decade}</AxisLabel>)}
      {types.slice(0, 5).map(([type], row) => <AxisLabel key={type} x="38" y={68 + row * 34} anchor="end">{short(type, 5)}</AxisLabel>)}
      {types.slice(0, 5).flatMap(([type], row) => decades.map((decade, col) => {
        const value = items.filter((item) => bucketYear(yearOf(item)) === decade && field(item, ["carrier", "文献载体", "resourceType", "文献类型", "type"]) === type).length;
        if (!value) return null;
        return <circle className="atlas-clickable" key={`${type}-${decade}`} cx={76 + col * 54} cy={66 + row * 34} r={4 + value / max * 18} fill={palette[row % palette.length]} opacity="0.7" onClick={() => onSelect(`${short(decade, 8)} · ${short(type, 8)}`, `${value} 条文献类型记录`)} />;
      }))}
    </svg>
  );
}

function NetworkCard({ title, note, nodes, edges, onSelect }) {
  const max = Math.max(1, ...edges.map((edge) => edge.value || 1));
  return (
    <ChartCard title={title} note={note}>
      <svg className="stat-card-svg relation-network-svg" viewBox="0 0 520 300" role="img">
        {edges.map((edge, index) => {
          const source = nodes.find((node) => node.id === edge.source);
          const target = nodes.find((node) => node.id === edge.target);
          if (!source || !target) return null;
          return <path className="atlas-clickable" key={`${edge.source}-${edge.target}-${index}`} d={`M${source.x},${source.y} C${(source.x + target.x) / 2},${source.y} ${(source.x + target.x) / 2},${target.y} ${target.x},${target.y}`} fill="none" stroke={palette[index % palette.length]} strokeWidth={1 + edge.value / max * 7} opacity="0.28" onClick={() => onSelect(`${source.label} → ${target.label}`, `${edge.value} 条关系记录`)} />;
        })}
        {nodes.map((node, index) => (
          <g className="atlas-clickable" key={node.id} onClick={() => onSelect(node.label, node.detail || "关系网络节点")}>
            <circle cx={node.x} cy={node.y} r={node.r || 18} fill={palette[index % palette.length]} opacity="0.9" />
            <text className="stat-network-label" x={node.x} y={node.y + 5} textAnchor="middle">{short(node.label, node.r > 22 ? 6 : 4)}</text>
          </g>
        ))}
      </svg>
    </ChartCard>
  );
}

export default function StatisticsPanel({ items = [], title = "全库统计可视化" }) {
  const panelRef = useRef(null);
  const [mode, setMode] = useState("overview");
  const [selected, setSelected] = useState(null);
  const [backendStats, setBackendStats] = useState(null);

  useEffect(() => {
    let canceled = false;
    api.statsVisual(items)
      .then((data) => { if (!canceled) setBackendStats(data); })
      .catch(() => { if (!canceled) setBackendStats(null); });
    return () => { canceled = true; };
  }, [items]);

  const yearBuckets = useMemo(() => {
    const order = ["1900前", "1900-1919", "1920-1939", "1940-1959", "1960-1979", "1980-1999", "2000-2019", "2020后", "年代不明"];
    const counts = new Map(order.map((name) => [name, 0]));
    items.forEach((item) => counts.set(bucketYear(yearOf(item)), (counts.get(bucketYear(yearOf(item))) || 0) + 1));
    return backendStats?.yearBuckets?.length ? backendStats.yearBuckets : order.map((name) => [name, counts.get(name) || 0]);
  }, [backendStats?.yearBuckets, items]);
  const langTop = backendStats?.languageTop?.length ? backendStats.languageTop : topCounts(items, ["language", "语种"], 7);
  const countryTop = backendStats?.countryTop?.length ? backendStats.countryTop : topCounts(items, ["country", "国家", "国家/地区"], 8);
  const authorTop = backendStats?.authorTop?.length ? backendStats.authorTop : topCounts(items, ["translator", "译者", "editor", "编者"], 8);
  const storyTop = backendStats?.storyTop?.length ? backendStats.storyTop : topCounts(items, ["canonicalName", "规范故事名", "title", "题名"], 12);
  const carrierTop = backendStats?.carrierTop?.length ? backendStats.carrierTop : topCounts(items, ["carrier", "文献载体", "resourceType", "文献类型", "type"], 7);
  const modeTop = backendStats?.modeTop?.length ? backendStats.modeTop : topCounts(items, ["translationMode", "翻译方式", "source"], 6);
  const publisherTop = topCounts(items, ["publisher", "出版社", "出版机构"], 7);

  function setDetail(titleText, detail) {
    setSelected({ title: titleText, detail });
  }

  function exportSvg() {
    const svgs = [...(panelRef.current?.querySelectorAll("svg") || [])];
    if (!svgs.length) return;
    const cellW = 520;
    const cellH = 330;
    const cols = mode === "overview" ? 4 : 2;
    const rows = Math.ceil(svgs.length / cols);
    const body = svgs.map((svg, index) => {
      const x = (index % cols) * cellW;
      const y = Math.floor(index / cols) * cellH;
      return `<g transform="translate(${x} ${y})">${svg.innerHTML}</g>`;
    }).join("");
    downloadText("统计图表.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cellW}" height="${rows * cellH}" viewBox="0 0 ${cols * cellW} ${rows * cellH}">${body}</svg>`, "image/svg+xml;charset=utf-8");
  }

  function exportCsv() {
    const rows = [
      ["类型", "名称", "数量"],
      ...yearBuckets.map(([name, value]) => ["时间流变", name, value]),
      ...langTop.map(([name, value]) => ["语种", name, value]),
      ...countryTop.map(([name, value]) => ["国家地区", name, value]),
      ...authorTop.map(([name, value]) => ["译者编者", name, value]),
      ...storyTop.map(([name, value]) => ["故事母题", name, value]),
      ...carrierTop.map(([name, value]) => ["文献类型", name, value]),
      ...modeTop.map(([name, value]) => ["翻译方式", name, value]),
      ...publisherTop.map(([name, value]) => ["出版社", name, value]),
    ];
    downloadText("统计图表数据.csv", rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv;charset=utf-8");
  }

  const authorStoryNetwork = useMemo(() => {
    const authors = authorTop.slice(0, 6).map(([name], index) => ({ id: `a-${name}`, label: name, x: 82, y: 48 + index * 40, r: 17 }));
    const stories = storyTop.slice(0, 8).map(([name], index) => ({ id: `s-${name}`, label: name, x: 422, y: 34 + index * 33, r: 15 }));
    const authorNames = new Set(authors.map((node) => node.label));
    const storyNames = new Set(stories.map((node) => node.label));
    const counts = new Map();
    items.forEach((item) => {
      const author = field(item, ["translator", "译者", "editor", "编者"]);
      const story = field(item, ["canonicalName", "规范故事名", "title", "题名"]);
      if (!authorNames.has(author) || !storyNames.has(story)) return;
      const key = `${author}@@${story}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const edges = [...counts.entries()].map(([key, value]) => {
      const [author, story] = key.split("@@");
      return { source: `a-${author}`, target: `s-${story}`, value };
    }).slice(0, 24);
    return { nodes: [...authors, ...stories], edges };
  }, [authorTop, items, storyTop]);

  const propagationNetwork = useMemo(() => {
    const countries = countryTop.slice(0, 4).map(([name], index) => ({ id: `c-${name}`, label: name, x: 62, y: 56 + index * 52, r: 18 }));
    const langs = langTop.slice(0, 4).map(([name], index) => ({ id: `l-${name}`, label: name, x: 260, y: 56 + index * 52, r: 20 }));
    const types = carrierTop.slice(0, 4).map(([name], index) => ({ id: `t-${name}`, label: name, x: 440, y: 56 + index * 52, r: 18 }));
    const countryNames = new Set(countries.map((node) => node.label));
    const langNames = new Set(langs.map((node) => node.label));
    const typeNames = new Set(types.map((node) => node.label));
    const counts = new Map();
    items.forEach((item) => {
      const country = field(item, ["country", "国家", "国家/地区"]);
      const lang = field(item, ["language", "语种"]);
      const type = field(item, ["carrier", "文献载体", "resourceType", "文献类型", "type"]);
      if (countryNames.has(country) && langNames.has(lang)) counts.set(`c-${country}@@l-${lang}`, (counts.get(`c-${country}@@l-${lang}`) || 0) + 1);
      if (langNames.has(lang) && typeNames.has(type)) counts.set(`l-${lang}@@t-${type}`, (counts.get(`l-${lang}@@t-${type}`) || 0) + 1);
    });
    const edges = [...counts.entries()].map(([key, value]) => {
      const [source, target] = key.split("@@");
      return { source, target, value };
    }).slice(0, 28);
    return { nodes: [...countries, ...langs, ...types], edges };
  }, [carrierTop, countryTop, items, langTop]);

  return (
    <div className="work-panel stats-panel compact-stats" ref={panelRef}>
      <div className="panel-title-row stats-title-row">
        <div>
          <strong>{title}</strong>
          <span>{items.length} 条数据 · 时间 / 语种 / 地域 / 文献类型 / 传播关系综合分析</span>
        </div>
        <div className="segmented stats-view-tabs">
          <button className={mode === "overview" ? "active" : ""} type="button" onClick={() => setMode("overview")}>总览</button>
          <button className={mode === "relations" ? "active" : ""} type="button" onClick={() => setMode("relations")}>关系图</button>
          <button type="button" onClick={exportSvg}>导出图表</button>
          <button type="button" onClick={exportCsv}>导出数据</button>
        </div>
      </div>

      {mode === "overview" ? (
        <div className="stats-chart-grid">
          <ChartCard title="时间流变" note="柱形为阶段记录数，折线为累计传播量。"><TimelineChart buckets={yearBuckets} items={items} onSelect={setDetail} /></ChartCard>
          <ChartCard title="语种结构" note="观察故事集跨语种译介的集中度。"><DonutChart data={langTop} onSelect={setDetail} /></ChartCard>
          <ChartCard title="地域出版中心" note="国家/地区分布与出版重心。"><HorizontalBars data={countryTop} onSelect={setDetail} /></ChartCard>
          <ChartCard title="母题与文献类型耦合" note="热力矩阵呈现母题进入不同文献载体的强度。"><MatrixChart items={items} motifs={storyTop.slice(0, 5)} types={carrierTop.slice(0, 4)} onSelect={setDetail} /></ChartCard>
          <ChartCard title="译者/编者参与度" note="译介主体在故事传播中的参与规模。"><AuthorChart data={authorTop} onSelect={setDetail} /></ChartCard>
          <ChartCard title="传播阶段语种层" note="不同阶段内语种结构的叠加变化。"><StageLanguageChart items={items} languages={langTop.slice(0, 4)} onSelect={setDetail} /></ChartCard>
          <ChartCard title="出版地-语种通道" note="从出版地到语种的传播耦合路径。"><PathCouplingChart items={items} countries={countryTop} languages={langTop} onSelect={setDetail} /></ChartCard>
          <ChartCard title="文献类型时间密度" note="文献类型随时间扩散的泡泡矩阵。"><TypeDecadeChart items={items} types={carrierTop} onSelect={setDetail} /></ChartCard>
        </div>
      ) : (
        <div className="stats-relation-grid">
          <NetworkCard title="译者/编者与故事集关系" note="主体与故事母题的二部关系网络。" nodes={authorStoryNetwork.nodes} edges={authorStoryNetwork.edges} onSelect={setDetail} />
          <NetworkCard title="文化传播耦合网络" note="出版地、语种、文献类型之间的三层传播关系。" nodes={propagationNetwork.nodes} edges={propagationNetwork.edges} onSelect={setDetail} />
        </div>
      )}

      {selected && (
        <div className="stats-bottom">
          <strong>{selected.title}</strong>
          <span>{selected.detail}</span>
        </div>
      )}
    </div>
  );
}
