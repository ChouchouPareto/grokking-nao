// AI 建议引擎端到端测试（mock 或真实模型均可）。
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
  await page.getByLabel("新建项目").fill("生鲜订阅");
  await page.getByRole("button", { name: "创建并进入 3D" }).click();
  await page.waitForURL(/\/idea\//);
  await page.waitForSelector("canvas");
  await page.getByRole("button", { name: "显示左侧工具栏" }).click();
  await page.getByRole("button", { name: "显示右侧工具栏" }).click();
  await page.getByRole("button", { name: "添加节点" }).click();
  await page.locator("textarea").last().fill("生鲜\n配送时效\n价格敏感");
  await page.getByRole("button", { name: /添加.*个节点/ }).click();
  await page.waitForTimeout(2000);

  const beforeLabels = await page.locator(".node-label").count();
  check("初始 3 个节点", beforeLabels === 3, `实际 ${beforeLabels}`);

  // 2. 选择正式节点，从节点发起头脑风暴
  await page.getByTestId("formal-node").first().focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "围绕它联想" }).click();
  await page.locator('[data-testid="candidate-node"]').first().waitFor({ timeout: 45000 });
  const candidateCount = await page.locator('[data-testid="candidate-node"]').count();
  check("节点周围出现虚化联想", candidateCount >= 1, `候选 ${candidateCount}`);

  // 3. 点击空间中的候选节点，再由用户采用
  await page.locator('[data-testid="candidate-node"]').first().click({ force: true });
  await page.getByRole("button", { name: "接受" }).waitFor({ timeout: 5000 });
  check("点击候选后出现选择操作", true);
  await page.getByRole("button", { name: "接受" }).click();
  await page.waitForTimeout(600);
  check("采用后写入正式网络", (await page.locator(".node-label").count()) >= 4);
  check("采用后已保存", await page.getByText("已保存").isVisible());

  // 4. 在右侧生成并保存阶段总结
  await page.getByRole("button", { name: /^论/ }).click();
  await page.getByRole("button", { name: "总结全部" }).click();
  await page.getByTestId("summary-draft").waitFor({ timeout: 45000 });
  check("阶段总结生成", await page.getByTestId("summary-draft").isVisible());
  await page.getByRole("button", { name: "保存阶段总结" }).click();
  check("阶段总结保存", await page.getByText("阶段总结已保存").isVisible());

  // 5. 敏感内容必须被后端拒绝，并在前端主动显示提醒
  const unsafePage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await unsafePage.goto(BASE, { waitUntil: "networkidle" });
  await unsafePage.getByLabel("新建项目").fill("国民党打败共产党");
  await unsafePage.getByRole("button", { name: "创建并进入 3D" }).click();
  await unsafePage.waitForURL(/\/idea\//);
  await unsafePage.waitForSelector("canvas");
  await unsafePage.getByRole("button", { name: "显示左侧工具栏" }).click();
  await unsafePage.getByRole("button", { name: "全局发散" }).click();
  await unsafePage.getByText("内容安全提醒").waitFor({ timeout: 5000 });
  check("敏感内容显示安全提醒", await unsafePage.getByText("AI 已停止本次联想").isVisible());
  check("敏感内容不生成候选", (await unsafePage.locator('[data-testid="candidate-node"]').count()) === 0);
  check("安全提醒不提供直接重试", (await unsafePage.getByRole("button", { name: "重试" }).count()) === 0);

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
