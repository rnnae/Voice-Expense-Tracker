const props = PropertiesService.getScriptProperties();

const TELEGRAM_TOKEN = props.getProperty('TELEGRAM_TOKEN');
const TELEGRAM_ID = props.getProperty('TELEGRAM_ID');
const GEMINI_API_KEY = props.getProperty('GEMINI_API_KEY');
const SHEET_ID = props.getProperty('SHEET_ID');
const WEBHOOK_PASSWORD = props.getProperty('WEBHOOK_PASSWORD');

function getNextRowInColumnA(sheet) {
  const valoresA = sheet.getRange("A:A").getValues();
  let nextRow = 1;
  while (valoresA[nextRow - 1] && valoresA[nextRow - 1][0] !== "") {
    nextRow++;
  }
  return nextRow;
}

function setup() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
  const nextRow = getNextRowInColumnA(sheet);
  sheet.getRange(nextRow, 1, 1, 3).setValues([["LOG", new Date(), "Sistema Reativado!"]]);
}

function doPost(e) {
  
  if (!e.parameter || e.parameter.token !== WEBHOOK_PASSWORD) {
    console.warn("Acesso bloqueado na porta: Senha inválida ou ausente.");
    return ContentService.createTextOutput("Acesso Negado."); 
  }

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];

  try {
    const contents = JSON.parse(e.postData.contents);
    const msg = contents.message || contents.edited_message;
    if (!msg) return;

    const chatId = msg.chat.id;

    if (chatId !== Number(TELEGRAM_ID)) {

      const fusoHorario = "GMT-3"; 
      const dataHoje = Utilities.formatDate(new Date(), fusoHorario, "yyyy-MM-dd");

      const blockKey = `bloqueado_${chatId}_${dataHoje}`;
      const props = PropertiesService.getScriptProperties();

      if (props.getProperty(blockKey)) {
        return; 
      }

      const nextRow = getNextRowInColumnA(sheet);
      sheet.getRange(nextRow, 1, 1, 3).setValues([["ALERTA DE SEGURANÇA", new Date(), `Acesso bloqueado. ID do invasor: ${chatId}`]]);
      
      props.setProperty(blockKey, "verdadeiro");
      
      return; 
    }

    const voice = msg.voice || msg.audio;

    if (voice) {
      sendTelegramMessage(chatId, "🎙️ Analisando áudio via Gemini...");
      processAudio(voice.file_id, chatId, sheet);
    } else {
      sendTelegramMessage(chatId, "Por favor, envie um áudio com o seu gasto.");
    }
  } catch (error) {
    const nextRow = getNextRowInColumnA(sheet);
    sheet.getRange(nextRow, 1, 1, 3).setValues([["ERRO DO SISTEMA", new Date(), error.toString()]]);
  }
}

function processAudio(fileId, chatId, sheet) {
  const fusoHorario = "GMT-3"; // Fuso de Brasília
  const dataHoje = Utilities.formatDate(new Date(), fusoHorario, "yyyy-MM-dd");

  const fileUrl = getTelegramFileUrl(fileId);
  const audioBlob = UrlFetchApp.fetch(fileUrl).getBlob();
  const base64Audio = Utilities.base64Encode(audioBlob.getBytes());

  const prompt = `Atue como um assistente financeiro de alta precisão. Sua tarefa é extrair dados de despesa do áudio em português.

### REFERÊNCIA TEMPORAL
Data de hoje: ${dataHoje}

### REGRAS DE EXTRAÇÃO:
- "descricao": Curto resumo. Primeira letra MAIÚSCULA.
- "categoria": Escolha apenas UM: ["Alimentação", "Transporte", "Saúde", "Moradia", "Lazer", "Educação", "Outros"]. Primeira letra MAIÚSCULA.
- "data": Formato YYYY-MM-DD. Se disser "hoje" use ${dataHoje}.
- "valor": Número decimal (float). Se não mencionado, use 0.

### FORMATO DE RESPOSTA:
Retorne APENAS o JSON puro, sem markdown, sem explicações.
{
  "descricao": "",
  "categoria": "",
  "data": "",
  "valor": 0
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

    const celulaSaldoInicial = "$H$14"; 
    const formulaSaldo = `=${celulaSaldoInicial} - SUM($B$2:B${nextRow})`;

    sheet.getRange(nextRow, 1, 1, 5).setValues([[
      data.data, 
      data.valor, 
      data.categoria, 
      data.descricao, 
      formulaSaldo 
    ]]);
    
    sendTelegramMessage(chatId, `✅ Registrado!\n💰 R$ ${data.valor.toFixed(2)}\n📂 ${data.categoria}\n📝 ${data.descricao}`);
  } else {
    throw new Error("Falha na análise do Gemini: " + resText);
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
