from typing import Literal, Optional

from pydantic import BaseModel, Field


class NodeIn(BaseModel):
    id: str
    text: str


class EdgeIn(BaseModel):
    source_node_id: str
    target_node_id: str
    note: Optional[str] = None


class SuggestRequest(BaseModel):
    idea_id: str
    seed_text: str = ""
    title: str = ""
    nodes: list[NodeIn] = Field(default_factory=list)
    edges: list[EdgeIn] = Field(default_factory=list)
    rejected_summary: list[str] = Field(default_factory=list)
    focused_node_id: Optional[str] = None
    mode: Literal["intent_profile", "relation_probe", "node_brainstorm", "deep_expand"] = "deep_expand"
    trigger_node_ids: list[str] = Field(default_factory=list)


class IntentProfile(BaseModel):
    primary_intent: str
    thinking_stage: str
    dimensions_present: list[str] = Field(default_factory=list)
    dimensions_missing: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0, le=1)


class Suggestion(BaseModel):
    id: str
    type: Literal["node", "edge", "question"]
    content: str
    reason: str
    dimension: str = "跨维联系"
    related_node_ids: list[str] = Field(default_factory=list)
    source_node_id: Optional[str] = None
    target_node_id: Optional[str] = None
    edge_note: Optional[str] = None
    relation: Optional[str] = None
    strength: Optional[float] = Field(default=None, ge=0, le=1)


class SuggestResponse(BaseModel):
    request_id: str
    suggestions: list[Suggestion]
    intent_profile: Optional[IntentProfile] = None


class SummaryRequest(BaseModel):
    idea_id: str
    seed_text: str = ""
    title: str = ""
    nodes: list[NodeIn] = Field(default_factory=list)
    edges: list[EdgeIn] = Field(default_factory=list)
    scope: Literal["all", "focused"] = "all"
    focused_node_id: Optional[str] = None


class SummaryContent(BaseModel):
    title: str
    overview: str
    themes: list[str] = Field(default_factory=list)
    key_connections: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    next_directions: list[str] = Field(default_factory=list)


class SummaryResponse(BaseModel):
    request_id: str
    summary: SummaryContent


class DirectionRequest(BaseModel):
    seed_text: str = Field(min_length=1, max_length=500)
    thinking_mode: Literal["business", "daily"] = "business"
    location_label: Optional[str] = Field(default=None, max_length=120)


class DirectionCandidate(BaseModel):
    id: str
    text: str
    reason: str


class DirectionResponse(BaseModel):
    request_id: str
    candidates: list[DirectionCandidate]


class BusinessLensRequest(BaseModel):
    idea_id: str
    seed_text: str = Field(min_length=1, max_length=500)
    direction: str = Field(default="", max_length=300)
    location_label: Optional[str] = Field(default=None, max_length=120)
    rejected_summary: list[str] = Field(default_factory=list)


class HorizontalOpportunity(BaseModel):
    id: str
    label: str
    relation: str
    reason: str


class VerticalChainNode(BaseModel):
    id: str
    label: str
    stage: Literal["upstream", "core", "downstream", "support"]
    reason: str


class BusinessLensContent(BaseModel):
    horizontal: list[HorizontalOpportunity]
    vertical: list[VerticalChainNode]
    insights: list[str]


class BusinessLensResponse(BaseModel):
    request_id: str
    lens: BusinessLensContent


class EnvironmentRequest(BaseModel):
    idea_id: str
    seed_text: str = Field(min_length=1, max_length=500)
    direction: str = Field(default="", max_length=300)
    thinking_stage: str = Field(default="发散", max_length=50)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    location_label: Optional[str] = Field(default=None, max_length=120)


class EnvironmentSuggestion(BaseModel):
    id: str
    kind: Literal["walk", "observe", "listen", "pause"]
    title: str
    instruction: str
    duration_minutes: int = Field(ge=3, le=90)
    place_label: Optional[str] = None
    is_generic: bool = True


class EnvironmentResponse(BaseModel):
    request_id: str
    suggestions: list[EnvironmentSuggestion]
    location_mode: Literal["nearby", "generic"]
