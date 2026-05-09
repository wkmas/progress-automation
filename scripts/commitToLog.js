// scripts/commitToLog.js
// コミット情報を受け取り、Claude API で要約して Notion Daily Logs に書き込む

const {
  NOTION_TOKEN,
  NOTION_DAILY_LOGS_DB_ID,
  NOTION_PROJECTS_DB_ID,
  REPO_URL,
  COMMIT_SHA,
  COMMIT_MESSAGE,
  AUTHOR,
  TIMESTAMP,
  BRANCH,
} = process.env;

// ── 1. Notion でリポジトリ URL に一致するプロジェクトを検索 ──────────────────
async function findProject(repoUrl) {
  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_PROJECTS_DB_ID}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: {
        property: 'Repo URL',
        url: { equals: repoUrl },
      },
    }),
  });

  const data = await res.json();
  if (!data.results || data.results.length === 0) {
    throw new Error(`Projects DB に Repo URL "${repoUrl}" に一致するプロジェクトが見つかりません`);
  }
  return data.results[0];
}

// ── 2. Notion Daily Logs DB にレコードを作成 ──────────────────────────────────
async function createDailyLog({ title, projectId, date, commitSha, summary }) {
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: NOTION_DAILY_LOGS_DB_ID },
      properties: {
        Title: {
          title: [{ text: { content: title } }],
        },
        Projects: {
          relation: [{ id: projectId }],
        },
        Date: {
          date: { start: date },
        },
        Type: {
          select: { name: 'Commit' },
        },
        'Commit SHA': {
          rich_text: [{ text: { content: commitSha } }],
        },
        Summary: {
          rich_text: [{ text: { content: summary } }],
        },
      },
    }),
  });

  const data = await res.json();
  if (data.object === 'error') {
    throw new Error(`Notion API エラー: ${data.message}`);
  }
  return data;
}

// ── メイン処理 ────────────────────────────────────────────────────────────────
async function main() {
  console.log(`処理開始: ${REPO_URL} / ${COMMIT_SHA}`);

  // プロジェクト検索
  const project = await findProject(REPO_URL);
  const projectId = project.id;
  const projectName = project.properties.Name.title[0]?.plain_text ?? '不明なプロジェクト';
  console.log(`プロジェクト発見: ${projectName}`);

  const summary = COMMIT_MESSAGE;

  // 日付をISO形式に変換（YYYY-MM-DD）
  const date = new Date(TIMESTAMP).toISOString().split('T')[0];

  // Daily Log タイトルを生成（コミットメッセージの先頭50文字）
  const title = COMMIT_MESSAGE.length > 50
    ? COMMIT_MESSAGE.substring(0, 50) + '...'
    : COMMIT_MESSAGE;

  // Notion に書き込み
  await createDailyLog({ title, projectId, date, commitSha: COMMIT_SHA, summary });
  console.log('Daily Log 作成完了 ✅');
}

main().catch((err) => {
  console.error('エラー:', err.message);
  process.exit(1);
});
