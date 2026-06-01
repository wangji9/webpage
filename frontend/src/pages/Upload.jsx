import PageHero from "../components/PageHero.jsx";

export default function Upload() {
  return (
    <>
      <PageHero eyebrow="资料入库流程" title="数据上传">
        <p>支持 PDF、Word、Excel 文件上传与解析；当前版本先放置流程、解析预览与人工确认区域。</p>
      </PageHero>
      <section className="upload-layout">
        <div className="drop-zone">
          <h3>上传区域</h3>
          <p>支持格式：PDF、Word、Excel</p>
          <button disabled type="button">选择文件</button>
          <small>功能待接入：在线解析、预览、修改与提交审核</small>
        </div>
        <div className="preview-panel">
          <h3>解析预览区域</h3>
          <table>
            <thead><tr><th>字段</th><th>识别内容示例</th><th>状态</th></tr></thead>
            <tbody>
              <tr><td>标题</td><td>《论语》某语种译本</td><td>待确认</td></tr>
              <tr><td>译者</td><td>译者姓名 / 机构</td><td>待确认</td></tr>
              <tr><td>出版信息</td><td>出版地、出版社、年份</td><td>待确认</td></tr>
              <tr><td>关系抽取</td><td>翻译、转译、评论、引用</td><td>待确认</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
