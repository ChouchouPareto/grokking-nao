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


class Suggestion(BaseModel):
    id: str
    type: Literal["node", "edge", "question"]
    content: str
    reason: str
    related_node_ids: list[str] = Field(default_factory=list)
    source_node_id: Optional[str] = None
    target_node_id: Optional[str] = None
    edge_note: Optional[str] = None


class SuggestResponse(BaseModel):
    request_id: str
    suggestions: list[Suggestion]
