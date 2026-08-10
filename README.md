# AutoFillAI

An AI-powered Chrome extension that automatically reads quiz questions, multiple-choice options, and text fields on the current page, solves them using advanced AI (like Groq Llama-3.1), and automatically fills in the answers on-screen with a smooth sequential animation.

*Developed with ❤️ by **Kuldeep Sisoodiya***

---

## 🚀 Features

- **Context-Aware AI Solver**: Submits all page questions together in a single API call so the AI has the full context of the quiz (great for technical topics like cellular communication, signals, etc.), maximizing solving accuracy.
- **Visual Fill Animation**: Once solved, answers are filled on the screen one-by-one with a smooth `200ms` delay, giving clean, visual confirmation.
- **Dedicated Groq / OpenAI Integration**: Pre-configured to use Groq's high-speed `llama-3.1-8b-instant` model for near-instant responses.
- **Personal Profile Autofill**: Automatically fills in personal details (Name, Enrollment/Roll Number, and custom fields) when requested by form inputs.
- **Clean Settings Interface**: Tidy settings view showing only the custom API endpoint configuration, model name, and prompt instructions.
- **Robust Schema Parsing**: Handles both JSON objects and JSON array outputs directly from the model, making parsing bulletproof.

---

## 🛠️ Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-username/AutoFillAI.git
   ```
   *(Or download the repository ZIP file and extract it).*

2. **Load the Extension in Chrome**:
   - Open Google Chrome and navigate to `chrome://extensions/`.
   - Toggle the **Developer mode** switch in the top-right corner to **ON**.
   - Click the **Load unpacked** button in the top-left corner.
   - Select the extracted `Autofiller` folder.

---

## ⚙️ Configuration & Setup

1. Click on the **AutoFillAI** extension icon in your Chrome toolbar.
2. Go to the **AI Settings** tab:
   - **API Base URL**: Pre-configured to `https://api.groq.com/openai/v1`.
   - **API Key / Token**: Paste your Groq API Key (keys are stored securely in local storage, never hardcoded).
   - **Custom Model Name**: Pre-configured to `llama-3.1-8b-instant`.
3. Go to the **Profile** tab and enter your:
   - **Name** (e.g. `Kuldeep Sisodiya`)
   - **Enrollment Number** (e.g. `0863EC241030`)
   - Any custom field you need.
4. (Optional) Custom Solver Instructions are pre-configured to act as an Electronics & Communication Engineering Professor for academic accuracy on ECE quizzes.

---

## 📖 How to Use

1. Navigate to your online quiz or form (such as a Google Form).
2. Open the extension popup.
3. In the **Actions** tab, click **Solve & Autofill Questions** (for AI solving) or **Fill Personal Info** (for profile details only).
4. Watch the answers get solved and automatically ticked/filled down the page!

---

## 🔒 Privacy & Safety

- Your API key is stored locally in your browser's private extension storage (`chrome.storage.local`) and is only ever sent directly to the API endpoint you configure. No external servers or telemetry are used.
