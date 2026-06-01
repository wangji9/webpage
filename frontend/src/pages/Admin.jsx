import { useEffect, useState } from "react";
import PageHero from "../components/PageHero.jsx";
import { api } from "../services/api.js";

export default function Admin({ session }) {
  const [config, setConfig] = useState({ url_base: "", url_key: "", default_model: "gpt-4.1" });
  const [notice, setNotice] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (session.user?.role === "admin") {
      api.llmConfig()
        .then((data) => setConfig((current) => ({ ...current, url_base: data.url_base || "", default_model: data.default_model || "gpt-4.1", url_key: "" })))
        .catch((error) => setNotice(error.message));
    }
  }, [session.user?.role]);

  if (session.user?.role !== "admin") {
    return (
      <>
        <PageHero eyebrow="权限提示" title="管理控制台"><p>仅管理员可访问管理控制台。</p></PageHero>
        <section className="flat-section"><div className="alert">仅管理员可访问管理控制台。</div></section>
      </>
    );
  }

  async function save(event) {
    event.preventDefault();
    setNotice("正在保存配置...");
    try {
      const result = await api.saveLlmConfig(config);
      setConfig((current) => ({ ...current, url_base: result.url_base || current.url_base, default_model: result.default_model || current.default_model, url_key: "" }));
      setNotice(result.has_key ? "大模型配置已保存，url_key 已安全写入后端。" : "配置已保存，但尚未设置 url_key。");
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function test() {
    setTesting(true);
    setNotice("正在测试大模型连通性...");
    try {
      const result = await api.testLlmConfig({ url_base: config.url_base, url_key: config.url_key, model: config.default_model });
      setNotice(`连通测试成功：${result.message || "OK"}`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setTesting(false);
    }
  }

  const tools = [
    ["权限设置", "配置访客、注册用户、研究者用户和管理员的页面访问与操作权限。"],
    ["人员管理", "维护用户资料、所属课题组、角色、账号状态与审核记录。"],
    ["数据审核", "查看上传记录、解析结果、人工修订内容，并决定是否入库。"],
    ["知识库维护", "管理分区、子库、字段规范、关系类型和图谱联动规则。"]
  ];

  return (
    <>
      <PageHero eyebrow="后台管理" title="管理控制台"><p>管理员可配置大模型 API、权限、人员、数据审核与知识库维护。</p></PageHero>
      <section className="admin-page">
        <form className="work-panel llm-config-panel" onSubmit={save}>
          <div className="panel-title-row">
            <div><strong>大模型 API 接入</strong><span>OpenAI-compatible /v1/chat/completions 接口</span></div>
          </div>
          <div className="llm-config-grid">
            <label>url_base
              <input value={config.url_base} onChange={(event) => setConfig((current) => ({ ...current, url_base: event.target.value }))} placeholder="https://api.openai.com/v1 或兼容服务地址" />
            </label>
            <label>url_key
              <input value={config.url_key} onChange={(event) => setConfig((current) => ({ ...current, url_key: event.target.value }))} placeholder="保存后不回显；留空表示不覆盖已有 key" type="password" />
            </label>
            <label>默认模型
              <input value={config.default_model} onChange={(event) => setConfig((current) => ({ ...current, default_model: event.target.value }))} placeholder="gpt-4.1 / gpt-4o / qwen-plus ..." />
            </label>
          </div>
          <div className="llm-actions">
            <button type="submit">保存配置</button>
            <button disabled={testing} type="button" onClick={test}>{testing ? "测试中" : "测试连通"}</button>
            {notice && <span>{notice}</span>}
          </div>
        </form>

        <div className="admin-grid">
          {tools.map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p><button disabled type="button">待接入</button></article>)}
        </div>
      </section>
    </>
  );
}
