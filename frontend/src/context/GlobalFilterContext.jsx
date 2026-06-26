import { createContext, useContext, useMemo, useReducer } from "react";

function initialSelectionFromHash() {
  if (typeof window === "undefined") return {};
  const [, query = ""] = (window.location.hash || "").split("?");
  const params = new URLSearchParams(query);
  return {
    selectedDomainId: params.get("domain") || undefined,
    selectedSubmoduleId: params.get("submodule") || undefined,
  };
}

const initialSelection = initialSelectionFromHash();

const initialState = {
  selectedDomainId: initialSelection.selectedDomainId || "classics",
  selectedSubmoduleId: initialSelection.selectedSubmoduleId || "",
  filters: [],
  analysisRecordIds: [],
  analysisRecords: [],
  selectionResetToken: 0,
  searchKeyword: "",
  textScale: 1
};

function sameFilter(a, b) {
  return a.field === b.field && a.op === b.op && String(a.value) === String(b.value);
}

function sameStringList(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

function sameRecordList(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((item, index) => String(item?.id || item?.record_id || index) === String(b[index]?.id || b[index]?.record_id || index));
}

function reducer(state, action) {
  switch (action.type) {
    case "selectDomain":
      return { ...state, selectedDomainId: action.domainId, selectedSubmoduleId: "", filters: [], analysisRecordIds: [], analysisRecords: [], selectionResetToken: state.selectionResetToken + 1 };
    case "selectSubmodule":
      return { ...state, selectedSubmoduleId: action.submoduleId, filters: [], analysisRecordIds: [], analysisRecords: [], selectionResetToken: state.selectionResetToken + 1 };
    case "addFilter": {
      const filter = { op: "eq", ...action.filter };
      if (!filter.field || filter.value === undefined || filter.value === "") return state;
      const filters = state.filters.some((item) => sameFilter(item, filter)) ? state.filters : [...state.filters, filter];
      return { ...state, filters };
    }
    case "removeFilter":
      return { ...state, filters: state.filters.filter((_, index) => index !== action.index) };
    case "clearFilters":
      return { ...state, filters: [] };
    case "setAnalysisRecordIds": {
      const ids = [...new Set((action.ids || []).map((id) => String(id)).filter(Boolean))];
      return sameStringList(state.analysisRecordIds, ids) ? state : { ...state, analysisRecordIds: ids };
    }
    case "setAnalysisRecords": {
      const records = Array.isArray(action.records) ? action.records : [];
      return sameRecordList(state.analysisRecords, records) ? state : { ...state, analysisRecords: records };
    }
    case "clearAnalysisSelection":
      return { ...state, analysisRecordIds: [], analysisRecords: [], selectionResetToken: state.selectionResetToken + 1 };
    case "setSearchKeyword":
      return { ...state, searchKeyword: action.keyword || "" };
    case "zoomText":
      return { ...state, textScale: Math.min(2, Math.max(0.5, Number((state.textScale + action.delta).toFixed(2)))) };
    case "resetTextZoom":
      return { ...state, textScale: 1 };
    default:
      return state;
  }
}

const GlobalFilterContext = createContext(null);

export function GlobalFilterProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <GlobalFilterContext.Provider value={value}>{children}</GlobalFilterContext.Provider>;
}

export function useGlobalFilter() {
  const value = useContext(GlobalFilterContext);
  if (!value) throw new Error("useGlobalFilter must be used inside GlobalFilterProvider");
  return value;
}

export function filterParamsFromState(state) {
  const conditions = [...(state.filters || [])];
  return { conditions };
}
