// DOM Elements
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
const statusIndicator = document.getElementById('status-indicator');
const statusText = statusIndicator.querySelector('.status-text');
const footerMessage = document.getElementById('footer-message');

const inputName = document.getElementById('input-name');
const inputEnrollment = document.getElementById('input-enrollment');
const customFieldsList = document.getElementById('custom-fields-list');
const btnAddField = document.getElementById('btn-add-field');

const selectApiProvider = document.getElementById('select-api-provider');
const containerApiUrl = document.getElementById('container-api-url');
const inputApiUrl = document.getElementById('input-api-url');
const labelApiKey = document.getElementById('label-api-key');
const hintApiKey = document.getElementById('hint-api-key');
const inputApiKey = document.getElementById('input-api-key');
const btnTogglePassword = document.getElementById('btn-toggle-password');
const badgeKeysCount = document.getElementById('badge-keys-count');
const linkGetApiKey = document.getElementById('link-get-api-key');
const containerSelectModel = document.getElementById('container-select-model');
const selectModel = document.getElementById('select-model');
const containerInputModel = document.getElementById('container-input-model');
const inputModel = document.getElementById('input-model');
const inputInstructions = document.getElementById('input-instructions');

const btnFillProfile = document.getElementById('btn-fill-profile');
const btnSolveQuestions = document.getElementById('btn-solve-questions');
const btnClearForm = document.getElementById('btn-clear-form');
const btnResetSettings = document.getElementById('btn-reset-settings');

// State Variables
let customFields = [];
let isPasswordMasked = true;

// Utility: Parse multi-line or comma-separated API keys
function parseApiKeys(keyString) {
  if (!keyString) return [];
  return keyString
    .split(/[\r\n,;]+/)
    .map(k => k.trim())
    .filter(k => k.length > 0);
}

// Update the keys count badge in the UI
function updateKeysBadge(activeKeyIndex = 0) {
  if (!badgeKeysCount) return;
  const keys = parseApiKeys(inputApiKey.value);
  if (keys.length === 0) {
    badgeKeysCount.style.display = 'none';
  } else if (keys.length === 1) {
    badgeKeysCount.style.display = 'inline-flex';
    badgeKeysCount.className = 'keys-count-badge single';
    badgeKeysCount.textContent = '1 key active';
    badgeKeysCount.removeAttribute('title');
  } else {
    badgeKeysCount.style.display = 'inline-flex';
    badgeKeysCount.className = 'keys-count-badge multiple';
    const currentActiveNum = (activeKeyIndex % keys.length) + 1;
    badgeKeysCount.textContent = `⚡ ${keys.length} keys (Key #${currentActiveNum} active)`;
    badgeKeysCount.title = 'Automatic failover enabled: rotates to next key if quota or rate limit is hit';
  }
}

// Initialize Extension Popup
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Tab Switching Logic
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(`tab-${targetTab}`).classList.add('active');
    });
  });

  // 2. Password Toggle for API Key Textarea
  btnTogglePassword.addEventListener('click', () => {
    isPasswordMasked = !isPasswordMasked;
    inputApiKey.style.webkitTextSecurity = isPasswordMasked ? 'disc' : 'none';
    btnTogglePassword.querySelector('svg').style.color = isPasswordMasked ? 'var(--text-muted)' : 'var(--accent-cyan)';
    btnTogglePassword.setAttribute('title', isPasswordMasked ? 'Show API keys' : 'Hide API keys');
  });

  // 2b. Tappable link to get API Key (opens new tab in Edge/Chrome)
  if (linkGetApiKey) {
    linkGetApiKey.addEventListener('click', (e) => {
      e.preventDefault();
      const url = linkGetApiKey.href;
      if (chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, '_blank');
      }
    });
  }

  // 3. API Provider Change Logic
  selectApiProvider.addEventListener('change', () => {
    updateApiProviderUI(selectApiProvider.value);
    saveAISettings();
  });

  // 4. Load Saved Settings
  await loadSettings();

  // 5. Save Settings Automatically on Change
  [inputName, inputEnrollment].forEach(input => {
    input.addEventListener('input', debounce(() => saveProfile(), 500));
  });

  inputApiKey.addEventListener('input', () => updateKeysBadge());

  [inputApiKey, selectModel, inputModel, inputApiUrl, inputInstructions].forEach(input => {
    input.addEventListener('input', debounce(() => saveAISettings(), 500));
  });

  // 6. Add Custom Field
  btnAddField.addEventListener('click', () => {
    createCustomFieldRow('', '');
    saveProfile();
  });

  // 7. Action Triggers
  btnFillProfile.addEventListener('click', handleFillProfile);
  btnSolveQuestions.addEventListener('click', handleSolveQuestions);
  btnClearForm.addEventListener('click', handleClearForm);
  btnResetSettings.addEventListener('click', handleResetSettings);
});

// Load Settings from chrome.storage.local
async function loadSettings() {
  try {
    const settings = await chrome.storage.local.get([
      'name', 'enrollment', 'api_key', 'model', 'instructions', 'custom_fields',
      'api_provider', 'api_url', 'custom_model', 'active_key_index'
    ]);

    inputName.value = settings.name || '';
    inputEnrollment.value = settings.enrollment || '';
    inputApiKey.value = settings.api_key || '';
    updateKeysBadge(settings.active_key_index || 0);

    const provider = settings.api_provider || 'mistral';
    selectApiProvider.value = provider;

    let defaultApiUrl = 'https://api.mistral.ai/v1';
    let defaultModel = 'ministral-3b-2512';
    if (provider === 'apple') {
      defaultApiUrl = 'http://127.0.0.1:1976/v1';
      defaultModel = 'system';
    } else if (provider === 'custom') {
      defaultApiUrl = 'https://api.groq.com/openai/v1';
      defaultModel = 'llama-3.1-8b-instant';
    } else if (provider === 'ollama') {
      defaultApiUrl = 'http://localhost:11434/v1';
      defaultModel = 'qwen3:4b';
    }

    inputApiUrl.value = settings.api_url || defaultApiUrl;
    inputModel.value = settings.custom_model || defaultModel;
    selectModel.value = settings.model || 'gemini-2.5-flash';
    inputInstructions.value = settings.instructions || `You are an expert professor in Electronics and Communication Engineering.
Analyze and solve each quiz question based on standard B.Tech ECE curriculum concepts (e.g. mobile networks, cellular communication, signals & systems, embedded systems, microprocessors). 
Be highly accurate, select the most academically correct option, and write precise, correct text answers.`;
    
    updateApiProviderUI(selectApiProvider.value);

    customFieldsList.innerHTML = '';
    customFields = settings.custom_fields || [];
    customFields.forEach(field => {
      createCustomFieldRow(field.key, field.value);
    });
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Error loading configs', 'error');
  }
}

// Toggle UI display depending on Provider (Mistral vs Apple vs Gemini vs Ollama vs Custom)
function updateApiProviderUI(provider) {
  const apiKeyGroup = labelApiKey.closest('.form-group');
  
  if (provider === 'mistral') {
    containerApiUrl.style.display = 'block';
    containerInputModel.style.display = 'block';
    containerSelectModel.style.display = 'none';
    
    if (apiKeyGroup) apiKeyGroup.style.display = 'flex';
    labelApiKey.textContent = 'Mistral API Key';
    hintApiKey.textContent = 'Add multiple keys (1 per line) to auto-switch on token limits';
    inputApiKey.placeholder = 'Enter Mistral API key(s) (1 per line for backup keys)';
    updateKeysBadge();

    if (linkGetApiKey) {
      linkGetApiKey.href = 'https://console.mistral.ai/api-keys/';
      const textSpan = linkGetApiKey.querySelector('span');
      if (textSpan) textSpan.textContent = 'Get Free Mistral API Key';
      linkGetApiKey.style.display = 'inline-flex';
    }
    
    // Prefill Mistral endpoint & model if switching from another provider's defaults
    if (!inputApiUrl.value.trim() || inputApiUrl.value.includes('groq.com') || inputApiUrl.value.includes('localhost') || inputApiUrl.value.includes('127.0.0.1')) {
      inputApiUrl.value = 'https://api.mistral.ai/v1';
    }
    if (!inputModel.value.trim() || inputModel.value === 'llama-3.1-8b-instant' || inputModel.value === 'qwen3:4b' || inputModel.value === 'llama3' || inputModel.value === 'system' || inputModel.value === 'pcc') {
      inputModel.value = 'ministral-3b-2512';
    }
    
    containerApiUrl.querySelector('.field-hint').textContent = 'Mistral base endpoint URL (https://api.mistral.ai/v1)';
    containerInputModel.querySelector('.field-hint').textContent = 'Specify Mistral model ID (e.g. ministral-3b-2512, mistral-small-latest)';
  } else if (provider === 'apple') {
    containerApiUrl.style.display = 'block';
    containerInputModel.style.display = 'block';
    containerSelectModel.style.display = 'none';

    // Apple Foundation Models runs locally on macOS via 'fm serve' without API keys
    if (apiKeyGroup) apiKeyGroup.style.display = 'none';
    if (badgeKeysCount) badgeKeysCount.style.display = 'none';
    if (linkGetApiKey) linkGetApiKey.style.display = 'none';

    // Prefill default Apple FM details
    if (!inputApiUrl.value.trim() || inputApiUrl.value.includes('groq.com') || inputApiUrl.value.includes('mistral.ai') || inputApiUrl.value.includes('localhost:11434')) {
      inputApiUrl.value = 'http://127.0.0.1:1976/v1';
    }
    if (!inputModel.value.trim() || inputModel.value === 'ministral-3b-2512' || inputModel.value === 'llama-3.1-8b-instant' || inputModel.value === 'qwen3:4b') {
      inputModel.value = 'system';
    }

    containerApiUrl.querySelector('.field-hint').textContent = 'Apple fm serve endpoint (e.g. http://127.0.0.1:1976/v1)';
    containerInputModel.querySelector('.field-hint').textContent = 'Apple FM model identifier (default: system, or pcc)';
  } else if (provider === 'ollama') {
    containerApiUrl.style.display = 'block';
    containerInputModel.style.display = 'block';
    containerSelectModel.style.display = 'none';
    
    // Hide API key since Ollama runs locally without keys
    if (apiKeyGroup) apiKeyGroup.style.display = 'none';
    if (badgeKeysCount) badgeKeysCount.style.display = 'none';
    if (linkGetApiKey) linkGetApiKey.style.display = 'none';
    
    // Prefill default Ollama details if empty
    if (!inputApiUrl.value.trim() || inputApiUrl.value.includes('api.openai.com') || inputApiUrl.value.includes('groq.com') || inputApiUrl.value.includes('mistral.ai') || inputApiUrl.value.includes('127.0.0.1:1976')) {
      inputApiUrl.value = 'http://localhost:11434/v1';
    }
    if (!inputModel.value.trim() || inputModel.value.includes('gemini') || inputModel.value === 'llama-3.1-8b-instant' || inputModel.value === 'ministral-3b-2512' || inputModel.value === 'system' || inputModel.value === 'pcc') {
      inputModel.value = 'qwen3:4b';
    }
    
    containerApiUrl.querySelector('.field-hint').textContent = 'Default local Ollama server address';
    containerInputModel.querySelector('.field-hint').textContent = 'Enter your downloaded local model name (e.g., llama3, mistral, phi3)';
  } else if (provider === 'custom') {
    containerApiUrl.style.display = 'block';
    containerInputModel.style.display = 'block';
    containerSelectModel.style.display = 'none';
    
    if (apiKeyGroup) apiKeyGroup.style.display = 'flex';
    labelApiKey.textContent = 'API Key / Token';
    hintApiKey.textContent = 'Add multiple keys (1 per line) to auto-switch on rate limits';
    inputApiKey.placeholder = 'Enter custom/Groq API key(s) (Leave blank if not required)';
    updateKeysBadge();

    if (linkGetApiKey) {
      linkGetApiKey.href = 'https://console.groq.com/keys';
      const textSpan = linkGetApiKey.querySelector('span');
      if (textSpan) textSpan.textContent = 'Get Free Groq API Key';
      linkGetApiKey.style.display = 'inline-flex';
    }
    
    // Prefill default Custom/Groq details if empty or set to local Ollama / Mistral
    if (!inputApiUrl.value.trim() || inputApiUrl.value.includes('localhost') || inputApiUrl.value.includes('127.0.0.1') || inputApiUrl.value.includes('mistral.ai')) {
      inputApiUrl.value = 'https://api.groq.com/openai/v1';
    }
    if (!inputModel.value.trim() || inputModel.value === 'qwen3:4b' || inputModel.value === 'llama3' || inputModel.value === 'ministral-3b-2512' || inputModel.value === 'system' || inputModel.value === 'pcc') {
      inputModel.value = 'llama-3.1-8b-instant';
    }
    
    containerApiUrl.querySelector('.field-hint').textContent = 'The base endpoint URL (e.g. https://api.groq.com/openai/v1 or http://127.0.0.1:1976)';
    containerInputModel.querySelector('.field-hint').textContent = 'Specify the exact model ID for the custom provider';
  } else {
    containerApiUrl.style.display = 'none';
    containerInputModel.style.display = 'none';
    containerSelectModel.style.display = 'block';
    
    if (apiKeyGroup) apiKeyGroup.style.display = 'flex';
    labelApiKey.textContent = 'Gemini API Key';
    hintApiKey.textContent = 'Add multiple keys (1 per line) to auto-switch on quota limits';
    inputApiKey.placeholder = 'Enter Gemini API key(s)';
    updateKeysBadge();

    if (linkGetApiKey) {
      linkGetApiKey.href = 'https://aistudio.google.com/app/apikey';
      const textSpan = linkGetApiKey.querySelector('span');
      if (textSpan) textSpan.textContent = 'Get Free Gemini API Key';
      linkGetApiKey.style.display = 'inline-flex';
    }
  }
}

// Save Profile Config
function saveProfile() {
  const fields = [];
  const rows = customFieldsList.querySelectorAll('.custom-field-row');
  rows.forEach(row => {
    const key = row.querySelector('.field-key').value.trim();
    const value = row.querySelector('.field-val').value.trim();
    if (key || value) {
      fields.push({ key, value });
    }
  });
  customFields = fields;

  chrome.storage.local.set({
    name: inputName.value.trim(),
    enrollment: inputEnrollment.value.trim(),
    custom_fields: customFields
  }, () => {
    showStatus('Profile Saved', 'success');
  });
}

// Save AI Config
function saveAISettings() {
  chrome.storage.local.set({
    api_provider: selectApiProvider.value,
    api_url: inputApiUrl.value.trim(),
    api_key: inputApiKey.value.trim(),
    model: selectModel.value,
    custom_model: inputModel.value.trim(),
    instructions: inputInstructions.value.trim()
  }, () => {
    showStatus('Settings Saved', 'success');
  });
}

// Create Dynamic Custom Field Row
function createCustomFieldRow(key = '', val = '') {
  const row = document.createElement('div');
  row.className = 'custom-field-row';

  const keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.className = 'field-key';
  keyInput.placeholder = 'Label (e.g. Email)';
  keyInput.value = key;
  keyInput.autocomplete = 'off';

  const valInput = document.createElement('input');
  valInput.type = 'text';
  valInput.className = 'field-val';
  valInput.placeholder = 'Value';
  valInput.value = val;
  valInput.autocomplete = 'off';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-remove-field';
  removeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

  row.appendChild(keyInput);
  row.appendChild(valInput);
  row.appendChild(removeBtn);
  customFieldsList.appendChild(row);

  // Attach Event Listeners
  [keyInput, valInput].forEach(input => {
    input.addEventListener('input', debounce(() => saveProfile(), 500));
  });

  removeBtn.addEventListener('click', () => {
    row.remove();
    saveProfile();
  });
}

// Action handlers
async function handleFillProfile() {
  showStatus('Filling profile...', 'loading');
  const response = await sendMessageToActiveTab({ action: 'fill_profile' });
  if (response && response.success) {
    showStatus('Profile Filled', 'success');
    updateFooterMessage(`Successfully filled ${response.filledCount} fields.`);
  } else {
    showStatus('Fill Failed', 'error');
  }
}

async function handleSolveQuestions() {
  // Check if API Key is configured for Gemini or Mistral
  const settings = await chrome.storage.local.get(['api_key', 'api_provider', 'api_url']);
  const provider = settings.api_provider || 'mistral';
  const keys = parseApiKeys(settings.api_key);
  
  if ((provider === 'gemini' || provider === 'mistral') && keys.length === 0) {
    showStatus('API Key Required', 'error');
    updateFooterMessage(`Please enter your ${provider === 'mistral' ? 'Mistral' : 'Gemini'} API Key in AI Settings.`);
    // Switch to Settings tab
    const settingsTabBtn = document.querySelector('.tab-btn[data-tab="ai-settings"]');
    if (settingsTabBtn) settingsTabBtn.click();
    return;
  }

  showStatus('Analyzing Form...', 'loading');
  updateFooterMessage('Extracting questions from page...');
  
  const response = await sendMessageToActiveTab({ action: 'solve_questions' });
  if (response) {
    if (response.success) {
      showStatus('Form Filled', 'success');
      updateFooterMessage(`Solved and filled ${response.filledCount} questions.`);
    } else {
      showStatus('AI Solve Failed', 'error');
      updateFooterMessage(response.error || 'Check extension background logs.');
    }
  }
}

async function handleClearForm() {
  showStatus('Clearing...', 'loading');
  const response = await sendMessageToActiveTab({ action: 'clear_form' });
  if (response && response.success) {
    showStatus('Ready', 'success');
    updateFooterMessage('Form elements cleared.');
  } else {
    showStatus('Clear Failed', 'error');
  }
}

async function handleResetSettings() {
  if (confirm('Are you sure you want to reset all extension storage and inputs?')) {
    await chrome.storage.local.clear();
    await loadSettings();
    showStatus('Reset Done', 'success');
    updateFooterMessage('All configurations reset to defaults.');
  }
}

// Utility: Send message to content script in the active tab (broadcast to all frames)
async function sendMessageToActiveTab(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showStatus('No Tab Found', 'error');
      updateFooterMessage('Navigate to a web page first.');
      return null;
    }
    
    // Check for restricted URLs
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('https://chromewebstore.google.com') || tab.url.startsWith('https://microsoftedge.microsoft.com') || tab.url.startsWith('about:')) {
      showStatus('Protected Page', 'error');
      updateFooterMessage('Extensions cannot run on internal browser system pages.');
      return null;
    }

    // Get all frames in the tab
    const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
    if (!frames || frames.length === 0) {
      // Fallback to sending only to the main frame if webNavigation fails
      const response = await chrome.tabs.sendMessage(tab.id, message);
      return response;
    }

    // Send the message to all frames in parallel and collect promises
    const promises = frames.map(async (frame) => {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, message, { frameId: frame.frameId });
        return response;
      } catch (err) {
        // Catch connection errors for frames that might not have the script injected
        return null;
      }
    });

    const results = await Promise.all(promises);
    
    // Filter out null/undefined results and aggregate
    const activeResults = results.filter(r => r !== null && r !== undefined);
    
    if (activeResults.length === 0) {
      throw new Error('Could not connect to the page. Please refresh the page.');
    }

    // Aggregate successful answers
    const successResponses = activeResults.filter(r => r.success);
    
    if (successResponses.length > 0) {
      let totalFilled = 0;
      let totalCleared = 0;
      successResponses.forEach(r => {
        if (r.filledCount) totalFilled += r.filledCount;
        if (r.clearedCount) totalCleared += r.clearedCount;
      });

      return {
        success: true,
        filledCount: totalFilled,
        clearedCount: totalCleared
      };
    } else {
      // Find if there is a more descriptive error than "No questions..."
      const nonDefaultError = activeResults.find(r => r.error && !r.error.includes('No questions'));
      const errorMsg = nonDefaultError ? nonDefaultError.error : (activeResults[0]?.error || 'No questions or form fields detected.');
      return {
        success: false,
        error: errorMsg
      };
    }

  } catch (error) {
    console.error('Error sending message:', error);
    showStatus('Refresh Page', 'error');
    updateFooterMessage(error.message || 'Click refresh on the page to initialize the scripts.');
    return null;
  }
}

// Utility: Update Status Badge
function showStatus(text, type = 'success') {
  statusIndicator.className = 'status-badge';
  statusIndicator.classList.add(type);
  statusText.textContent = text;
}

// Utility: Update Footer Message
function updateFooterMessage(msg) {
  footerMessage.textContent = msg;
}

// Utility: Debounce for auto-saving
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Listen for progress updates from content.js or background.js
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'solve_progress') {
    showStatus(message.statusText || 'Solving...', 'loading');
    updateFooterMessage(message.detailText || 'Analyzing form...');
    if (message.activeKeyIndex !== undefined) {
      updateKeysBadge(message.activeKeyIndex);
    }
  }
});
