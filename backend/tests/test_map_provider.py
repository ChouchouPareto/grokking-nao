import asyncio

from app import schemas
from app.services import map_provider


def test_fallback_provider_never_fabricates_places():
    places = asyncio.run(map_provider.FallbackMapProvider().nearby(30.5, 104.0))
    assert places == []


def test_environment_fallback_is_labeled_generic():
    req = schemas.EnvironmentRequest(
        idea_id="idea-1",
        seed_text="四川菜商业机会",
        latitude=30.5,
        longitude=104.0,
        location_label="当前位置附近",
    )
    items, mode = asyncio.run(map_provider.build_environment_suggestions(req))
    assert mode == "generic"
    assert len(items) == 2
    assert all(item.is_generic for item in items)
