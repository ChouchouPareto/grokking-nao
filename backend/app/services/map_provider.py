from dataclasses import dataclass

import httpx

from ..config import AMAP_WEB_SERVICE_KEY, LOCATION_MAX_RADIUS_METERS, MAP_PROVIDER


@dataclass(frozen=True)
class PlaceCandidate:
    name: str
    category: str
    distance_meters: int | None = None


class FallbackMapProvider:
    async def nearby(self, latitude: float, longitude: float) -> list[PlaceCandidate]:
        return []


class AmapProvider:
    endpoint = "https://restapi.amap.com/v5/place/around"

    async def nearby(self, latitude: float, longitude: float) -> list[PlaceCandidate]:
        params = {
            "key": AMAP_WEB_SERVICE_KEY,
            "location": f"{longitude:.6f},{latitude:.6f}",
            # 高德地点搜索 2.0 的 keywords 当前只支持一个关键字。
            "keywords": "公园",
            "radius": min(LOCATION_MAX_RADIUS_METERS, 50000),
            "page_size": 10,
        }
        try:
            async with httpx.AsyncClient(timeout=6) as client:
                response = await client.get(self.endpoint, params=params)
            response.raise_for_status()
            data = response.json()
        except (httpx.HTTPError, ValueError):
            return []
        places: list[PlaceCandidate] = []
        for item in data.get("pois", [])[:10]:
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            try:
                distance = int(float(item.get("distance"))) if item.get("distance") else None
            except (TypeError, ValueError):
                distance = None
            places.append(PlaceCandidate(name=name[:80], category=str(item.get("type") or "现实环境")[:50], distance_meters=distance))
        return places


def get_map_provider():
    if MAP_PROVIDER == "amap" and AMAP_WEB_SERVICE_KEY:
        return AmapProvider()
    return FallbackMapProvider()


async def build_environment_suggestions(req) -> tuple[list, str]:
    from .. import schemas

    places: list[PlaceCandidate] = []
    if req.latitude is not None and req.longitude is not None:
        places = await get_map_provider().nearby(req.latitude, req.longitude)

    result: list[schemas.EnvironmentSuggestion] = []
    if places:
        for index, place in enumerate(places[:2]):
            distance = f"，约 {place.distance_meters} 米" if place.distance_meters is not None else ""
            result.append(schemas.EnvironmentSuggestion(
                id=f"nearby-{index}",
                kind="walk" if index == 0 else "observe",
                title=f"去 {place.name} 换一个思考视角",
                instruction=f"先不找答案，步行或停留 15 分钟{distance}。观察这里的人如何选择、等待和离开，再回来补一条与‘{req.seed_text[:24]}’有关的记录。",
                duration_minutes=15,
                place_label=place.name,
                is_generic=False,
            ))
        return result, "nearby"

    result.extend([
        schemas.EnvironmentSuggestion(
            id="generic-walk",
            kind="walk",
            title="离开屏幕，做一次无目的短走",
            instruction=f"在当前位置附近走 12 分钟，只观察三种真实选择行为。回来后，把其中一种连接到‘{req.seed_text[:24]}’。",
            duration_minutes=12,
            place_label=req.location_label or None,
            is_generic=True,
        ),
        schemas.EnvironmentSuggestion(
            id="generic-listen",
            kind="listen",
            title="用声音打断当前思路",
            instruction="播放一首与当前情绪反差较大的纯音乐，结束前不继续搜索资料，只写下第一个反常识联想。",
            duration_minutes=8,
            is_generic=True,
        ),
    ])
    return result, "generic"
