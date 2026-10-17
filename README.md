# AutoFillAI

An AI-powered browser extension for Microsoft Edge and Google Chrome that automatically reads quiz questions, multiple-choice options, and text fields on the current page, solves them using advanced AI (with built-in support for Mistral AI, Groq Llama-3.1, or Gemini), and automatically fills in the answers on-screen with a smooth sequential animation.

*Developed with ❤️ by **Kuldeep Sisoodiya***

---

## 🚀 Features

- **Actions-First Interface**: Opens directly to the **Actions** tab for instant 1-click solving and autofilling without unnecessary clicks.
- **Multiple API Keys & Automatic Failover**: Enter multiple API keys (from different accounts) separated by newlines or commas. If one key hits token limits or rate limits (HTTP 429/quota), AutoFillAI automatically switches to the backup key on the fly without interrupting!
- **Mistral AI Default Preset**: Pre-configured with **Mistral AI** (`ministral-3b-2512`) as the default engine for fast, accurate reasoning.
- **1-Click API Key Helper**: Direct tappable link right below the API key input to quickly grab a free API key from [console.mistral.ai](https://console.mistral.ai/api-keys/).
- **Context-Aware AI Solver**: Submits all page questions together in a single API call so the AI has the full context of the quiz (great for technical topics like cellular communication, signals, etc.), maximizing solving accuracy.
- **Visual Fill Animation**: Once solved, answers are filled on the screen one-by-one with a smooth `200ms` delay, giving clean, visual confirmation.
- **Flexible Multi-Provider AI Support**: Built-in presets for **Mistral AI** (`ministral-3b-2512`), **Groq** (`llama-3.1-8b-instant`), **Google Gemini** (`gemini-2.5-flash`), offline **Local Ollama** models, and any custom OpenAI-compatible endpoint.
- **Personal Profile Autofill**: Automatically fills in personal details (Name, Enrollment/Roll Number, and custom fields) when requested by form inputs.
- **Robust Schema Parsing**: Handles both JSON objects and JSON array outputs directly from the model, making parsing bulletproof.

---

## 🛠️ Installation

### For Microsoft Edge:
1. Open Microsoft Edge and navigate to `edge://extensions/`.
2. Turn ON **Developer mode** (toggle in the left sidebar).
3. Click the **Load unpacked** button.
4. Select the `Autofiller` project folder.

### For Google Chrome:
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle the **Developer mode** switch in the top-right corner to **ON**.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the `Autofiller` project folder.

---

## ⚙️ Configuration & Setup

1. Click on the **AutoFillAI** extension icon in your browser toolbar.
2. The extension opens directly to the **Actions** tab.
3. Switch to the **AI Settings** tab:
   - **Mistral AI (Free Tier)** *(Default)*: Pre-configured with Mistral's API endpoint (`https://api.mistral.ai/v1`) and the `ministral-3b-2512` model.
   - **API Key(s)**: Paste your API key. You can paste **multiple keys from different accounts** (one per line or comma-separated). The badge will show `⚡ 2 keys (Key #1 active)` and will automatically cycle when a token/quota limit is hit!
   - Tap **"Get Free Mistral API Key"** to open [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys/) and generate free keys.
   - *Other available providers*: **Custom API (Groq Free Tier)**, **Local Ollama (Offline)**, and **Google Gemini API**.
4. (Optional) Switch to the **Profile** tab to save personal details if required by the form:
   - **Name** (e.g. `Kuldeep Sisodiya`)
   - **Enrollment Number** (e.g. `0863EC241030`)
   - Any custom fields (e.g. Class, Section, Roll Number).
5. Custom Solver Instructions can be customized anytime in the AI Settings tab.

---

## 📖 How to Use

1. Navigate to your online quiz or form (such as a Google Form).
2. Open the extension popup (opens directly to **Actions**).
3. Click **Solve & Autofill Questions** (for AI solving) or **Fill Personal Info** (for profile details only).
4. Watch the answers get solved and automatically ticked/filled down the page!

---

## 🔒 Privacy & Safety

- Your API key is stored locally in your browser's private extension storage (`chrome.storage.local`) and is only ever sent directly to the API endpoint you configure. No external servers or telemetry are used.
