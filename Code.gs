var OPENAI_MODEL = 'gpt-5.4-mini';
var SPREADSHEET_ID = '1TolZAXCCD2OUZiStX1X-qWTZfohtDLKABqz-MxFjHEY';
var SHEET_NAME = 'Chatbot聊天紀錄';

function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('index')
    .setTitle('Chatbot')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(event) {
  try {
    var payload = JSON.parse(event.postData.contents || '{}');
    var result = handleChat(payload);
    return jsonOutput(result);
  } catch (error) {
    return jsonOutput({ error: true, message: error.message });
  }
}

function handleChat(payload) {
  var now = new Date();
  var conversationId = payload.conversationId || Utilities.getUuid();
  var userMessage = String(payload.message || '').trim();

  if (!userMessage) {
    throw new Error('訊息內容不可為空。');
  }

  appendLog({
    conversationId: conversationId,
    role: 'user',
    content: userMessage,
    model: OPENAI_MODEL,
    createdAt: now
  });

  var reply = callOpenAI(payload, userMessage);

  appendLog({
    conversationId: conversationId,
    role: 'assistant',
    content: reply,
    model: OPENAI_MODEL,
    createdAt: new Date()
  });

  return {
    conversationId: conversationId,
    reply: reply
  };
}

function callOpenAI(payload, userMessage) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_AI_KEY');
  if (!apiKey) {
    throw new Error('尚未設定 OPENAI_AI_KEY。');
  }

  var history = Array.isArray(payload.history) ? payload.history.slice(-12) : [];
  var messages = [
    {
      role: 'system',
      content: payload.persona || defaultPersona()
    }
  ];

  history.forEach(function(item) {
    if (!item || !item.role || !item.content) return;
    var role = item.role === 'assistant' ? 'assistant' : 'user';
    messages.push({ role: role, content: String(item.content) });
  });

  messages.push({ role: 'user', content: userMessage });

  var response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + apiKey
    },
    payload: JSON.stringify({
      model: OPENAI_MODEL,
      messages: messages,
      temperature: 0.75
    }),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  var body = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error('OpenAI 回應異常：' + status + ' ' + body);
  }

  var data = JSON.parse(body);
  var reply = data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;

  return stripMarkdown(reply || '我在，請再多告訴我一點，我會陪你慢慢整理。');
}

function appendLog(entry) {
  var sheet = getLogSheet();
  sheet.appendRow([
    Utilities.formatDate(entry.createdAt, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss'),
    entry.conversationId,
    entry.role,
    entry.content,
    entry.model
  ]);
}

function getLogSheet() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.appendRow(['日期時間', '對話ID', '角色', '內容', '模型']);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, 5);
  }

  return sheet;
}

function jsonOutput(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function defaultPersona() {
  return [
    '你是 Chatbot，一位個性開朗、幽默、善於安慰人的聊天機器人。',
    '你熟悉各種學科知識，也擅長用清楚、耐心、循序漸進的方式教學。',
    '你的回答要溫和、正式、自然、有陪伴感，可以適度逗人笑。',
    '不要使用 Markdown 格式，不要輸出列表符號語法，不要使用測試稿語氣。'
  ].join('\n');
}

function stripMarkdown(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, function(block) { return block.replace(/```/g, ''); })
    .replace(/[*_#>`~]/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .trim();
}
