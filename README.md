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
2. Go to the **AI Settings** tab and select your preferred **Free API Provider**:
   - **Custom API (e.g. Groq Free Tier)** (Default): Pre-configured to use Groq's high-speed endpoint (`https://api.groq.com/openai/v1`) with the `llama-3.1-8b-instant` model. Paste your Groq API Key to get started.
   - **Local Ollama (Free & Offline)**: Connects to your local offline Ollama server (`http://localhost:11434/v1`). Works with custom local models (like `qwen3:4b` or `llama3`) completely offline with no internet needed!
   - **Google Gemini API (Free Tier)**: Connects directly to Google's cloud API. Simply paste your free API key from Google AI Studio and select a model (like `gemini-2.5-flash`).
3. Go to the **Profile** tab and enter your personal details if required by the form:
   - **Name** (e.g. `Kuldeep Sisodiya`)
   - **Enrollment Number** (e.g. `0863EC241030`)
   - Any custom fields (e.g. Class, Section, Roll Number).
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
