from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
ANALYSIS_CACHE_ROOT = ROOT / "data" / "analysis_cache"

SENTENCE_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
SPACY_MODEL_NAME = "en_core_web_trf"
INSTALL_COMMAND = "python -m pip install -r requirements.txt"


def ensure_local_ai_environment() -> None:
    """Kept for compatibility; dependency/model caches are not managed here."""
    return None


def _module_status(name: str) -> dict[str, Any]:
    spec = importlib.util.find_spec(name)
    return {
        "name": name,
        "available": bool(spec),
        "origin": spec.origin if spec else "",
    }


def _spacy_model_status() -> dict[str, Any]:
    module = _module_status(SPACY_MODEL_NAME)
    if not module["available"]:
        return module
    try:
        import spacy  # type: ignore

        return {
            **module,
            "loadable": spacy.util.is_package(SPACY_MODEL_NAME),
        }
    except Exception as error:
        return {
            **module,
            "loadable": False,
            "error": f"{type(error).__name__}: {error}",
        }


def _sentence_model_status() -> dict[str, Any]:
    module = _module_status("sentence_transformers")
    model_status: dict[str, Any] = {
        "name": SENTENCE_MODEL_NAME,
        "available": module["available"],
        "moduleOrigin": module["origin"],
    }
    if not module["available"]:
        return model_status
    model_status["loadable"] = None
    model_status["note"] = "Model availability is checked when the analysis first loads it."
    return model_status


def local_ai_status() -> dict[str, Any]:
    required = [
        "spacy",
        "spacy_transformers",
        "transformers",
        "sentence_transformers",
        "bertopic",
        "umap",
        "hdbscan",
        "networkx",
        "pyvis",
        "nltk",
        "gensim",
        "sklearn",
        "torch",
        "chardet",
    ]
    optional = [
        "igraph",
        "graph_tool",
        "matplotlib",
        "seaborn",
        "plotly",
        "holoviews",
        "datashader",
        "graphviz",
        "top2vec",
    ]
    modules = [_module_status(name) for name in required]
    optional_modules = [_module_status(name) for name in optional]
    spacy_model = _spacy_model_status()
    sentence_model = _sentence_model_status()
    missing = [item["name"] for item in modules if not item["available"]]
    if not spacy_model["available"] or spacy_model.get("loadable") is False:
        missing.append(SPACY_MODEL_NAME)
    if not sentence_model["available"]:
        missing.append(SENTENCE_MODEL_NAME)
    return {
        "ready": not missing,
        "missing": missing,
        "modules": modules,
        "optionalModules": optional_modules,
        "models": {
            "spacyTransformer": {
                "name": SPACY_MODEL_NAME,
                "available": spacy_model["available"],
                "loadable": spacy_model.get("loadable"),
                "origin": spacy_model["origin"],
                "error": spacy_model.get("error", ""),
            },
            "sentenceTransformer": sentence_model,
        },
        "paths": {
            "analysisCache": str(ANALYSIS_CACHE_ROOT),
        },
        "installCommand": INSTALL_COMMAND,
        "bootstrapCommand": INSTALL_COMMAND,
        "notes": [
            "Dependencies and model packages are installed from requirements.txt.",
            "This runtime does not create or redirect package/model cache directories inside the project.",
        ],
    }


def assert_local_ai_ready() -> None:
    status = local_ai_status()
    if status["ready"]:
        return
    missing = ", ".join(status["missing"])
    raise RuntimeError(
        "高级文本图谱需要真实 NLP 依赖和模型，当前环境缺少："
        f"{missing}。请先运行 {status['installCommand']}。"
    )
