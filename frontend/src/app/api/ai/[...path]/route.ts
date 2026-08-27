import { NextRequest, NextResponse } from "next/server";

const ALLOWED_PATHS = new Set(["suggestions", "summary"]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const endpoint = path.join("/");
  if (!ALLOWED_PATHS.has(endpoint)) {
    return NextResponse.json({ error: { code: "not_found", message: "接口不存在" } }, { status: 404 });
  }

  const baseUrl = process.env.INTERNAL_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.INTERNAL_API_TOKEN;
  if (!baseUrl || !token) {
    return NextResponse.json(
      { error: { code: "service_unavailable", message: "AI 服务尚未配置" } },
      { status: 503 },
    );
  }

  try {
    const upstream = await fetch(`${baseUrl}/api/v1/ai/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Api-Token": token,
      },
      body: await request.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(35_000),
    });
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: { code: "upstream_unavailable", message: "AI 服务暂时不可用" } },
      { status: 502 },
    );
  }
}

