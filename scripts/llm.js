// scripts/llm.js
// LLM プロバイダーの抽象化レイヤー
// チーム展開時や無料枠制限時にプロバイダーを切り替えられるよう設計
//
// 切り替え方法:
//   1. LLM_PROVIDER 環境変数を設定（デフォルト: gemini）
//   2. 対応する API キーを環境変数に設定
//
// 対応プロバイダー:
//   - gemini: Google Gemini API（デフォルト、無料枠あり）
//   - claude: Anthropic Claude API（高品質、有料）
//   - openai: OpenAI API（有料）

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'gemini';

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  const data = await res.json();
  if (data.error) {
    throw new Error(`Gemini API エラー: ${data.error.message}`);
  }
  return data.candidates[0].content.parts[0].text;
}

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY が設定されていません');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  if (!data.content) {
    throw new Error(`Claude API エラー: ${JSON.stringify(data)}`);
  }
  return data.content[0].text;
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY が設定されていません');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`OpenAI API エラー: ${data.error.message}`);
  }
  return data.choices[0].message.content;
}

async function generateText(prompt) {
  switch (LLM_PROVIDER) {
    case 'gemini':
      return callGemini(prompt);
    case 'claude':
      return callClaude(prompt);
    case 'openai':
      return callOpenAI(prompt);
    default:
      throw new Error(`未対応の LLM プロバイダー: ${LLM_PROVIDER}`);
  }
}

module.exports = { generateText };
