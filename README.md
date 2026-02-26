<br>

# VoiceExpenseTracker

A serverless, AI-powered personal finance automation. This project allows you to record your daily expenses simply by sending a voice message to a private Telegram Bot in any language. The audio is processed by the Google Gemini 3.1 Flash multimodal API, which extracts the data, categorizes the expense, translates it to English, and automatically inserts it into a Google Spreadsheet, recalculating your remaining balance dynamically.
<br><br>

## Features
- Voice-to-Text & Data Extraction: No need to type. Just say "I spent 25 bucks on a pizza today" and the AI handles the rest.

- Multilingual Input: Speak in Portuguese, Spanish, French, or any language; the bot standardizes the output to English in your spreadsheet.

- Smart Row Insertion: A custom algorithm finds the next empty row in the logging columns, safely ignoring other summary tables (like fixed bills) on the same sheet.

- Enterprise-Grade Security:

  - Identity Lock: Rejects messages from unauthorized Telegram IDs.

  - Anti-Flood System: Uses Google's PropertiesService cache to block spam attempts instantly without exhausting API quotas.

  - Endpoint Protection: Requires a secret token in the Webhook URL to prevent unauthenticated direct POST requests.

  - Vaulted Secrets: No hardcoded API keys. All secrets are stored in Google Apps Script Properties.
<br>

## Architecture / Flow
1. User sends a Voice Message via Telegram.

2. Telegram sends a POST request via Webhook to Google Apps Script.

3. Apps Script downloads the audio file and sends it to the Gemini API.

4. Gemini returns a strictly typed JSON {"date", "amount", "category", "description"}.

5. Apps Script writes the data to Google Sheets and calculates the running balance.

6. The Bot replies on Telegram with a success summary.
<br>

## Step-by-Step Installation Guide
Step 1: Google Sheets Setup
Create a new Google Sheet.

Crucial Rule: The script always interacts with the first tab (leftmost tab) of your spreadsheet. Ensure your current active month is always the first tab.

Set up your columns. The script expects the first 5 columns to be: Date | Value | Category | Description | Total.

Define your "Initial Balance" cell (e.g., H14). You can adjust this reference in the code (const initialBalanceCell = "$H$14";).

Extract your SHEET_ID from the URL: https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_SHEET_ID/edit

Step 2: Get API Keys & IDs
Telegram Bot Token: Go to Telegram, search for @BotFather. Send /newbot, choose a name and username. Copy the HTTP API Token.

Telegram User ID: Search for @userinfobot on Telegram. Send /start. Copy your numerical Id (e.g., 123456789). This ensures only you can use the bot.

Gemini API Key: Go to Google AI Studio, sign in, and create a new API Key.

Step 3: Google Apps Script Setup
In your Google Sheet, go to Extensions > Apps Script.

Delete any existing code and paste the code from script.js (provided in this repository).

Set up the Vault (Script Properties):

On the left menu of the Apps Script editor, click the Gear Icon (Project Settings).

Scroll down to Script Properties and add the following key-value pairs exactly:

TELEGRAM_TOKEN : Your Bot Token

TELEGRAM_ID : Your User ID

GEMINI_API_KEY : Your Gemini Key

SHEET_ID : Your Sheet ID

WEBHOOK_PASSWORD : Create a secure password (e.g., MySecretToken2026)

TIMEZONE : Your local timezone (e.g., GMT-3 or America/New_York)

Step 4: Authorization & Deployment
Go back to the Code Editor (<>). Select the setup function from the top dropdown and click ▶ Run.

Google will ask for permissions. Click Review Permissions > Choose your account > Advanced > Go to [Project Name]. This authorizes the script to read your sheets and access the internet.

Check your spreadsheet: A "LOG" row saying "System Reactivated!" should appear.

Now, click the blue Deploy > New Deployment button at the top right.

Select type: Web App.

Execute as: Me.

Who has access: Anyone (⚠️ CRITICAL: Must be "Anyone", NOT "Anyone with Google Account", otherwise Telegram will be blocked).

Click Deploy and copy the Web App URL (ends in /exec).

Step 5: Connecting the Telegram Webhook (The Tricky Part)
You must tell Telegram where to send the messages, including your secret security token.

Open a new tab in your web browser.

Assemble this exact URL using your variables:
https://api.telegram.org/bot<YOUR_TELEGRAM_TOKEN>/setWebhook?url=<YOUR_WEB_APP_URL>?token=<YOUR_WEBHOOK_PASSWORD>

Example: https://api.telegram.org/bot12345:ABCDE/setWebhook?url=https://script.google.com/.../exec?token=MySecretToken2026

Hit Enter. You should see a JSON response: {"ok":true,"result":true,"description":"Webhook was set"}.

Done! Send a voice message to your bot to test it.
<br><br>

## Troubleshooting & Important Notes
The "New Version" Rule: If you ever make a change to the code in Apps Script, hitting "Save" is not enough. You MUST go to Deploy > Manage Deployments > Edit (Pencil Icon) > Version: New Version > Deploy. If you skip this, Google will continue running the old cached version of your code.

Bot is completely silent:

Check if the ?token=YOUR_PASSWORD was correctly added to the Webhook URL.

Check the Executions tab (Clock icon) in Apps Script. If it's empty, Telegram is getting a 403 or 404 error (redo Step 5). If it shows "Failed", click it to see the exact line causing the error.

Telegram Webhook 404 Error: If you create a "New Deployment" instead of updating the existing one, Google generates a completely new URL. You must re-run the Webhook setup (Step 5) with the new URL.

The Row Insertion Logic: The script intentionally avoids using sheet.appendRow(). Instead, it scans only Column A from top to bottom to find the next empty cell. This allows you to have fixed side-tables (like a "Fixed Bills" summary in columns G and H) without the script appending data at the very bottom of the sheet.
<br><br><br>

### License
This project is open-source and available under the MIT License. Feel free to fork, modify, and use it to take control of your personal finances!
<br>
