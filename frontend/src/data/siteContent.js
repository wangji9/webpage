import { api } from "../services/api.js";
import { dynamicItems as fallbackDynamicItems, detailHref, imageUrl } from "./dynamicContent.js";

const EMPTY_CONTENT = {
  team: [],
  committee: [],
  publications: [],
  activities: [],
  dynamics: []
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeImage(item) {
  const image = item.image || item.image_url || item.imageUrl || "";
  if (!image) return "";
  if (/^(https?:|data:|\/)/.test(image)) return image;
  return imageUrl(image);
}

function normalizeDynamic(item) {
  const filename = item.filename || item.image || "";
  const id = item.id || encodeURIComponent(filename || item.title || "");
  return {
    ...item,
    id,
    filename,
    image: normalizeImage(item),
    title: item.title || "平台动态",
    type: item.type || "平台动态",
    topic: item.topic || "focus",
    date: item.date || "2024",
    summary: item.summary || item.content || item.title || "",
    content: item.content || item.summary || item.title || "",
    href: detailHref("dynamic", encodeURIComponent(id))
  };
}

export function normalizeSiteContent(payload = {}) {
  const content = payload.content || payload || {};
  return {
    team: asArray(content.team).map((item) => ({
      ...item,
      focus: Array.isArray(item.focus) ? item.focus : String(item.focus || "").split(/[、,，/|；;]+/).map((value) => value.trim()).filter(Boolean),
      image_url: normalizeImage(item)
    })),
    committee: asArray(content.committee),
    publications: asArray(content.publications).map((item) => ({ ...item, image_url: normalizeImage(item) })),
    activities: asArray(content.activities).map((item) => ({ ...item, image_url: normalizeImage(item) })),
    dynamics: asArray(content.dynamics).map(normalizeDynamic)
  };
}

export async function loadSiteContent() {
  const payload = await api.siteContent();
  return normalizeSiteContent(payload);
}

export function fallbackSiteContent() {
  return {
    ...EMPTY_CONTENT,
    dynamics: fallbackDynamicItems.map(normalizeDynamic)
  };
}
