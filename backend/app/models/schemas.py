from __future__ import annotations

from typing import Any, Optional, Union

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class VerificationCodeRequest(BaseModel):
    email: str = ""
    purpose: str = "register"


class RegisterRequest(BaseModel):
    username: str = ""
    email: str = ""
    password: str = ""
    code: str = ""
    name: str = ""
    accountType: str = "registered"
    institution: str = ""
    researchField: str = ""


class ResetPasswordRequest(BaseModel):
    email: str = ""
    code: str = ""
    password: str = ""


class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    institution: Optional[str] = None
    researchField: Optional[str] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    bio: Optional[str] = None
    topics: Optional[list[str]] = None
    languageFocus: Optional[list[str]] = None
    savedModules: Optional[list[str]] = None
    notificationSettings: Optional[dict[str, Any]] = None
    uiSettings: Optional[dict[str, Any]] = None
    privacySettings: Optional[dict[str, Any]] = None
    featurePreferences: Optional[dict[str, Any]] = None


class PasswordChangeRequest(BaseModel):
    currentPassword: str
    newPassword: str


class ActivityLogRequest(BaseModel):
    route: str = ""
    label: str = ""
    module: str = ""


class AdminUserCreateRequest(BaseModel):
    username: str
    email: str = ""
    password: str = ""
    name: str = ""
    role: str = "registered"
    status: str = "active"
    institution: str = ""
    researchField: str = ""


class AdminUserUpdateRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    institution: Optional[str] = None
    researchField: Optional[str] = None
    password: Optional[str] = None


class DatasetUploadRequest(BaseModel):
    datasetId: str
    filename: str
    contentBase64: str
    rebuild: bool = True
    pages: Union[list[str], str] = []
    requiredColumns: Union[list[str], str] = []


class DatasetCreateRequest(BaseModel):
    moduleId: str = "stories"
    title: str
    filename: str = ""
    content: str = ""
    pages: Union[list[str], str] = []
    requiredColumns: Union[list[str], str] = []
    detectedHeaders: list[str] = []


class ChatRequest(BaseModel):
    question: str
    sectionId: str
    model: str = "general"
    provider: str = "gpt"
    retrievalMode: str = "graph-rag"
    recordId: str = ""
    attachments: list[dict[str, Any]] = []
    localRecords: list[dict[str, Any]] = []
    localStoryDrafts: dict[str, Any] = {}
    localGraphs: dict[str, Any] = {}


class MapRenderRequest(BaseModel):
    flows: list[dict[str, Any]] = []
    sections: list[dict[str, Any]] = []
    mode: str = "flow"
    year: Optional[int] = None
    title: str = "传播地图"


class NlpAnalyzeRequest(BaseModel):
    items: list[dict[str, Any]] = []


class LlmConfigRequest(BaseModel):
    provider: str = "gpt"
    url_base: str = ""
    url_key: str = ""
    default_model: str = "gpt-5.4"


class LlmTestRequest(BaseModel):
    provider: str = "gpt"
    url_base: str = ""
    url_key: str = ""
    model: str = "gpt-5.4"


class RecordQueryRequest(BaseModel):
    page: int = 1
    page_size: int = 20
    sort_by: str = ""
    sort_order: str = "asc"
    filters: Any = None


class WordFrequencyRequest(BaseModel):
    text_fields: list[str] = []
    top_n: int = 20
    filter_params: Any = None


class DocumentTextAnalysisRequest(BaseModel):
    scope: str = "module"
    language_scope: str = "all"
    document_ids: list[str] = []
    top_n: int = 120
    filter_params: Any = None


class AdvancedTextVisualizationRequest(BaseModel):
    scope: str = "single"
    document_id: str = ""
    query: str = ""
    method_id: str = "semantic-manifold"
    topic_count: int = 18
    filter_params: Any = None


class TopicClusteringRequest(BaseModel):
    text_field: str = "content"
    n_topics: int = 5
    filter_params: Any = None


class ComparisonRequest(BaseModel):
    dimensions: list[str] = []
    filter_params: Any = None


class WordDistanceRequest(BaseModel):
    word_a: str
    word_b: str
    max_distance: int = 20
    text_field: str = "content"
    filter_params: Any = None


class WordTrendRequest(BaseModel):
    words: list[str]
    time_field: str = "publish_year"
    filter_params: Any = None


class FullTextSearchRequest(BaseModel):
    keyword: str
    filter_params: Any = None


class AcademicSearchRequest(BaseModel):
    query: str
    mode: str = "hybrid"
    source: str = "all"
    submodule_id: str = ""
    limit: int = 30
    filter_params: Any = None


class SubModuleManageRequest(BaseModel):
    knowledge_domain_id: Optional[Union[int, str]] = None
    domainId: str = ""
    name: str
    description: str = ""
    type: str = "topic"
    language: Optional[str] = None
    enabled_components: list[str] = []
    sort_order: int = 999
    is_active: bool = True


class SystemConfigRequest(BaseModel):
    email: dict[str, Any] = {}
    cache: dict[str, Any] = {}
    backup: dict[str, Any] = {}


class BackupRequest(BaseModel):
    kind: str = "full"


class RestoreRequest(BaseModel):
    path: str


class ExportRequest(BaseModel):
    scope: str = "database"
    scope_id: str = ""
    file_type: str = "csv"
