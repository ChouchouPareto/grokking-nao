// 切片 1 完整核心闭环端到端测试（复用本机 Chrome）。
const { chromium } = require("playwright-core");

const BASE = "http://localhost:3010";
const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
}

async function labelPositions(page) {
  return page.locator(".node-label").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }),
  );
}

// 点击球体：球体位于标签下方约 18px（球体半径 0.55 世界单位的投影）
async function clickSphere(page, label) {
  await page.mouse.click(Math.round(label.x), Math.round(label.y + 18));
  await page.waitForTimeout(300);
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
  page.on("pageerror", (err) => consoleErrors.push("pageerror: " + err.message));

  // 1. 首页
  await page.goto(BASE, { waitUntil: "networkidle" });
  check("首页加载", await page.getByText("我有一个念头").isVisible());

  // 2. 创建 Idea
  await page.getByPlaceholder("写下一点正在想的东西…").fill("生鲜订阅服务");
  await page.getByRole("button", { name: "进入空间" }).click();
  await page.waitForURL(/\/idea\//, { timeout: 10000 });
  check("跳转到空间页", page.url().includes("/idea/"));
  await page.waitForSelector("canvas", { timeout: 15000 });
  check("3D 画布挂载", true);

  // 3. 添加 5 个关键词
  await page.getByRole("button", { name: /添加关键词/ }).click();
  await page.locator("textarea").last().fill("生鲜\n冷链\n配送时效\n价格敏感\n复购");
  await page.getByRole("button", { name: /添加.*个节点/ }).click();
  await page.waitForTimeout(2200); // 等布局稳定 + 自动取景
  const labels = await labelPositions(page);
  check("5 个节点标签渲染", labels.length === 5, `实际 ${labels.length}`);
  const allOnScreen = labels.every(
    (l) => l.x >= 0 && l.x <= 1280 && l.y >= 0 && l.y <= 800,
  );
  check("节点均在视口内", allOnScreen, JSON.stringify(labels.map((l) => Math.round(l.x) + "," + Math.round(l.y))));

  // 4. 连接两个节点
  await page.getByRole("button", { name: "连接节点" }).click();
  await clickSphere(page, labels[0]);
  check("已选起点提示", await page.getByText("已选起点，再点一个节点完成连接").isVisible());
  await clickSphere(page, labels[1]);
  await page.waitForTimeout(400);
  check("连接后面板出现", await page.getByText("连接", { exact: true }).isVisible());

  // 5. 标记新发现
  await page.getByRole("button", { name: "标记为新发现" }).click();
  await page.waitForTimeout(400);
  const discCount = await page
    .locator("span")
    .filter({ hasText: "新发现" })
    .count();
  check("新发现标记成功", discCount >= 1, `发现计数元素 ${discCount}`);

  // 6. 保存状态
  check("显示已保存", await page.getByText("已保存").isVisible());

  // 7. 刷新后恢复（节点 + 新发现）
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".node-label", { timeout: 15000 });
  check("刷新后节点恢复", (await page.locator(".node-label").count()) === 5);
  check(
    "刷新后新发现恢复",
    await page.locator("span").filter({ hasText: "新发现" }).isVisible(),
  );

  // 8. 聚焦节点
  const labels2 = await labelPositions(page);
  await clickSphere(page, labels2[0]);
  await page.waitForTimeout(400);
  check("聚焦提示出现", await page.getByText("聚焦中，点击「返回全局」退出").isVisible());

  // 9. 无控制台错误
  check("无控制台错误", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== 结果：${results.length - failed.length}/${results.length} 通过 =====`);
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((e) => {
  console.error("脚本异常：", e.message);
  process.exit(1);
});
