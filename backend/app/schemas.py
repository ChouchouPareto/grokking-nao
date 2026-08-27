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
