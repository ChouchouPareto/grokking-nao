// 切片 2 端到端测试：AI 建议引擎（后端 mock 模式）。
const { chromium } = require("playwright-core");

const BASE = "http://localhost:3010";
const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

  // 1. 创建 Idea 并添加 3 个节点
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByPlaceholder("写下一点正在想的东西…").fill("生鲜订阅");
  await page.getByRole("button", { name: "进入空间" }).click();
  await page.waitForURL(/\/idea\//);
  await page.waitForSelector("canvas");
  await page.getByRole("button", { name: /添加关键词/ }).click();
  await page.locator("textarea").last().fill("生鲜\n配送时效\n价格敏感");
  await page.getByRole("button", { name: /添加.*个节点/ }).click();
  await page.waitForTimeout(2000);

  const beforeLabels = await page.locator(".node-label").count();
  check("初始 3 个节点", beforeLabels === 3, `实际 ${beforeLabels}`);

  // 2. 点击"帮我展开"
  await page.getByRole("button", { name: "帮我展开" }).click();
  await page.getByText("AI 建议").waitFor({ timeout: 10000 });
  check("AI 建议面板出现", true);

  // 等待建议渲染完成
  await page.waitForFunction(
    () => document.querySelectorAll('button:not([disabled])').length > 0,
    { timeout: 10000 },
  ).catch(() => {});
  await page.waitForTimeout(1200);

  const acceptCount = await page.getByRole("button", { name: "接受" }).count();
  check("出现 2 条可接受建议（节点+连接）", acceptCount === 2, `接受按钮 ${acceptCount}`);
  check("出现追问卡片", await page.getByRole("button", { name: "忽略" }).isVisible());
  check("出现候选节点（半透明）", (await page.locator(".node-label").count()) === 4);

  // 3. 接受节点建议
  await page.getByRole("button", { name: "接受" }).first().click();
  await page.waitForTimeout(800);
  const acceptAfter = await page.getByRole("button", { name: "接受" }).count();
  check("接受后剩余 1 条建议", acceptAfter === 1, `接受按钮 ${acceptAfter}`);
  check("接受后已保存", await page.getByText("已保存").isVisible());

  // 4. 拒绝连接建议
  await page.getByRole("button", { name: "拒绝" }).first().click();
  await page.waitForTimeout(400);
  check("拒绝后建议清空", (await page.getByRole("button", { name: "接受" }).count()) === 0);

  // 5. 忽略追问
  await page.getByRole("button", { name: "忽略" }).click();
  await page.waitForTimeout(400);
  check("追问忽略后面板隐藏", !(await page.getByText("AI 建议").isVisible().catch(() => false)));

  // 6. 无控制台错误
  check("无控制台错误", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== 结果：${results.length - failed.length}/${results.length} 通过 =====`);
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((e) => {
  console.error("脚本异常：", e.message);
  process.exit(1);
});
