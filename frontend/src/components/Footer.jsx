export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-logos">
        <img src="/assets/sisu-logo-cropped.png" alt="上海外国语大学" />
        <img src="/assets/research-center-logo-cropped.png" alt="中国话语与世界文学研究中心" />
      </div>
      <section className="footer-contact" aria-label="联系我们">
        <h2>联系我们</h2>
        <dl>
          <div>
            <dt>电子邮件：</dt>
            <dd><a href="mailto:worldliterature@shisu.edu.cn">worldliterature@shisu.edu.cn</a></dd>
          </div>
          <div>
            <dt>来访地址：</dt>
            <dd>上海外国语大学松江校区文翔路1550号 小别墅21号</dd>
          </div>
          <div>
            <dt>友情链接：</dt>
            <dd>
              <a href="https://www.shisu.edu.cn/" target="_blank" rel="noreferrer">上海外国语大学官网</a>
              <a href="#home">上海全球治理与区域国别研究院官网</a>
            </dd>
          </div>
        </dl>
      </section>
      <p className="footer-copyright">版权所有 © 2026 中国话语与世界文学研究中心</p>
    </footer>
  );
}
