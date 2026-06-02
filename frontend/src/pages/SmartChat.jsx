import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import { modelProviders, mockKnowledgeItems, mockMapFlows } from "../data/mockData.js";
import storyData from "../data/storyCollections.json";
import GraphCanvas from "../components/GraphCanvas.jsx";
import MapVisualization from "../components/MapVisualization.jsx";
import ChinaStoryMap from "../components/ChinaStoryMap.jsx";
import StatisticsPanel from "../components/StatisticsPanel.jsx";

const HISTORY_KEY = "china-narrative-chat-history";

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
}

function inferVisual(question, answer) {
  const text = `${question} ${answer?.visuals?.type || ""}`.toLowerCase();
  if (/智能体|传播路径|路径图|中国地图|省级|china-agent/.test(text)) return "agent-map";
  if (/统计|词云|词频|分布|趋势|stats/.test(text)) return "stats";
  if (/地图|路线|传播|国家|map|route/.test(text) && /图谱|关系|网络|graph/.test(text)) return "mixed";
  if (/地图|路线|传播|国家|map|route/.test(text)) return "map";
  if (/图谱|关系|网络|graph|graphrag/.test(text)) return "graph";
  return answer?.visuals?.type || "text";
}

function graphWithItems(graph, items) {
  if (!graph) return null;
  const itemNodes = items.map((item, index) => ({
    id: `item-${item.id}`,
    label: item.translatedTitle?.length > 18 ? `${item.canonicalTitle}-${item.year}` : item.translatedTitle,
    type: item.resourceType,
    section: item.sectionId,
    year: item.year,
    lang: item.language,
    x: 0.12 + ((index * 37) % 78) / 100,
    y: 0.16 + ((index * 29) % 72) / 100,
    size: 10
  }));
  const itemEdges = items.flatMap((item) => (item.graphNodeIds || []).slice(0, 2).map((nodeId) => ({
    from: nodeId,
    to: `item-${item.id}`,
    relation: item.resourceType,
    note: `${item.canonicalTitle}上传条目`
  })));
  return { nodes: [...graph.nodes, ...itemNodes], edges: [...graph.edges, ...itemEdges] };
}

async function fileToAttachment(file) {
  const base = { id: `${Date.now()}-${file.name}`, name: file.name, type: file.type || "application/octet-stream", size: file.size };
  if (file.type.startsWith("text/") || /\.(txt|md|csv|json|xml|html)$/i.test(file.name)) {
    return { ...base, text: (await file.text()).slice(0, 12000) };
  }
  if (file.type.startsWith("image/")) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return { ...base, dataUrl, text: `图片附件：${file.name}` };
  }
  return { ...base, text: `附件 ${file.name} 已上传，当前浏览器端仅传递文件名、类型和大小。` };
}

function agentAnswer(question) {
  if (/传播|路径|地图/.test(question)) {
    return "已根据故事集年份、来源省区与海外出版地生成传播路径图。";
  }
  if (/表格|子故事|故事集/.test(question)) {
    return "已根据故事集总表和“图书/期刊名”匹配结果生成嵌套表格。";
  }
  return "已基于当前故事集数据生成对应的图表结果。";
}

function normalizeMarkdown(text = "") {
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\s+(#{2,4}\s+)/g, "\n\n$1")
    .replace(/\s+(\d+\.\s+\*\*)/g, "\n$1")
    .replace(/\s+(-\s+\*\*)/g, "\n$1")
    .replace(/\s+(-\s+《)/g, "\n$1")
    .trim();
}

function renderInlineMarkdown(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2).trim()}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

function renderMarkdown(text) {
  const lines = normalizeMarkdown(text).split("\n").map((line) => line.trim()).filter(Boolean);
  const blocks = [];
  let list = [];

  function flushList() {
    if (!list.length) return;
    const ordered = list.every((item) => item.type === "ol");
    const Tag = ordered ? "ol" : "ul";
    blocks.push(
      <Tag className="markdown-list" key={`list-${blocks.length}`}>
        {list.map((item, index) => <li key={index}>{renderInlineMarkdown(item.text)}</li>)}
      </Tag>
    );
    list = [];
  }

  lines.forEach((line) => {
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = Math.min(heading[1].length + 2, 4);
      const HeadingTag = `h${level}`;
      blocks.push(<HeadingTag className="markdown-heading" key={`heading-${blocks.length}`}>{renderInlineMarkdown(heading[2])}</HeadingTag>);
      return;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      list.push({ type: "ol", text: ordered[1] });
      return;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      list.push({ type: "ul", text: unordered[1] });
      return;
    }

    flushList();
    blocks.push(<p key={`p-${blocks.length}`}>{renderInlineMarkdown(line)}</p>);
  });

  flushList();
  return blocks.length ? blocks : <p>{text}</p>;
}

function ChatAvatar({ role }) {
  if (role === "user") {
    return (
      <div className="chat-avatar user-avatar" aria-hidden="true">
        <svg viewBox="0 0 40 40" role="img">
          <circle cx="20" cy="14" r="7" />
          <path d="M8 34c1.8-8 6.3-12 12-12s10.2 4 12 12" />
        </svg>
      </div>
    );
  }

  return (
    <div className="chat-avatar assistant-avatar" aria-hidden="true">
      <svg viewBox="0 0 44 44" role="img">
        <rect x="9" y="12" width="26" height="24" rx="8" />
        <path d="M17 12V8m10 4V8M9 24H5m34 0h-4" />
        <circle cx="18" cy="24" r="2.4" />
        <circle cx="26" cy="24" r="2.4" />
        <path d="M17 31c3 2 7 2 10 0" />
      </svg>
    </div>
  );
}

function ChatMeta({ meta }) {
  if (!meta) return null;
  const elapsed = typeof meta.elapsed_ms === "number" ? `${(meta.elapsed_ms / 1000).toFixed(2)}s` : "计算中";
  const tokenText = meta.tokens ? `${meta.token_estimated ? "约 " : ""}${meta.tokens}` : "未返回";
  const evidence = Array.isArray(meta.evidence) && meta.evidence.length ? meta.evidence.slice(0, 4).join("；") : "无";
  return (
    <div className="chat-answer-meta">
      <span>Token：{tokenText}</span>
      <span>耗时：{elapsed}</span>
      <span>数据库：{meta.database || "无"}</span>
      <span>依据：{evidence}</span>
    </div>
  );
}

export default function SmartChat({ sections = [] }) {
  const [items, setItems] = useState([]);
  const [graph, setGraph] = useState(null);
  const [sectionId, setSectionId] = useState("stories");
  const [provider, setProvider] = useState("gpt");
  const [model, setModel] = useState("gpt-5.2");
  const [retrievalMode, setRetrievalMode] = useState("graph-rag");
  const [question, setQuestion] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [history, setHistory] = useState(() => readHistory());
  const [conversationId, setConversationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "我可以调用已配置的大模型 API，并按问题返回文本、知识图谱、传播地图、统计图或故事集传播路径智能体结果。你也可以上传附件作为上下文。" }
  ]);

  useEffect(() => {
    api.knowledgeItems().then((data) => setItems(data.items || [])).catch(() => setItems(mockKnowledgeItems));
    api.graph().then(setGraph).catch(() => {});
  }, []);

  useEffect(() => writeHistory(history), [history]);

  const providerInfo = modelProviders.find((item) => item.id === provider) || modelProviders[0];
  const section = sections.find((item) => item.id === sectionId) || sections[0] || { title: "知识库" };
  const scopedItems = useMemo(() => items.filter((item) => item.sectionId === sectionId), [items, sectionId]);
  const visualGraph = useMemo(() => graphWithItems(graph, scopedItems), [graph, scopedItems]);
  const storyStatsItems = useMemo(() => storyData.childStories.map((item) => ({
    ...item,
    country: item.country || item.nationality,
    translator: item.translator || item.editor
  })), []);

  function handleProvider(value) {
    const next = modelProviders.find((item) => item.id === value) || modelProviders[0];
    setProvider(next.id);
    setModel(next.models[0]);
  }

  function newConversation() {
    setConversationId("");
    setMessages([{ role: "assistant", text: "新的研究对话已开始。请提出问题，或上传附件后一起分析。" }]);
    setAttachments([]);
    setQuestion("");
  }

  function saveConversation(nextMessages) {
    const title = nextMessages.find((item) => item.role === "user")?.text?.slice(0, 28) || "未命名对话";
    const id = conversationId || `${Date.now()}`;
    const record = { id, title, sectionId, provider, model, retrievalMode, messages: nextMessages, updatedAt: new Date().toLocaleString("zh-CN", { hour12: false }) };
    setConversationId(id);
    setHistory((current) => [record, ...current.filter((item) => item.id !== id)]);
  }

  function loadConversation(record) {
    setConversationId(record.id);
    setSectionId(record.sectionId || "stories");
    setProvider(record.provider || "gpt");
    setModel(record.model || "gpt-5.2");
    setRetrievalMode(record.retrievalMode || "graph-rag");
    setMessages(record.messages || []);
  }

  function deleteConversation(id) {
    setHistory((current) => current.filter((item) => item.id !== id));
    if (conversationId === id) newConversation();
  }

  async function handleFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const parsed = await Promise.all(files.map(fileToAttachment));
    setAttachments((current) => [...parsed, ...current].slice(0, 8));
    event.target.value = "";
  }

  async function submit(event) {
    event.preventDefault();
    const content = question.trim();
    if ((!content && !attachments.length) || loading) return;
    const userMessage = { role: "user", text: content || "请分析已上传附件。", attachments };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setQuestion("");
    setAttachments([]);

    if (/智能体|传播路径|中国地图|省级|路径图/.test(content)) {
      const finalMessages = [...nextMessages, { role: "assistant", text: agentAnswer(content), intent: "agent-map" }];
      setMessages(finalMessages);
      saveConversation(finalMessages);
      return;
    }

    setLoading(true);
    const assistantIndex = nextMessages.length;
    setMessages([...nextMessages, { role: "assistant", text: "", question: userMessage.text, answer: { visuals: null }, streaming: true }]);
    let accumulated = "";
    let scheduledFrame = 0;
    let pendingText = "";
    let responseMeta = {};

    function updateStreamingMessage(text, streaming = true) {
      pendingText = text;
      if (scheduledFrame) return;
      scheduledFrame = window.requestAnimationFrame(() => {
        scheduledFrame = 0;
        setMessages((current) => current.map((item, index) => index === assistantIndex ? { ...item, text: pendingText, streaming } : item));
      });
    }

    function flushStreamingMessage(text, streaming = false) {
      if (scheduledFrame) {
        window.cancelAnimationFrame(scheduledFrame);
        scheduledFrame = 0;
      }
      setMessages((current) => current.map((item, index) => index === assistantIndex ? { ...item, text, streaming } : item));
    }

    try {
      await api.streamChat({ question: userMessage.text, sectionId, provider, model, retrievalMode, attachments }, (chunk) => {
        if (chunk.meta) {
          responseMeta = { ...responseMeta, ...chunk.meta };
        }
        if (chunk.text) {
          accumulated += chunk.text;
          updateStreamingMessage(accumulated);
        }
        if (chunk.error) {
          flushStreamingMessage(chunk.error, false);
          setMessages((current) => current.map((item, index) => index === assistantIndex ? { ...item, meta: responseMeta, retrievalMode } : item));
          setLoading(false);
        }
        if (chunk.done) {
          const finalText = accumulated || "大模型没有返回内容。";
          const finalMessages = [...nextMessages, { role: "assistant", text: finalText, question: userMessage.text, answer: { visuals: { type: retrievalMode === "none" ? "text" : inferVisual(userMessage.text, {}) } }, meta: responseMeta, retrievalMode, streaming: false }];
          setMessages(finalMessages);
          saveConversation(finalMessages);
          setLoading(false);
        }
      });
    } catch (error) {
      const finalMessages = [...nextMessages, { role: "assistant", text: error.message || "大模型调用失败，请检查管理员接口配置。", meta: responseMeta, retrievalMode }];
      setMessages(finalMessages);
      saveConversation(finalMessages);
      setLoading(false);
    }
  }

  function renderVisual(message) {
    if (message.retrievalMode === "none") return null;
    const type = message.intent || inferVisual(message.question || message.text || "", message.answer || {});
    const answerItems = scopedItems.slice(0, 8);
    const flows = mockMapFlows.filter((flow) => flow.sectionId === sectionId);
    if (type === "agent-map") {
      return (
        <div className="chat-visual-stack">
          <ChinaStoryMap flows={storyData.flows} title="智能体生成传播路径图" />
        </div>
      );
    }
    if ((type === "graph" || type === "mixed") && visualGraph) {
      return <GraphCanvas graph={visualGraph} sections={sections} focusNodeIds={answerItems.flatMap((item) => item.graphNodeIds || [])} initialFilter={sectionId} title="问答关联图谱" />;
    }
    if (type === "map" || type === "mixed") {
      return <MapVisualization flows={flows.length ? flows : mockMapFlows.filter((flow) => flow.sectionId === sectionId)} sections={sections} title={`${section?.title || "知识库"}传播地图`} />;
    }
    if (type === "stats") {
      return <StatisticsPanel items={sectionId === "stories" ? storyStatsItems : answerItems} title="问答统计分析" />;
    }
    return null;
  }

  return (
    <section className="chat-page advanced-chat-page">
      <aside className="chat-side work-panel">
        <div className="chat-side-head">
          <strong>智能问答</strong>
          <button type="button" onClick={newConversation}>新对话</button>
        </div>
        <label>知识范围
          <select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
            {sections.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <label>模型供应商
          <select value={provider} onChange={(event) => handleProvider(event.target.value)}>
            {modelProviders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>模型
          <select value={model} onChange={(event) => setModel(event.target.value)}>
            {providerInfo.models.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>检索技术
          <select value={retrievalMode} onChange={(event) => setRetrievalMode(event.target.value)}>
            <option value="none">无：直接使用大模型</option>
            <option value="graph-rag">GraphRAG：知识图谱</option>
            <option value="rag">RAG：语义召回</option>
          </select>
        </label>
        <div className="agent-card">
          <strong>智能体绘图能力</strong>
          <p>作为智能问答的一部分，可根据问题完成传播路径图、嵌套表格和统计图生成。</p>
        </div>
        <div className="conversation-history">
          <strong>历史对话</strong>
          {history.length ? history.map((record) => (
            <div className={record.id === conversationId ? "history-item active" : "history-item"} key={record.id}>
              <button type="button" onClick={() => loadConversation(record)}><span>{record.title}</span><small>{record.updatedAt}</small></button>
              <button aria-label="删除对话" type="button" onClick={() => deleteConversation(record.id)}>删除</button>
            </div>
          )) : <p>暂无保存的历史对话。</p>}
        </div>
      </aside>

      <div className="chat-main work-panel">
        <div className="chat-thread">
          {messages.map((message, index) => (
            !message.text && message.streaming ? null :
            <article className={`chat-message-row ${message.role}`} key={`${message.role}-${index}`}>
              <ChatAvatar role={message.role} />
              <div className={`chat-bubble ${message.role}`}>
                <div className="markdown-body">{renderMarkdown(message.text)}</div>
                {message.attachments?.length > 0 && (
                  <div className="attachment-strip">{message.attachments.map((file) => <span key={file.id}>{file.name}</span>)}</div>
                )}
                {renderVisual(message)}
                {message.role === "assistant" && <ChatMeta meta={message.meta} />}
              </div>
            </article>
          ))}
        </div>
        <form className="chat-composer advanced-composer" onSubmit={submit}>
          <div className="composer-attachments">
            <label className="attach-button">上传附件
              <input accept=".txt,.md,.csv,.json,.pdf,.doc,.docx,image/*,text/*" multiple onChange={handleFiles} type="file" />
            </label>
            {attachments.map((file) => (
              <span key={file.id}>{file.name}<button type="button" onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))}>×</button></span>
            ))}
          </div>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") submit(event);
            }}
            placeholder="询问译本、传播路径、知识图谱、统计图，或输入“用智能体绘制传播路径图”"
          />
          <button type="submit">{loading ? "生成中" : "发送"}</button>
        </form>
      </div>
    </section>
  );
}

