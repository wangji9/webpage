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

const routeAccess = {
  home: "guest",
  about: "guest",
  detail: "guest",
  login: "guest",
  knowledge: "registered",
  graph: "researcher",
  chat: "researcher",
  upload: "researcher",
  admin: "admin",
  wilhelm: "researcher"
};

const roleRank = {
  guest: 0,
  registered: 1,
  researcher: 2,
  admin: 3
};

const roleLabel = {
  guest: "访客",
  registered: "注册用户",
  researcher: "研究者用户",
  admin: "管理员"
};

function accessKey(route) {
  return route.startsWith("about")
    ? "about"
    : route.startsWith("detail/")
    ? "detail"
    : route;
}

function userRole(session) {
  return session.loggedIn ? session.user?.role || "registered" : "guest";
}

function canAccessRoute(route, session) {
  const required = routeAccess[accessKey(route)] || "guest";
  return roleRank[userRole(session)] >= roleRank[required];
}

function currentRoute() {
  return (window.location.hash || "#home").replace("#", "") || "home";
}

export default function App() {
  const [route, setRoute] = useState(currentRoute());
  const [session, setSession] = useState({ loggedIn: false, user: null });
  const [sections, setSections] = useState([]);
  const [results, setResults] = useState([]);
  const [loginNotice, setLoginNotice] = useState("");
  const [bootError, setBootError] = useState("");

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
    Promise.all([api.session(), api.sections(), api.results()])
      .then(([sessionData, sectionData, resultData]) => {
        setSession(sessionData);
        setSections(sectionData.sections);
        setResults(resultData.results);
      })
      .catch((error) => setBootError(error.message));
  }, []);

  useEffect(() => {
    document.body.dataset.route = route;
    if (!canAccessRoute(route, session)) {
      const required = routeAccess[accessKey(route)] || "guest";
      setLoginNotice(`当前身份为${roleLabel[userRole(session)]}，访问该页面需要${roleLabel[required]}及以上权限。`);
      window.location.hash = "login";
    }
  }, [route, session]);

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
    knowledge: <Knowledge {...context} />,
    graph: <Graph {...context} />,
    chat: <SmartChat {...context} />,
    upload: <Upload />,
    about: <About route={route} />,
    login: <Login {...context} />,
    admin: <Admin {...context} />,
    wilhelm: <WilhelmStories />
  };

  const page = route.startsWith("about")
    ? <About route={route} />
    : route.startsWith("detail/")
    ? <Detail route={route} sections={sections} results={results} />
    : pages[route] || pages.home;

  return (
    <>
      <Header route={route} session={session} />
      <main className="app-shell">
        {bootError ? <section className="page-alert">{bootError}</section> : page}
      </main>
      <Footer />
    </>
  );
}
