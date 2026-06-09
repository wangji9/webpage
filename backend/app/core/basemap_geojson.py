from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional

try:
    import shapefile  # pyshp (package name: pyshp)
except ModuleNotFoundError as exc:
    raise ModuleNotFoundError(
        "Missing optional dependency 'pyshp' required to read shapefiles. "
        "Install it with: python -m pip install -r requirements.txt"
    ) from exc


ROOT = Path(__file__).resolve().parents[3]
BASEMAP_DIR = ROOT / "basemap_data"


def _read_shapefile(path: Path) -> shapefile.Reader:
    # Most of our basemap shapefiles are simple WGS84 lon/lat datasets.
    # Try UTF-8 first; fallback to common GBK/CP936 for Chinese attributes.
    cpg = path.with_suffix(".cpg")
    if cpg.exists():
        encoding = cpg.read_text(encoding="ascii", errors="ignore").strip() or "utf-8"
        return shapefile.Reader(str(path), encoding=encoding, encodingErrors="replace")
    try:
        return shapefile.Reader(str(path), encoding="utf-8", encodingErrors="replace")
    except Exception:
        return shapefile.Reader(str(path), encoding="cp936", encodingErrors="replace")


def _round_coordinates(value: Any, precision: int = 5) -> Any:
    if isinstance(value, (float, int)):
        return round(float(value), precision)
    if isinstance(value, tuple):
        return [_round_coordinates(item, precision) for item in value]
    if isinstance(value, list):
        return [_round_coordinates(item, precision) for item in value]
    return value


def _distance_sq(point: list[float], start: list[float], end: list[float]) -> float:
    px, py = point
    sx, sy = start
    ex, ey = end
    dx = ex - sx
    dy = ey - sy
    if dx == 0 and dy == 0:
        return (px - sx) ** 2 + (py - sy) ** 2
    t = max(0.0, min(1.0, ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy)))
    x = sx + t * dx
    y = sy + t * dy
    return (px - x) ** 2 + (py - y) ** 2


def _rdp(points: list[list[float]], tolerance: float) -> list[list[float]]:
    if len(points) <= 2:
        return points
    tolerance_sq = tolerance * tolerance
    max_index = 0
    max_distance = 0.0
    for index in range(1, len(points) - 1):
        distance = _distance_sq(points[index], points[0], points[-1])
        if distance > max_distance:
            max_index = index
            max_distance = distance
    if max_distance <= tolerance_sq:
        return [points[0], points[-1]]
    left = _rdp(points[: max_index + 1], tolerance)
    right = _rdp(points[max_index:], tolerance)
    return left[:-1] + right


def _simplify_ring(ring: list[Any], tolerance: float) -> list[Any]:
    if tolerance <= 0 or len(ring) < 5:
        return ring
    closed = ring[0] == ring[-1]
    line = ring[:-1] if closed else ring
    simplified = _rdp(line, tolerance)
    if closed:
        simplified = simplified + [simplified[0]]
    return simplified if len(simplified) >= 4 else ring


def _simplify_coordinates(geometry_type: str, coordinates: Any, tolerance: float) -> Any:
    if tolerance <= 0 or not coordinates:
        return coordinates
    if geometry_type == "LineString":
        return _simplify_ring(coordinates, tolerance)
    if geometry_type == "MultiLineString":
        return [_simplify_ring(line, tolerance) for line in coordinates]
    if geometry_type == "Polygon":
        return [_simplify_ring(ring, tolerance) for ring in coordinates]
    if geometry_type == "MultiPolygon":
        return [[_simplify_ring(ring, tolerance) for ring in polygon] for polygon in coordinates]
    return coordinates


def _compact_geometry(geometry: Dict[str, Any], simplify_tolerance: float = 0.0) -> Dict[str, Any]:
    geometry_type = str(geometry.get("type") or "")
    coordinates = _round_coordinates(geometry.get("coordinates"))
    coordinates = _simplify_coordinates(geometry_type, coordinates, simplify_tolerance)
    return {
        **geometry,
        "coordinates": coordinates,
    }


def _feature_collection(reader: shapefile.Reader, max_features: Optional[int] = None, simplify_tolerance: float = 0.0) -> Dict[str, Any]:
    fields = [f[0] for f in reader.fields[1:]]  # skip DeletionFlag
    try:
        records = list(reader.iterRecords())
    except Exception:
        records = []
    features: list[dict[str, Any]] = []
    for idx, shape in enumerate(reader.iterShapes()):
        if max_features is not None and idx >= max_features:
            break
        rec = records[idx] if idx < len(records) else []
        geom = _compact_geometry(shape.__geo_interface__, simplify_tolerance=simplify_tolerance)
        props = {fields[i]: rec[i] for i in range(min(len(fields), len(rec)))}
        features.append({"type": "Feature", "geometry": geom, "properties": props})
    return {"type": "FeatureCollection", "features": features}


@lru_cache(maxsize=1)
def province_geojson() -> Dict[str, Any]:
    reader = _read_shapefile(BASEMAP_DIR / "province.shp")
    return _feature_collection(reader, simplify_tolerance=0.03)


@lru_cache(maxsize=1)
def boundary_geojson() -> Dict[str, Any]:
    reader = _read_shapefile(BASEMAP_DIR / "boundary.shp")
    return _feature_collection(reader, simplify_tolerance=0.02)


@lru_cache(maxsize=1)
def world_cities_geojson() -> Dict[str, Any]:
    reader = _read_shapefile(BASEMAP_DIR / "world_cities.shp")
    return _feature_collection(reader)


@lru_cache(maxsize=1)
def land_geojson() -> Dict[str, Any]:
    reader = _read_shapefile(BASEMAP_DIR / "land.shp")
    return _feature_collection(reader, simplify_tolerance=0.03)


@lru_cache(maxsize=1)
def germany_adm02_geojson() -> Dict[str, Any]:
    reader = _read_shapefile(BASEMAP_DIR / "Germany_adm02.shp")
    return _feature_collection(reader, simplify_tolerance=0.01)


@lru_cache(maxsize=1)
def nanhaizhudao_geojson() -> Dict[str, Any]:
    reader = _read_shapefile(BASEMAP_DIR / "nanhaizhudao.shp")
    return _feature_collection(reader, simplify_tolerance=0.01)


@lru_cache(maxsize=1)
def jiuduanxian_geojson() -> Dict[str, Any]:
    reader = _read_shapefile(BASEMAP_DIR / "jiuduanxian.shp")
    return _feature_collection(reader, simplify_tolerance=0.01)
