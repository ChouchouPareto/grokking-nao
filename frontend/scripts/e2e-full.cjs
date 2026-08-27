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
  check("首页加载", await page.getByRole("heading", { level: 1, name: "Grokking恼" }).isVisible());

  // 2. 创建 Idea
  await page.getByLabel("新建项目").fill("生鲜订阅服务");
  await page.getByRole("button", { name: "创建并进入 3D" }).click();
  await page.waitForURL(/\/idea\//, { timeout: 10000 });
  check("跳转到空间页", page.url().includes("/idea/"));
  await page.waitForSelector("canvas", { timeout: 15000 });
  check("3D 画布挂载", true);

  // 2.1 左右侧栏默认收起，触边临时展开，离开后自动收回
  const leftPanel = page.locator(".workspace-panel-left");
  const rightPanel = page.locator(".workspace-panel-right");
  check("左右侧栏默认收起", !(await leftPanel.isVisible()) && !(await rightPanel.isVisible()));
  await page.mouse.move(2, 400);
  await page.waitForTimeout(420);
  check("鼠标触碰左缘显示左侧栏", await leftPanel.isVisible());
  await page.mouse.move(640, 400);
  await page.waitForTimeout(1200);
  check("离开左侧栏后自动收起", !(await leftPanel.isVisible()));
  await page.mouse.move(1278, 400);
  await page.waitForTimeout(420);
  check("鼠标触碰右缘显示右侧栏", await rightPanel.isVisible());
  await page.mouse.move(640, 400);
  await page.waitForTimeout(1200);
  check("离开右侧栏后自动收起", !(await rightPanel.isVisible()));

  await page.getByRole("button", { name: "显示左侧工具栏" }).click();
  await page.getByRole("button", { name: "显示右侧工具栏" }).click();

  // 3. 添加 5 个关键词
  await page.getByRole("button", { name: "添加节点" }).click();
  await page.locator("textarea").last().fill("生鲜\n冷链\n配送时效\n价格敏感\n复购");
  await page.getByRole("button", { name: /添加.*个节点/ }).click();
  await page.waitForTimeout(2200); // 等布局稳定 + 自动取景
  const labels = await labelPositions(page);
  check("5 个节点标签渲染", labels.length === 5, `实际 ${labels.length}`);
  const allOnScreen = labels.every(
    (l) => l.x >= 0 && l.x <= 1280 && l.y >= 0 && l.y <= 800,
  );
  check("节点均在视口内", allOnScreen, JSON.stringify(labels.map((l) => Math.round(l.x) + "," + Math.round(l.y))));
  const usableLabels = labels.filter((l) => l.x > 180 && l.x < 920 && l.y > 80 && l.y < 740);
  check("至少两个节点位于可操作画布区", usableLabels.length >= 2, `可操作 ${usableLabels.length}`);

  // 4. 按住方向键连续游走视角
  const roamTarget = page.getByTestId("formal-node").first();
  const beforeRoam = await roamTarget.boundingBox();
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(320);
  await page.keyboard.up("ArrowRight");
  const afterRoam = await roamTarget.boundingBox();
  const roamDistance = beforeRoam && afterRoam ? Math.abs(afterRoam.x - beforeRoam.x) : 0;
  check("方向键可持续游走视角", roamDistance > 4, `画面移动 ${Math.round(roamDistance)}px`);
  const beforeTurn = await roamTarget.boundingBox();
  await page.keyboard.down("q");
  await page.waitForTimeout(320);
  await page.keyboard.up("q");
  const afterTurn = await roamTarget.boundingBox();
  const turnDistance = beforeTurn && afterTurn
    ? Math.hypot(afterTurn.x - beforeTurn.x, afterTurn.y - beforeTurn.y)
    : 0;
  check("Q / E 可持续左右转向", turnDistance > 4, `画面转动 ${Math.round(turnDistance)}px`);
  await page.getByRole("button", { name: "全局视图" }).click();
  await page.waitForTimeout(350);

  // 5. 直接按住文字胶囊拖动节点
  const dragTarget = page.getByTestId("formal-node").first();
  const beforeDrag = await dragTarget.boundingBox();
  if (!beforeDrag) throw new Error("拖拽目标不可见");
  await page.mouse.move(beforeDrag.x + beforeDrag.width / 2, beforeDrag.y + beforeDrag.height / 2);
  await page.mouse.down();
  await page.mouse.move(beforeDrag.x + beforeDrag.width / 2 + 70, beforeDrag.y + beforeDrag.height / 2 + 45, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const afterDrag = await dragTarget.boundingBox();
  const dragDistance = afterDrag
    ? Math.hypot(afterDrag.x - beforeDrag.x, afterDrag.y - beforeDrag.y)
    : 0;
  check("文字胶囊可拖动", dragDistance > 30, `移动 ${Math.round(dragDistance)}px`);

  // 6. 连接两个节点
  await page.keyboard.press("c");
  check("C 进入连接模式", await page.getByText("点击一个节点作为起点").isVisible());
  await page.getByTestId("formal-node").nth(0).click();
  check("已选起点提示", await page.getByText("已选起点，再点一个节点完成连接").isVisible());
  await page.getByTestId("formal-node").nth(1).click();
  await page.waitForTimeout(400);
  check("连接后面板出现", await page.getByRole("button", { name: "标记为新发现" }).isVisible());

  // 7. 标记新发现
  await page.getByRole("button", { name: "标记为新发现" }).click();
  await page.waitForTimeout(400);
  const discCount = await page
    .locator("span")
    .filter({ hasText: "新发现" })
    .count();
  check("新发现标记成功", discCount >= 1, `发现计数元素 ${discCount}`);

  // 8. 保存状态
  check("显示已保存", await page.getByText("已保存").isVisible());

  // 9. 刷新后恢复（节点 + 新发现）
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".node-label", { timeout: 15000 });
  check("刷新后节点恢复", (await page.locator(".node-label").count()) === 5);
  check(
    "刷新后新发现恢复",
    await page.locator("span").filter({ hasText: "新发现" }).isVisible(),
  );

  // 10. 聚焦节点
  await page.getByRole("button", { name: "显示左侧工具栏" }).click();
  await page.getByTestId("formal-node").first().focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  check("聚焦提示出现", await page.getByText("聚焦中，点击「返回全局」退出").isVisible());

  // 11. Delete 快捷键删除当前选中节点
  await page.keyboard.press("Delete");
  await page.waitForTimeout(400);
  check("Delete 删除选中节点", (await page.getByTestId("formal-node").count()) === 4);

  // 12. 无控制台错误
  check("无控制台错误", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== 结果：${results.length - failed.length}/${results.length} 通过 =====`);
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((e) => {
  console.error("脚本异常：", e.message);
  process.exit(1);
});
