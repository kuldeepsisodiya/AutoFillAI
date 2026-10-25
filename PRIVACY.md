# Privacy Policy for AutoFillAI

**Effective Date:** October 17, 2026  
**Developer:** Kuldeep Sisoodiya  
**Contact:** kuldeepsisodiya@gmail.com  

AutoFillAI ("the Extension") is committed to respecting and protecting your privacy. This Privacy Policy explains our practices regarding user data, storage, and external communications.

---

### 1. Data Collection and Usage
**AutoFillAI does NOT collect, harvest, sell, or store any personal data on external developer servers.**

- **No Developer Servers or Tracking:** The developer does not operate any backend servers, databases, analytics, or telemetry systems for this extension.
- **Local Storage Only:** Any information you enter into the extension (such as your Name, Enrollment number, custom profile fields, AI preferences, or API keys) is stored strictly on your local device within your browser's private local extension storage (`chrome.storage.local`).
- **Form Data Processing:** When you click "Solve & Autofill Questions", the text of questions and multiple-choice options on the current webpage is parsed locally and sent directly to the AI provider you selected (such as Mistral AI, Google Gemini, or your custom API endpoint) exclusively to generate answers. This information is never intercepted or retained by the extension developer.

---

### 2. Third-Party & Local AI Services
AutoFillAI allows users to connect directly to cloud or local AI providers:
- **Mistral AI:** Interacts directly with `https://api.mistral.ai/v1`. Subject to [Mistral AI's Privacy Policy](https://mistral.ai/terms/#privacy-policy).
- **Google Gemini API:** Interacts directly with `https://generativelanguage.googleapis.com/`. Subject to [Google Privacy Policy](https://policies.google.com/privacy).
- **Apple Foundation Models (macOS Local):** Interacts strictly on-device with the local Apple Foundation Models service (`http://127.0.0.1:1976`) spawned by `fm serve`. No data leaves your Mac, and no external network transmission occurs.
- **Local Ollama / Custom Endpoints:** Interacts directly with the user-configured API URL or local offline host (e.g. `localhost:11434` or `127.0.0.1`).

Your API keys and form questions are transmitted solely between your browser and the respective AI service endpoint over encrypted HTTPS (or private local loopback for Apple FM and Ollama).

---

### 3. Permissions Justification
AutoFillAI requests only the minimum permissions necessary to function:
- **`storage`:** To locally store user profile details and extension preferences on the user's machine.
- **`activeTab` & `scripting`:** To read questions from and input answers into the webpage the user is actively viewing when the user clicks an action button.
- **`webNavigation`:** To detect and autofill form fields embedded inside nested iframes (such as embedded Google Forms).
- **`declarativeNetRequest`:** Required solely to modify the `Origin` HTTP request header for loopback addresses (`127.0.0.1` and `localhost`). This allows the extension to communicate with local on-device servers such as macOS Apple Intelligence (`fm serve`) and local Ollama without being blocked by local cross-site request forgery (CSRF) protections. It does not monitor, intercept, or modify web traffic on any public websites.
- **Host Permissions:** To communicate directly with the AI endpoints (`api.mistral.ai`, `generativelanguage.googleapis.com`, local endpoints, etc.) and inject solver scripts into web forms.

---

### 4. Data Security
Because all personal configuration remains stored inside your browser's secure sandboxed storage, your data remains entirely within your control. You can clear all stored data at any time by clicking "Reset Extension" in the extension popup or by uninstalling the extension.

---

### 5. Changes to this Policy
We may update this Privacy Policy from time to time to reflect changes in our practices or legal obligations. Any updates will be published on this repository page.

---

### 6. Contact
If you have any questions or feedback regarding this Privacy Policy, please reach out via GitHub or email at kuldeepsisodiya@gmail.com.
