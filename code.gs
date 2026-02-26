const props = PropertiesService.getScriptProperties();

const TELEGRAM_TOKEN = props.getProperty('TELEGRAM_TOKEN');
const TELEGRAM_ID = props.getProperty('TELEGRAM_ID');
const GEMINI_API_KEY = props.getProperty('GEMINI_API_KEY');
const SHEET_ID = props.getProperty('SHEET_ID');
const WEBHOOK_PASSWORD = props.getProperty('WEBHOOK_PASSWORD');
const TIMEZONE = props.getProperty('TIMEZONE');

function getNextRowInColumnA(sheet) {
  const valuesA = sheet.getRange("A:A").getValues();
  let nextRow = 1;
  while (valuesA[nextRow - 1] && valuesA[nextRow - 1][0] !== "") {
    nextRow++;
  }
  return nextRow;
}

function setup() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
  const nextRow = getNextRowInColumnA(sheet);
  sheet.getRange(nextRow, 1, 1, 3).setValues([["LOG", new Date(), "System Reactivated!"]]);
}

function doPost(e) {
  
  if (!e.parameter || e.parameter.token !== WEBHOOK_PASSWORD) {
    console.warn("Access blocked at the port: Invalid or missing password.");
    return ContentService.createTextOutput("Access Denied."); 
  }

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];

  try {
    const contents = JSON.parse(e.postData.contents);
    const msg = contents.message || contents.edited_message;
    if (!msg) return;

    const chatId = msg.chat.id;

    if (chatId !== Number(TELEGRAM_ID)) {

      const todayDate = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");

      const blockKey = `blocked_${chatId}_${todayDate}`;
      const props = PropertiesService.getScriptProperties();

      if (props.getProperty(blockKey)) {
        return; 
      }

      const nextRow = getNextRowInColumnA(sheet);
      sheet.getRange(nextRow, 1, 1, 3).setValues([["SECURITY ALERT", new Date(), `Access blocked. Invader ID: ${chatId}`]]);
      
      props.setProperty(blockKey, "true");
      
      return; 
    }

    const voice = msg.voice || msg.audio;

    if (voice) {
      sendTelegramMessage(chatId, "🎙️ Analyzing audio via Gemini...");
      processAudio(voice.file_id, chatId, sheet);
    } else {
      sendTelegramMessage(chatId, "Please send an audio recording of your expense.");
    }
  } catch (error) {
    const nextRow = getNextRowInColumnA(sheet);
    sheet.getRange(nextRow, 1, 1, 3).setValues([["SYSTEM ERROR", new Date(), error.toString()]]);
  }
}

function processAudio(fileId, chatId, sheet) {
  const todayDate = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");

  const fileUrl = getTelegramFileUrl(fileId);
  const audioBlob = UrlFetchApp.fetch(fileUrl).getBlob();
  const base64Audio = Utilities.base64Encode(audioBlob.getBytes());

  const prompt = `Act as a high-precision financial assistant. Your task is to extract expense data from the audio. The user may speak in any language, but you MUST extract the information and return it in English.

### TEMPORAL REFERENCE
Today's date: ${todayDate}

### EXTRACTION RULES:
- "description": Short summary of the expense. First letter UPPERCASE.
- "category": Choose strictly ONE of the following: ["Food", "Transport", "Health", "Housing", "Leisure", "Education", "Others"]. First letter UPPERCASE.
- "date": YYYY-MM-DD format. If the audio mentions "today", use ${todayDate}. If it mentions "yesterday", calculate the correct past date.
- "amount": Decimal number (float). If not mentioned, use 0.

### RESPONSE FORMAT:
Return ONLY the pure JSON, without markdown, without explanations.
{
  "description": "",
  "category": "",
  "date": "",
  "amount": 0
}`;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
  
  const payload = {
    "contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "audio/ogg", "data": base64Audio}}]}],
    "generationConfig": { "temperature": 0.1, "response_mime_type": "application/json" }
  };

  const response = UrlFetchApp.fetch(geminiUrl, {
    method: "POST",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const resText = response.getContentText();
  const result = JSON.parse(resText);

  if (result.candidates && result.candidates[0].content.parts) {
    let rawJson = result.candidates[0].content.parts[0].text;
    rawJson = rawJson.replace(/```json/g, "").replace(/```/g, "").trim();
    const data = JSON.parse(rawJson);
    
    const nextRow = getNextRowInColumnA(sheet);

    const initialBalanceCell = "$H$14"; 
    const balanceFormula = `=${initialBalanceCell} - SUM($B$2:B${nextRow})`;

    sheet.getRange(nextRow, 1, 1, 5).setValues([[
      data.date, 
      data.amount, 
      data.category, 
      data.description, 
      balanceFormula 
    ]]);
    
    sendTelegramMessage(chatId, `✅ Registered!\n💰 $ ${data.amount.toFixed(2)}\n📂 ${data.category}\n📝 ${data.description}`);
  } else {
    throw new Error("Gemini analysis failed: " + resText);
  }
}

function getTelegramFileUrl(fileId) {
  const getFileUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`;
  const response = UrlFetchApp.fetch(getFileUrl);
  const filePath = JSON.parse(response.getContentText()).result.file_path;
  return `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;
}

function sendTelegramMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  UrlFetchApp.fetch(url, {
    method: "POST",
    payload: { chat_id: chatId.toString(), text: text }
  });
}
