from __future__ import annotations

import collections
import json
import math
import re
from pathlib import Path

from openpyxl import load_workbook

BASE = Path("C:/Users/Administrator/Desktop")
OUT = Path("C:/Users/Administrator/Desktop/webpage/frontend/src/data/storyCollections.json")
COLLECTION_FILE = BASE / "\u4e2d\u56fd\u6545\u4e8b\u96c6\u603b\u8868_\u77e5\u8bc6\u5e93.xlsx"
CHILD_FILE = BASE / "\u5b50\u6545\u4e8b.xlsx"


def clean(value):
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value).strip()


def year(value):
    match = re.search(r"\d{4}", clean(value))
    return int(match.group()) if match else None


def first_number(value):
    match = re.search(r"\d+", clean(value))
    return int(match.group()) if match else 0


def chinese_title(name):
    match = re.search(r"\u300a([^\u300b]+)\u300b", clean(name))
    return match.group(1).strip() if match else clean(name)


def foreign_title(name):
    text = clean(name)
    match = re.search(r"\uff08([^\uff08\uff09]+)\uff09|\(([^()]+)\)", text)
    return (match.group(1) or match.group(2)).strip() if match else ""


def norm(value):
    value = clean(value).lower()
    value = re.sub(r"\s+", " ", value)
    return value.strip(" \t\r\n\uff1a:;\uff1b,\uff0c.\u3002")


def row_dict(headers, row):
    return {headers[index]: clean(row[index]) if index < len(row) else "" for index in range(len(headers)) if headers[index]}


def read_collections():
    workbook = load_workbook(COLLECTION_FILE, data_only=True, read_only=True)
    sheet = workbook.active
    items = []
    for index, row in enumerate(sheet.iter_rows(values_only=True, min_row=2), start=1):
        if not any(row):
            continue
        title = clean(row[0])
        publisher = clean(row[5])
        city = publisher.split(":", 1)[0].strip() if ":" in publisher else ""
        items.append(
            {
                "id": f"story-collection-{index:03d}",
                "name": title,
                "chineseTitle": chinese_title(title),
                "foreignTitle": foreign_title(title),
                "year": year(row[1]),
                "yearText": clean(row[1]),
                "editor": clean(row[2]),
                "editorRole": clean(row[3]),
                "prefaceAuthor": clean(row[4]),
                "publisher": publisher,
                "city": city,
                "declaredChildCount": first_number(row[6]),
                "prefaceText": "",
                "matchedChildIds": [],
            }
        )
    return items


def read_children():
    workbook = load_workbook(CHILD_FILE, data_only=True, read_only=True)
    children = []
    for sheet_name in workbook.sheetnames:
        sheet = workbook[sheet_name]
        headers = [clean(item) for item in next(sheet.iter_rows(values_only=True))]
        for row in sheet.iter_rows(values_only=True, min_row=2):
            if not any(value is not None for value in row):
                continue
            data = row_dict(headers, row)
            if not any(data.values()):
                continue
            child = {
                "id": f"child-{len(children) + 1:04d}",
                "sheet": sheet_name,
                "ethnicity": data.get("\u6c11\u65cf", ""),
                "storyType": data.get("\u6545\u4e8b\u7c7b\u578b", ""),
                "creator": data.get("\u521b\u5efa\u8005", ""),
                "canonicalName": data.get("\u89c4\u8303\u6545\u4e8b\u540d", ""),
                "variantName": data.get("\u53d8\u5f02\u6545\u4e8b\u540d", ""),
                "year": year(data.get("\u51fa\u7248\u65f6\u95f4", "")),
                "yearText": data.get("\u51fa\u7248\u65f6\u95f4", ""),
                "translator": data.get("\u8bd1\u8005", ""),
                "reference": data.get("\u6709\u65e0\u53c2\u7167\u672c", ""),
                "nationality": data.get("\u56fd\u7c4d", ""),
                "language": data.get("\u8bed\u79cd", ""),
                "translationMode": data.get("\u7ffb\u8bd1\u65b9\u5f0f", ""),
                "carrier": data.get("\u6587\u732e\u8f7d\u4f53", ""),
                "bookName": data.get("\u56fe\u4e66/\u671f\u520a\u540d", ""),
                "subtitle": data.get("\u56fe\u4e66/\u671f\u520a\u526f\u9898\u540d", ""),
                "journalIssue": data.get("\u671f\u520a\u5377\u671f", ""),
                "editor": data.get("\u56fe\u4e66/\u671f\u520a\u4e3b\u7f16", ""),
                "country": data.get("\u56fd\u5bb6", ""),
                "place": data.get("\u51fa\u7248\u5730", ""),
                "publisher": data.get("\u51fa\u7248\u793e", ""),
                "version": data.get("\u7248\u672c", ""),
                "versionNote": data.get("\u7248\u672c\u8bf4\u660e", ""),
                "notes": data.get("\u5176\u4ed6", ""),
                "url": data.get("\u7535\u5b50\u7248\u5730\u5740", ""),
            }
            if child["canonicalName"] or child["variantName"] or child["bookName"]:
                children.append(child)
    return children


def match_children(collection_items, children):
    for item in collection_items:
        foreign = norm(item["foreignTitle"])
        chinese = norm(item["chineseTitle"])
        matches = []
        for child in children:
            book = norm(child["bookName"])
            subtitle = norm(child["subtitle"])
            if not book:
                continue
            ok = False
            if foreign:
                ok = book.startswith(foreign) or foreign.startswith(book) or foreign in book
            if not ok and chinese:
                ok = chinese in book
            if not ok and foreign and subtitle:
                ok = foreign in subtitle or subtitle in foreign
            if ok:
                matches.append(child["id"])
        item["matchedChildIds"] = matches


COUNTRY_COORDS = {
    "\u5fb7\u56fd": [10.45, 51.16],
    "\u6cd5\u56fd": [2.35, 48.86],
    "\u82f1\u56fd": [-0.13, 51.51],
    "\u7f8e\u56fd": [-74.01, 40.71],
    "\u6377\u514b": [14.43, 50.08],
    "\u745e\u58eb": [8.54, 47.37],
    "\u5965\u5730\u5229": [16.37, 48.2],
    "\u610f\u5927\u5229": [12.5, 41.9],
    "\u65e5\u672c": [139.76, 35.68],
    "\u897f\u73ed\u7259": [-3.7, 40.42],
    "\u4e2d\u56fd": [116.4, 39.9],
}

PROVINCE_COORDS = {
    "\u5317\u4eac": [116.4, 39.9],
    "\u4e0a\u6d77": [121.47, 31.23],
    "\u6d59\u6c5f": [120.15, 30.28],
    "\u6c5f\u82cf": [118.78, 32.04],
    "\u5c71\u4e1c": [117.0, 36.65],
    "\u56db\u5ddd": [104.06, 30.67],
    "\u5e7f\u4e1c": [113.27, 23.13],
    "\u798f\u5efa": [119.3, 26.08],
    "\u6e56\u5317": [114.3, 30.6],
    "\u6e56\u5357": [112.98, 28.2],
    "\u6cb3\u5357": [113.62, 34.75],
    "\u9655\u897f": [108.94, 34.34],
    "\u4e91\u5357": [102.71, 25.04],
    "\u897f\u85cf": [91.13, 29.65],
    "\u65b0\u7586": [87.62, 43.82],
    "\u5185\u8499\u53e4": [111.65, 40.82],
    "\u8fbd\u5b81": [123.43, 41.8],
    "\u53f0\u6e7e": [121.56, 25.04],
}


def country_for(publisher):
    text = publisher.lower()
    if any(name in text for name in ["berlin", "jena", "m\u00fcnchen", "leipzig", "d\u00fcsseldorf", "frankfurt", "hamburg", "stuttgart", "k\u00f6ln", "freiburg"]):
        return "\u5fb7\u56fd"
    if "paris" in text:
        return "\u6cd5\u56fd"
    if "london" in text:
        return "\u82f1\u56fd"
    if "new york" in text:
        return "\u7f8e\u56fd"
    if "prag" in text:
        return "\u6377\u514b"
    if "z\u00fcrich" in text or "basel" in text:
        return "\u745e\u58eb"
    if "peking" in text or "beijing" in text:
        return "\u4e2d\u56fd"
    return "\u5fb7\u56fd"


def build_flows(collection_items):
    provinces = list(PROVINCE_COORDS)
    flows = []
    for index, item in enumerate(collection_items):
        province = provinces[index % len(provinces)]
        country = country_for(item["publisher"])
        flows.append(
            {
                "id": item["id"],
                "title": item["name"],
                "sectionId": "stories",
                "resourceType": "\u6545\u4e8b\u96c6",
                "language": "\u5fb7\u8bed",
                "year": item["year"] or 0,
                "from": PROVINCE_COORDS[province],
                "to": COUNTRY_COORDS.get(country, COUNTRY_COORDS["\u5fb7\u56fd"]),
                "fromLabel": province,
                "toLabel": f"{item['city'] or country} \u00b7 {country}",
                "province": province,
                "country": country,
                "weight": max(0.65, min(3.2, (len(item["matchedChildIds"]) or item["declaredChildCount"] or 1) / 24)),
            }
        )
    return flows


def build_stats(collection_items, children, flows):
    return {
        "collectionCount": len(collection_items),
        "childCount": len(children),
        "matchedChildCount": len({child_id for item in collection_items for child_id in item["matchedChildIds"]}),
        "languages": collections.Counter(child["language"] for child in children if child["language"]).most_common(16),
        "countries": collections.Counter(child["country"] for child in children if child["country"]).most_common(16),
        "translators": collections.Counter(child["translator"] for child in children if child["translator"]).most_common(16),
        "storyNames": collections.Counter(child["canonicalName"] for child in children if child["canonicalName"]).most_common(24),
        "carriers": collections.Counter(child["carrier"] for child in children if child["carrier"]).most_common(10),
        "translationModes": collections.Counter(child["translationMode"] for child in children if child["translationMode"]).most_common(10),
        "editorRoles": collections.Counter(item["editorRole"] for item in collection_items if item["editorRole"]).most_common(12),
        "publishers": collections.Counter(item["publisher"] for item in collection_items if item["publisher"]).most_common(12),
        "provinceCounts": collections.Counter(flow["province"] for flow in flows).most_common(),
        "yearSeries": sorted(collections.Counter(f"{item['year'] // 10 * 10}s" for item in collection_items if item["year"]).items()),
    }


def main():
    collection_items = read_collections()
    children = read_children()
    match_children(collection_items, children)
    flows = build_flows(collection_items)
    payload = {
        "collections": collection_items,
        "childStories": children,
        "flows": flows,
        "stats": build_stats(collection_items, children, flows),
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT} collections={len(collection_items)} children={len(children)}")


if __name__ == "__main__":
    main()
