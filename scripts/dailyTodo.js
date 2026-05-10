// scripts/dailyTodo.js
// 未完了タスクと直近のDaily Logsを読み取り、LLMで今日のTODOを生成してNotionページに投稿する

const { generateText } = require('./llm');

const {
  NOTION_TOKEN,
  NOTION_TASKS_DB_ID,
  NOTION_DAILY_LOGS_DB_ID,
  NOTION_TODO_PAGE_ID,
} = process.env;

const NOTION_HEADERS = {
  Authorization: `Bearer ${NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

// ── 未完了タスクを取得 ──
async function getIncompleteTasks() {
  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_TASKS_DB_ID}/query`, {
    method: 'POST',
    headers: NOTION_HEADERS,
    body: JSON.stringify({
      filter: {
        property: 'Status',
        select: { does_not_equal: 'Done' },
      },
      sorts: [
        { property: 'Priority', direction: 'ascending' },
        { property: 'Due Date', direction: 'ascending' },
      ],
    }),
  });
  const data = await res.json();
  return (data.results || []).map((page) => ({
    name: page.properties.Name?.title?.[0]?.plain_text ?? '無題',
    status: page.properties.Status?.select?.name ?? '不明',
    priority: page.properties.Priority?.select?.name ?? '不明',
    dueDate: page.properties['Due Date']?.date?.start ?? 'なし',
  }));
}

// ── 直近3日間のDaily Logsを取得 ──
async function getRecentLogs() {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const dateStr = threeDaysAgo.toISOString().split('T')[0];

  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DAILY_LOGS_DB_ID}/query`, {
    method: 'POST',
    headers: NOTION_HEADERS,
    body: JSON.stringify({
      filter: {
        property: 'Date',
        date: { on_or_after: dateStr },
      },
      sorts: [{ property: 'Date', direction: 'descending' }],
    }),
  });
  const data = await res.json();
  return (data.results || []).map((page) => ({
    title: page.properties.Title?.title?.[0]?.plain_text ?? '無題',
    date: page.properties.Date?.date?.start ?? '不明',
    summary: page.properties.Summary?.rich_text?.[0]?.plain_text ?? '',
  }));
}

// ── TODO ページの中身を更新 ──
async function updateTodoPage(content) {
  // 既存ブロックを削除
  const blocksRes = await fetch(`https://api.notion.com/v1/blocks/${NOTION_TODO_PAGE_ID}/children?page_size=100`, {
    headers: NOTION_HEADERS,
  });
  const blocksData = await blocksRes.json();
  for (const block of blocksData.results || []) {
    await fetch(`https://api.notion.com/v1/blocks/${block.id}`, {
      method: 'DELETE',
      headers: NOTION_HEADERS,
    });
  }

  // 新しいブロックを追加
  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const blocks = [
    {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: `📋 ${today} の TODO` } }],
      },
    },
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content } }],
      },
    },
  ];

  await fetch(`https://api.notion.com/v1/blocks/${NOTION_TODO_PAGE_ID}/children`, {
    method: 'PATCH',
    headers: NOTION_HEADERS,
    body: JSON.stringify({ children: blocks }),
  });
}

// ── メイン処理 ──
async function main() {
  console.log('TODO 生成開始');

  const tasks = await getIncompleteTasks();
  const logs = await getRecentLogs();

  console.log(`未完了タスク: ${tasks.length} 件`);
  console.log(`直近ログ: ${logs.length} 件`);

  const tasksText = tasks.length > 0
    ? tasks.map((t) => `- [${t.priority}] ${t.name}（状態: ${t.status}、期限: ${t.dueDate}）`).join('\n')
    : '（未完了タスクなし）';

  const logsText = logs.length > 0
    ? logs.map((l) => `- ${l.date}: ${l.title} — ${l.summary}`).join('\n')
    : '（直近のログなし）';

  const prompt = `あなたは個人開発者の進捗管理アシスタントです。
以下の情報をもとに、今日取り組むべきタスクを優先度順に提案してください。

## 未完了タスク
${tasksText}

## 直近3日間の作業ログ
${logsText}

## 出力ルール
- 今日やるべきことを3〜5項目、優先度順にリストアップ
- 各項目に「なぜ今日やるべきか」を一言添える
- 期限が近いタスクは最優先
- 直近の作業ログの流れを考慮し、継続すべき作業があれば含める
- 簡潔に、箇条書きで出力`;

  const todo = await generateText(prompt);
  console.log(`TODO 生成完了:\n${todo}`);

  await updateTodoPage(todo);
  console.log('Notion ページ更新完了 ✅');
}

main().catch((err) => {
  console.error('エラー:', err.message);
  process.exit(1);
});
