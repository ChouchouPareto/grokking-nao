const { chromium } = require("playwright-core");

const BASE = process.env.BASE_URL || "http://localhost:3010";
const INVITE_CODE = process.env.INVITE_CODE || "";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function report(name, passed, detail = "") {
  console.log(`${passed ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!passed) process.exitCode = 1;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text());
  });

  await page.goto(BASE, { waitUntil: "networkidle" });
  if (page.url().includes("/login")) {
    await page.getByLabel("邀请码").fill(INVITE_CODE);
    await page.getByRole("button", { name: "进入思考空间" }).click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });
  }
  await page.getByLabel("思考主题").fill("四川菜，甜品，咖啡，物流，选种子，供应链");
  await page.getByRole("button", { name: "进入思维空间" }).click();
  await page.waitForURL(/\/idea\//, { timeout: 10000 });
  await page.waitForSelector('[data-testid="formal-node"]', { timeout: 15000 });

  const initialCount = await page.getByTestId("formal-node").count();
  report("多关键词已拆分为节点", initialCount === 6, `实际 ${initialCount}`);
  report("3D 默认激活", await page.getByRole("button", { name: "3D 空间" }).getAttribute("aria-pressed") === "true");

  const dock = page.locator(".workspace-dock");
  await dock.hover();
  await page.waitForTimeout(280);
  report("统一面板入口可展开", await page.getByRole("button", { name: "工具", exact: true }).isVisible()
    && await page.getByRole("button", { name: "何", exact: true }).isVisible()
    && await page.getByRole("button", { name: "论", exact: true }).isVisible());

  await page.waitForTimeout(1800);
  const firstNode = page.getByTestId("formal-node").first();
  await firstNode.hover({ force: true });
  await page.waitForTimeout(320);
  const existingGuide = page.getByRole("button", { name: /^连到 / }).first();
  report("悬停节点显示就地连线", await existingGuide.isVisible()
    && await page.getByRole("button", { name: "创建并连接新节点" }).isVisible());
  const firstGuideLabel = await existingGuide.textContent();
  await existingGuide.click({ force: true });
  await page.waitForTimeout(350);
  const nextGuideLabel = await page.getByRole("button", { name: /^连到 / }).first().textContent().catch(() => null);
  report("点击预览线直接连接", Boolean(firstGuideLabel && nextGuideLabel && firstGuideLabel !== nextGuideLabel));

  await firstNode.hover({ force: true });
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "创建并连接新节点" }).click({ force: true });
  await page.getByPlaceholder("输入一个关键词").fill("新商业分支");
  await page.getByRole("button", { name: "添加节点" }).click();
  await page.waitForTimeout(450);
  report("空白方向可创建并自动连接", await page.getByTestId("formal-node").count() === initialCount + 1);

  await page.getByRole("button", { name: "2D 平面" }).click();
  await page.waitForTimeout(1100);
  report("2D 视图可切换", await page.getByRole("button", { name: "2D 平面" }).getAttribute("aria-pressed") === "true");
  report("2D 保持同一批节点", await page.getByTestId("formal-node").count() === initialCount + 1);

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.move(box.x + 80, box.y + box.height - 100);
    for (let index = 0; index < 24; index += 1) await page.mouse.wheel(0, 240);
    await page.waitForTimeout(500);
  }
  const lods = await page.getByTestId("formal-node").evaluateAll((nodes) => nodes.map((node) => node.dataset.lod));
  report("缩远后启用标签 LOD", lods.some((lod) => lod === "compact" || lod === "point"), lods.join(","));

  await page.getByRole("button", { name: "3D 空间" }).click();
  await page.waitForTimeout(900);
  report("3D 可恢复且数据不丢失", await page.getByTestId("formal-node").count() === initialCount + 1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="formal-node"]', { timeout: 15000 });
  const mobile2D = page.getByRole("button", { name: "2D 平面" });
  const mobileBox = await mobile2D.boundingBox();
  report("WAP 端保留视图切换", Boolean(mobileBox && mobileBox.height >= 42));
  await page.getByRole("button", { name: "展开面板选择" }).evaluate((button) => button.click());
  await page.waitForTimeout(260);
  const mobileOptions = page.locator(".workspace-dock-options button");
  const mobileToolBox = await mobileOptions.first().boundingBox();
  report("WAP 端面板模块可点击展开", await mobileOptions.count() === 3 && Boolean(mobileToolBox && mobileToolBox.height >= 48), `选项 ${await mobileOptions.count()} · 高度 ${Math.round(mobileToolBox?.height ?? 0)}px`);
  await mobile2D.click();
  await page.waitForTimeout(600);
  report("WAP 端 2D 画布可用", await mobile2D.getAttribute("aria-pressed") === "true" && await canvas.isVisible());
  report("无运行时错误", errors.length === 0, errors.slice(0, 2).join(" | "));

  await browser.close();
  if (process.exitCode) process.exit(process.exitCode);
})().catch((error) => {
  console.error("脚本异常：", error.message);
  process.exit(1);
});
