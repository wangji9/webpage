import { useEffect, useMemo, useRef, useState } from "react";
import VisualModal, { ExpandButton } from "./VisualModal.jsx";

const relationSet = new Set(["传播", "出版", "翻译", "海外传播", "改写", "编译", "母题关联"]);

function downloadText(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function isItemNode(node) {
  return String(node.id).startsWith("item-");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shortLabel(label, max = 12) {
  return label.length > max ? `${label.slice(0, max)}...` : label;
}

export default function GraphCanvas({ graph, sections, focusNodeIds = [], initialFilter = "all", onNodeSelect, title = "知识图谱", allowExpand = true }) {
  const canvasRef = useRef(null);
  const nodesRef = useRef([]);
  const dragRef = useRef(null);
  const frameRef = useRef(0);
  const transformRef = useRef({ scale: 1, ox: 0, oy: 0 });
  const [filter, setFilter] = useState(initialFilter);
  const [selected, setSelected] = useState(null);
  const [trace, setTrace] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [relationQuery, setRelationQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const focusSet = useMemo(() => new Set(focusNodeIds), [focusNodeIds]);
  const sectionMap = useMemo(() => new Map(sections.map((item) => [item.id, item])), [sections]);
  const scopedNodes = useMemo(() => graph.nodes.filter((node) => filter === "all" || node.section === filter), [filter, graph.nodes]);
  const nodeTypeOptions = useMemo(() => [...new Set(scopedNodes.map((node) => node.type).filter(Boolean))].sort(), [scopedNodes]);
  const searchSeeds = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const relationKeyword = relationQuery.trim().toLowerCase();
    const scopedIds = new Set(scopedNodes.map((node) => node.id));
    const relationMatchedIds = new Set();
    if (relationKeyword) {
      graph.edges.forEach((edge) => {
        const relationText = `${edge.relation || ""} ${edge.note || ""}`.toLowerCase();
        if (relationText.includes(relationKeyword) && scopedIds.has(edge.from) && scopedIds.has(edge.to)) {
          relationMatchedIds.add(edge.from);
          relationMatchedIds.add(edge.to);
        }
      });
    }
    return scopedNodes.filter((node) => {
      const text = `${node.label || ""} ${node.type || ""} ${node.year || ""} ${node.lang || ""}`.toLowerCase();
      const keywordOk = !keyword || text.includes(keyword);
      const typeOk = typeFilter === "all" || node.type === typeFilter;
      const relationOk = !relationKeyword || relationMatchedIds.has(node.id);
      return keywordOk && typeOk && relationOk;
    });
  }, [graph.edges, query, relationQuery, scopedNodes, typeFilter]);
  const visibleNodes = useMemo(() => {
    const hasSearch = Boolean(query.trim() || relationQuery.trim());
    if (!hasSearch) return searchSeeds;
    const scopedIds = new Set(scopedNodes.map((node) => node.id));
    const visible = new Set(searchSeeds.map((node) => node.id));
    const frontier = new Set(visible);
    for (let hop = 0; hop < 2; hop += 1) {
      const next = new Set();
      graph.edges.forEach((edge) => {
        if (!scopedIds.has(edge.from) || !scopedIds.has(edge.to)) return;
        if (frontier.has(edge.from) && !visible.has(edge.to)) next.add(edge.to);
        if (frontier.has(edge.to) && !visible.has(edge.from)) next.add(edge.from);
      });
      next.forEach((id) => visible.add(id));
      frontier.clear();
      next.forEach((id) => frontier.add(id));
    }
    return scopedNodes.filter((node) => visible.has(node.id));
  }, [graph.edges, query, relationQuery, scopedNodes, searchSeeds]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(() => graph.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)), [graph.edges, visibleIds]);
  const layoutKey = useMemo(() => visibleNodes.map((node) => node.id).join("|"), [visibleNodes]);
  const pathInsights = useMemo(() => {
    const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
    const seedIds = new Set((selected ? [selected] : searchSeeds).map((node) => node.id));
    const oneHop = [];
    const twoHop = [];
    graph.edges.forEach((edge) => {
      if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) return;
      if (seedIds.has(edge.from) || seedIds.has(edge.to)) {
        const source = nodeMap.get(edge.from);
        const target = nodeMap.get(edge.to);
        oneHop.push({ edge, text: `${source?.label || edge.from} → ${edge.relation} → ${target?.label || edge.to}` });
      }
    });
    graph.edges.forEach((first) => {
      if (!seedIds.has(first.from) && !seedIds.has(first.to)) return;
      const mid = seedIds.has(first.from) ? first.to : first.from;
      graph.edges.forEach((second) => {
        if (second === first) return;
        if (second.from !== mid && second.to !== mid) return;
        const end = second.from === mid ? second.to : second.from;
        if (seedIds.has(end) || !visibleIds.has(end)) return;
        const a = nodeMap.get(seedIds.has(first.from) ? first.from : first.to);
        const b = nodeMap.get(mid);
        const c = nodeMap.get(end);
        twoHop.push({ key: `${first.from}-${first.to}-${second.from}-${second.to}`, text: `${a?.label || ""} → ${first.relation} → ${b?.label || mid} → ${second.relation} → ${c?.label || end}` });
      });
    });
    return {
      oneHop: oneHop.slice(0, 6),
      twoHop: twoHop.slice(0, 6)
    };
  }, [graph.edges, graph.nodes, searchSeeds, selected, visibleIds]);

  function colorFor(node) {
    return sectionMap.get(node.section)?.color || "#2468ff";
  }

  useEffect(() => {
    if (initialFilter !== filter) {
      setFilter(initialFilter);
      setSelected(null);
    }
  }, [initialFilter]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    function updateSize() {
      const rect = canvas.getBoundingClientRect();
      setCanvasSize((current) => {
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        if (Math.abs(current.width - width) < 2 && Math.abs(current.height - height) < 2) return current;
        return { width, height };
      });
    }
    updateSize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateSize) : null;
    observer?.observe(canvas);
    window.addEventListener("resize", updateSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(rect.width || canvasSize.width, 300);
    const height = Math.max(rect.height || canvasSize.height, 360);
    const compact = width < 560;
    const bounds = {
      left: compact ? 34 : 86,
      right: compact ? 96 : 170,
      top: compact ? 58 : 78,
      bottom: compact ? 48 : 72
    };
    const baseGap = compact ? 58 : 92;
    const itemGap = compact ? 26 : 34;
    const itemRing = compact ? 58 : 92;
    const itemRingStep = compact ? 28 : 38;
    const baseNodes = visibleNodes.filter((node) => !isItemNode(node));
    const itemNodes = visibleNodes.filter(isItemNode);
    const basePositions = new Map();

    baseNodes.forEach((node, index) => {
      const ringIndex = index % Math.max(1, baseNodes.length);
      const angle = (ringIndex / Math.max(1, baseNodes.length)) * Math.PI * 2 - Math.PI / 2;
      const fallbackRadius = Math.min(width, height) * 0.26;
      const px = node.x ? node.x * width : width / 2 + Math.cos(angle) * fallbackRadius;
      const py = node.y ? node.y * height : height / 2 + Math.sin(angle) * fallbackRadius;
      basePositions.set(node.id, {
        ...node,
        px: clamp(px, bounds.left, Math.max(bounds.left, width - bounds.right)),
        py: clamp(py, bounds.top, Math.max(bounds.top, height - bounds.bottom)),
        vx: 0,
        vy: 0,
        fixed: true
      });
    });

    const itemGroups = new Map();
    itemNodes.forEach((node) => {
      const edge = visibleEdges.find((item) => item.to === node.id || item.from === node.id);
      const anchorId = edge ? (edge.to === node.id ? edge.from : edge.to) : "center";
      itemGroups.set(anchorId, [...(itemGroups.get(anchorId) || []), node]);
    });

    itemGroups.forEach((group, anchorId) => {
      const anchor = basePositions.get(anchorId) || { px: width / 2, py: height / 2 };
      group.forEach((node, index) => {
        const angle = ((index / Math.max(1, group.length)) * Math.PI * 2) + (anchor.px > width / 2 ? Math.PI : 0);
        const ring = itemRing + Math.floor(index / 10) * itemRingStep;
        basePositions.set(node.id, {
          ...node,
          px: clamp(anchor.px + Math.cos(angle) * ring, compact ? 28 : 42, Math.max(compact ? 28 : 42, width - (compact ? 42 : 84))),
          py: clamp(anchor.py + Math.sin(angle) * ring, compact ? 54 : 72, Math.max(compact ? 54 : 72, height - 46)),
          vx: 0,
          vy: 0,
          fixed: true
        });
      });
    });

    const nodes = [...basePositions.values()];
    for (let iteration = 0; iteration < 42; iteration += 1) {
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          const minDistance = (isItemNode(a) || isItemNode(b)) ? itemGap : baseGap;
          const dx = b.px - a.px || 0.1;
          const dy = b.py - a.py || 0.1;
          const dist = Math.hypot(dx, dy);
          if (dist < minDistance) {
            const push = (minDistance - dist) * 0.18;
            const ux = dx / dist;
            const uy = dy / dist;
            if (isItemNode(a)) {
              a.px -= ux * push;
              a.py -= uy * push;
            }
            if (isItemNode(b)) {
              b.px += ux * push;
              b.py += uy * push;
            }
          }
        }
      }
      nodes.forEach((node) => {
        node.px = clamp(node.px, compact ? 28 : 42, Math.max(compact ? 28 : 42, width - (compact ? 42 : 84)));
        node.py = clamp(node.py, compact ? 54 : 72, Math.max(compact ? 54 : 72, height - 46));
      });
    }
    nodesRef.current = nodes;
    transformRef.current = { scale: 1, ox: 0, oy: 0 };
  }, [canvasSize.height, canvasSize.width, layoutKey, visibleEdges]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let mounted = true;

    function draw() {
      if (!mounted) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const width = rect.width;
      const height = rect.height;
      const transform = transformRef.current;
      const nodes = nodesRef.current;
      const nodeMap = new Map(nodes.map((node) => [node.id, node]));

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#f8fbff";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "#e4eef7";
      ctx.lineWidth = 1;
      for (let x = 0; x <= width; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(transform.ox, transform.oy);
      ctx.scale(transform.scale, transform.scale);

      visibleEdges.forEach((edge) => {
        const a = nodeMap.get(edge.from);
        const b = nodeMap.get(edge.to);
        if (!a || !b) return;
        const active = focusSet.has(edge.from) || focusSet.has(edge.to) || selected?.id === edge.from || selected?.id === edge.to;
        const midX = (a.px + b.px) / 2;
        const midY = (a.py + b.py) / 2 - 24;
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.quadraticCurveTo(midX, midY, b.px, b.py);
        ctx.strokeStyle = active ? colorFor(b) : trace && relationSet.has(edge.relation) ? "#8aa7c5" : "#c9d9eb";
        ctx.lineWidth = active ? 1.8 : isItemNode(a) || isItemNode(b) ? 0.55 : 0.8;
        ctx.globalAlpha = active ? 0.86 : isItemNode(a) || isItemNode(b) ? 0.24 : 0.56;
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (active || (!isItemNode(a) && !isItemNode(b))) {
          ctx.font = "12px Microsoft YaHei, sans-serif";
          ctx.fillStyle = "#f8fbff";
          const labelWidth = ctx.measureText(edge.relation).width + 14;
          ctx.fillRect(midX + 2, midY - 18, labelWidth, 20);
          ctx.strokeStyle = "#dce7f2";
          ctx.strokeRect(midX + 2, midY - 18, labelWidth, 20);
          ctx.fillStyle = active ? "#0b66b2" : "#52677a";
          ctx.fillText(edge.relation, midX + 9, midY - 4);
        }
      });

      nodes.forEach((node) => {
        const active = selected?.id === node.id;
        const focused = focusSet.has(node.id);
        const matched = query && node.label.toLowerCase().includes(query.toLowerCase());
        const baseRadius = isItemNode(node) ? Math.min(node.size || 7, 7) : Math.min(node.size || 14, 22);
        const radius = baseRadius + (active ? 5 : focused || matched ? 3 : 0);
        if (active || focused || matched) {
          ctx.beginPath();
          ctx.arc(node.px, node.py, radius + 10, 0, Math.PI * 2);
          ctx.fillStyle = `${colorFor(node)}20`;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(node.px, node.py, radius, 0, Math.PI * 2);
        ctx.fillStyle = colorFor(node);
        ctx.fill();
        ctx.strokeStyle = active || focused || matched ? "#111827" : "#ffffff";
        ctx.lineWidth = active || focused || matched ? 1.8 : 1.2;
        ctx.stroke();
        if (!isItemNode(node) || active || focused || matched || query) {
          const label = shortLabel(node.label, active || focused || matched ? 18 : 10);
          ctx.font = `${active || focused || matched ? 900 : 750} 13px Microsoft YaHei, sans-serif`;
          const labelWidth = ctx.measureText(label).width + 14;
          const labelRightX = node.px + radius + 7;
          const labelLeftX = node.px - radius - 7 - labelWidth;
          const labelX = labelRightX + labelWidth > width - 8 ? Math.max(8, labelLeftX) : labelRightX;
          const labelY = clamp(node.py - 11, 8, Math.max(8, height - 30));
          ctx.fillStyle = active || focused || matched ? "#ffffff" : "rgba(248,251,255,0.86)";
          ctx.fillRect(labelX, labelY, labelWidth, 22);
          ctx.strokeStyle = active || focused || matched ? colorFor(node) : "#dbe7f3";
          ctx.strokeRect(labelX, labelY, labelWidth, 22);
          ctx.fillStyle = "#1f2937";
          ctx.fillText(label, labelX + 7, labelY + 16);
        }
      });
      ctx.restore();

      ctx.fillStyle = "#0b66b2";
      ctx.font = "900 18px Microsoft YaHei, sans-serif";
      ctx.fillText(title, 18, 30);
      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);
    return () => {
      mounted = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, [visibleEdges, focusSet, query, selected, sections, title, trace]);

  function eventPoint(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    const transform = transformRef.current;
    return {
      x: (event.clientX - rect.left - transform.ox) / transform.scale,
      y: (event.clientY - rect.top - transform.oy) / transform.scale
    };
  }

  function pickNode(event) {
    const p = eventPoint(event);
    return [...nodesRef.current].reverse().find((node) => Math.hypot(node.px - p.x, node.py - p.y) < (node.size || 16) + 12);
  }

  function handlePointerDown(event) {
    const node = pickNode(event);
    if (!node) return;
    node.fixed = true;
    dragRef.current = node;
    setSelected(node);
    if (onNodeSelect) onNodeSelect(node);
    canvasRef.current.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!dragRef.current) return;
    const p = eventPoint(event);
    dragRef.current.px = p.x;
    dragRef.current.py = p.y;
  }

  function handlePointerUp(event) {
    if (dragRef.current) {
      dragRef.current.fixed = false;
      dragRef.current = null;
    }
    canvasRef.current.releasePointerCapture?.(event.pointerId);
  }

  function handleClick(event) {
    const node = pickNode(event);
    setSelected(node || null);
    if (node && onNodeSelect) onNodeSelect(node);
  }

  function handleWheel(event) {
    event.preventDefault();
    const transform = transformRef.current;
    const next = Math.max(0.72, Math.min(1.9, transform.scale + (event.deltaY > 0 ? -0.08 : 0.08)));
    transform.scale = next;
  }

  function exportPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "知识图谱.png";
    link.click();
  }

  function exportJson() {
    downloadText("知识图谱数据.json", JSON.stringify({ nodes: visibleNodes, edges: visibleEdges }, null, 2), "application/json");
  }

  return (
    <>
    <div className="graph-workspace graph-network">
      <div className="toolbar flat-toolbar graph-toolbar">
        <label>
          分区
          <select value={filter} onChange={(event) => { setFilter(event.target.value); setSelected(null); }}>
            <option value="all">全部</option>
            {sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}
          </select>
        </label>
        <label>
          节点搜索
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入作品、译者、城市" />
        </label>
        <label>
          类型
          <select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setSelected(null); }}>
            <option value="all">全部类型</option>
            {nodeTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label>
          关系
          <input value={relationQuery} onChange={(event) => setRelationQuery(event.target.value)} placeholder="翻译、出版、传播" />
        </label>
        <button type="button" className={trace ? "is-on" : ""} onClick={() => setTrace((value) => !value)}>关系路径</button>
        <button type="button" onClick={() => { setQuery(""); setTypeFilter("all"); setRelationQuery(""); setSelected(null); }}>重置检索</button>
        {allowExpand && <ExpandButton onClick={() => setModalOpen(true)} label="放大图谱" />}
        <button type="button" onClick={exportPng}>导出图谱</button>
        <button type="button" onClick={exportJson}>导出数据</button>
      </div>
      <div className="graph-grid">
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
        />
        <aside>
          <h3>{selected ? selected.label : "节点详情"}</h3>
          {selected ? (
            <dl>
              <dt>类型</dt><dd>{selected.type}</dd>
              <dt>时间</dt><dd>{selected.year}</dd>
              <dt>语种</dt><dd>{selected.lang}</dd>
              <dt>分区</dt><dd>{sectionMap.get(selected.section)?.title}</dd>
            </dl>
          ) : <p>选择节点后显示实体信息和关系位置。</p>}
          <div className="graph-results">
            <strong>检索结果</strong>
            {visibleNodes.length ? visibleNodes.slice(0, 10).map((node) => (
              <button className={selected?.id === node.id ? "active" : ""} key={node.id} type="button" onClick={() => { setSelected(node); if (onNodeSelect) onNodeSelect(node); }}>
                <span>{node.label}</span>
                <small>{node.type} · {node.year || "无年份"} · {node.lang || "未标注"}</small>
              </button>
            )) : <p>没有匹配节点，请调整关键词、类型或关系条件。</p>}
          </div>
          <div className="graph-path-insights">
            <strong>关系路径</strong>
            <span>一跳关系</span>
            {pathInsights.oneHop.length ? pathInsights.oneHop.map((item) => <p key={`${item.edge.from}-${item.edge.to}`}>{item.text}</p>) : <p>暂无一跳关系。</p>}
            <span>二跳扩展</span>
            {pathInsights.twoHop.length ? pathInsights.twoHop.map((item) => <p key={item.key}>{item.text}</p>) : <p>暂无二跳扩展。</p>}
          </div>
          <div className="graph-legend">
            {sections.map((section) => <span key={section.id}><i style={{ background: section.color }} />{section.title}</span>)}
          </div>
          <div className="graph-summary">
            <span><b>{visibleNodes.length}</b>实体节点</span>
            <span><b>{visibleEdges.length}</b>关系三元组</span>
          </div>
        </aside>
      </div>
    </div>
    {allowExpand && (
      <VisualModal open={modalOpen} title={title} subtitle="滚轮缩放、拖拽节点，使用顶部按钮调整窗口缩放" onClose={() => setModalOpen(false)}>
        <GraphCanvas
          graph={graph}
          sections={sections}
          focusNodeIds={focusNodeIds}
          initialFilter={filter}
          onNodeSelect={onNodeSelect}
          title={title}
          allowExpand={false}
        />
      </VisualModal>
    )}
    </>
  );
}
