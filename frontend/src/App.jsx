import { useEffect, useMemo, useState } from "react";
import { api } from "./services/api.js";
import Header from "./components/Header.jsx";
import Footer from "./components/Footer.jsx";
import Home from "./pages/Home.jsx";
import Knowledge from "./pages/Knowledge.jsx";
import Graph from "./pages/Graph.jsx";
import SmartChat from "./pages/SmartChat.jsx";
import Upload from "./pages/Upload.jsx";
import About from "./pages/About.jsx";
import Login from "./pages/Login.jsx";
import Admin from "./pages/Admin.jsx";
import Detail from "./pages/Detail.jsx";
import WilhelmStories from "./pages/WilhelmStories.jsx";
import Profile from "./pages/Profile.jsx";
import PermissionGate from "./components/PermissionGate.jsx";
import { accessKey, canAccessRoute, loginHash, permissionNotice, routeAccess, userRole } from "./utils/permissions.js";

const routeLabels = {
  home: "平台首页",
    about: "关于我们",
  detail: "知识详情",
  login: "用户登录",
  profile: "个人中心",
  knowledge: "知识库",
  graph: "知识图谱",
  chat: "智能问答",
  upload: "数据上传",
  admin: "管理控制台",
  wilhelm: "卫礼贤中国民间故事"
};

function currentRoute() {
  return ((window.location.hash || "#home").replace("#", "") || "home").split("?")[0] || "home";
}

export default function App() {
  const [route, setRoute] = useState(currentRoute());
  const [session, setSession] = useState({ loggedIn: false, user: null });
  const [sections, setSections] = useState([]);
  const [results, setResults] = useState([]);
  const [loginNotice, setLoginNotice] = useState("");
  const [bootError, setBootError] = useState("");
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    const onScroll = () => document.body.classList.toggle("scrolled", window.scrollY > 16);
    window.addEventListener("hashchange", onHash);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    api.session()
      .then((sessionData) => {
        setSession(sessionData);
        if (!sessionData.loggedIn) return null;
        return Promise.all([api.sections(), api.results()]).then(([sectionData, resultData]) => {
          setSections(sectionData.sections);
          setResults(resultData.results);
        });
      })
      .catch((error) => setBootError(error.message))
      .finally(() => setSessionReady(true));
  }, []);

  useEffect(() => {
    if (!sessionReady || !session.loggedIn) {
      setSections([]);
      setResults([]);
      return;
    }
    Promise.all([api.sections(), api.results()])
      .then(([sectionData, resultData]) => {
        setSections(sectionData.sections);
        setResults(resultData.results);
      })
      .catch((error) => setBootError(error.message));
  }, [sessionReady, session.loggedIn, session.user?.id]);

  useEffect(() => {
    document.body.dataset.route = route;
    if (!sessionReady) return;
    if (!canAccessRoute(route, session)) {
      const required = routeAccess[accessKey(route)] || "guest";
      const notice = permissionNotice(required, userRole(session), routeLabels[accessKey(route)] || route);
      setLoginNotice(notice);
      window.location.hash = loginHash(required, notice);
    }
  }, [route, session, sessionReady]);

  useEffect(() => {
    if (!sessionReady || !session.loggedIn || accessKey(route) === "login" || !canAccessRoute(route, session)) return;
    const module = accessKey(route);
    api.recordActivity({
      route,
      label: routeLabels[module] || route,
      module
    });
  }, [route, session.loggedIn, session.user?.id, session.user?.role, sessionReady]);

  const context = useMemo(() => ({
    session,
    setSession,
    sections,
    results,
    loginNotice,
    setLoginNotice
  }), [session, sections, results, loginNotice]);

  const pages = {
    home: <Home {...context} />,
    knowledge: <PermissionGate session={session} requiredRole="registered" moduleName="知识库"><Knowledge {...context} /></PermissionGate>,
    graph: <PermissionGate session={session} requiredRole="registered" moduleName="知识图谱"><Graph {...context} /></PermissionGate>,
    chat: <PermissionGate session={session} requiredRole="researcher" moduleName="智能问答"><SmartChat {...context} /></PermissionGate>,
    upload: <PermissionGate session={session} requiredRole="researcher" moduleName="数据上传"><Upload /></PermissionGate>,
    about: <PermissionGate session={session} requiredRole="registered" moduleName="关于我们"><About route={route} /></PermissionGate>,
    login: <Login {...context} />,
    profile: <PermissionGate session={session} requiredRole="registered" moduleName="个人中心"><Profile {...context} route={route} /></PermissionGate>,
    admin: <Admin {...context} />,
    wilhelm: <PermissionGate session={session} requiredRole="registered" moduleName="卫礼贤中国民间故事"><WilhelmStories /></PermissionGate>
  };

  const page = route.startsWith("about")
    ? <PermissionGate session={session} requiredRole="registered" moduleName="关于我们"><About route={route} /></PermissionGate>
    : route.startsWith("detail/")
    ? <PermissionGate session={session} requiredRole="registered" moduleName="知识详情"><Detail route={route} sections={sections} results={results} /></PermissionGate>
    : route.startsWith("profile")
    ? <PermissionGate session={session} requiredRole="registered" moduleName="个人中心"><Profile {...context} route={route} /></PermissionGate>
    : pages[route] || pages.home;

  return (
    <>
      <Header route={route} session={session} setSession={setSession} />
      <main className="app-shell">
        {bootError ? <section className="page-alert">{bootError}</section> : page}
      </main>
      <Footer />
    </>
  );
}
