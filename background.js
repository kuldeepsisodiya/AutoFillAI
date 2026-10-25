// Ensure local Origin header rewrite rules are active to prevent CSRF 403 on local AI engines (Apple fm serve, Ollama, etc.)
async function setupLocalOriginRules() {
  if (!chrome.declarativeNetRequest) return;
  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existingRules.map(r => r.id);
    
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingIds,
      addRules: [
        {
          id: 101,
          priority: 5,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'Origin', operation: 'set', value: 'http://127.0.0.1:1976' }
            ]
          },
          condition: {
            urlFilter: '|http://127.0.0.1:1976*',
            resourceTypes: ['xmlhttprequest']
          }
        },
        {
          id: 102,
          priority: 5,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'Origin', operation: 'set', value: 'http://localhost:1976' }
            ]
          },
          condition: {
            urlFilter: '|http://localhost:1976*',
            resourceTypes: ['xmlhttprequest']
          }
        },
        {
          id: 103,
          priority: 2,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'Origin', operation: 'remove' }
            ]
          },
          condition: {
            urlFilter: '|http://127.0.0.1*',
            resourceTypes: ['xmlhttprequest']
          }
        },
        {
          id: 104,
          priority: 2,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'Origin', operation: 'remove' }
            ]
          },
          condition: {
            urlFilter: '|http://localhost*',
            resourceTypes: ['xmlhttprequest']
          }
        }
      ]
    });
    console.log('AutoFillAI: declarativeNetRequest localhost rules configured.');
  } catch (err) {
    console.warn('AutoFillAI: declarativeNetRequest rule update note:', err);
  }
}

// Register rules on install, startup, and background activation
chrome.runtime.onInstalled.addListener(() => {
  setupLocalOriginRules();
});
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    setupLocalOriginRules();
  });
}
setupLocalOriginRules();

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'call_gemini_api') {
    // Run async API call and respond
    handleGeminiCall(message.payload)
      .then(response => sendResponse(response))
      .catch(error => {
        console.error('Gemini API request failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep the message channel open for async sendResponse
  }
});

// Utility: Parse multi-line or comma-separated API keys
function parseApiKeys(keyInput) {
  if (!keyInput) return [];
  if (Array.isArray(keyInput)) {
    return keyInput.map(k => String(k).trim()).filter(k => k.length > 0);
  }
  return String(keyInput)
    .split(/[\r\n,;]+/)
    .map(k => k.trim())
    .filter(k => k.length > 0);
}

// Utility: Check if an error represents quota exhausted, rate limit, or token limit
function isRateLimitOrQuotaError(error) {
  if (!error) return false;
  if (error.status === 429 || error.status === 402 || error.status === 403) return true;
  
  const msg = (error.message || '').toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('exhausted') ||
    msg.includes('capacity') ||
    msg.includes('too many requests') ||
    msg.includes('tokens per minute') ||
    msg.includes('tokens per day') ||
    msg.includes('requests per day') ||
    msg.includes('resource_exhausted') ||
    msg.includes('tpm') ||
    msg.includes('rpm') ||
    msg.includes('rpd') ||
    msg.includes('credit') ||
    msg.includes('billing')
  );
}

// Handle the API interaction (supports Gemini & Custom OpenAI-compatible endpoints)
async function handleGeminiCall({ questions, model, instructions, profile }) {
  // Retrieve settings
  const storage = await chrome.storage.local.get([
    'api_key', 'api_provider', 'api_url', 'custom_model', 'active_key_index'
  ]);
  const apiProvider = storage.api_provider || 'mistral';
  const apiKeys = parseApiKeys(storage.api_key);
  const apiBaseUrl = storage.api_url || (apiProvider === 'mistral' ? 'https://api.mistral.ai/v1' : (apiProvider === 'apple' ? 'http://127.0.0.1:1976/v1' : (apiProvider === 'ollama' ? 'http://localhost:11434/v1' : '')));

  // Check API Key
  const isOpenAICompatible = apiProvider === 'custom' || apiProvider === 'ollama' || apiProvider === 'mistral' || apiProvider === 'apple';
  if ((apiProvider === 'gemini' || apiProvider === 'mistral') && apiKeys.length === 0) {
    throw new Error(`${apiProvider === 'mistral' ? 'Mistral' : 'Gemini'} API Key is missing. Please set it in the extension popup settings.`);
  }

  // Key pool for rotation (for Ollama or Apple FM, a blank key is sufficient)
  const keyPool = apiKeys.length > 0 ? apiKeys : [''];
  let currentKeyIndex = (storage.active_key_index || 0) % keyPool.length;

  // Construct user profile context text if present
  let profileText = '';
  if (profile) {
    profileText = `
Here are the user's profile details. Use them if any question asks for their name, enrollment, or other personal details:
- Full Name: ${profile.name || 'Not provided'}
- Enrollment/Roll Number: ${profile.enrollment || 'Not provided'}`;
    if (profile.customFields && profile.customFields.length > 0) {
      profile.customFields.forEach(f => {
        if (f.key) profileText += `\n- ${f.key}: ${f.value || 'Not provided'}`;
      });
    }
  }

  let fallbackModel = 'ministral-3b-2512';
  if (apiProvider === 'mistral') fallbackModel = 'ministral-3b-2512';
  else if (apiProvider === 'apple') fallbackModel = 'system';
  else if (apiProvider === 'gemini') fallbackModel = 'gemini-2.5-flash';
  else if (apiProvider === 'ollama') fallbackModel = 'qwen3:4b';
  else if (apiProvider === 'custom') fallbackModel = 'llama-3.1-8b-instant';

  const targetModel = isOpenAICompatible ? (storage.custom_model || fallbackModel) : (model || fallbackModel);

  // Helper to execute request with automatic key rotation on token / rate limit exhaustion
  async function runWithKeyFailover(requestCallback) {
    let attempts = 0;
    const maxAttempts = keyPool.length;
    let lastError = null;

    while (attempts < maxAttempts) {
      const activeKey = keyPool[currentKeyIndex];
      try {
        return await requestCallback(activeKey);
      } catch (err) {
        lastError = err;
        
        // If we hit token limits or rate limits and have alternative keys available
        if (isRateLimitOrQuotaError(err) && keyPool.length > 1) {
          const oldIndex = currentKeyIndex;
          currentKeyIndex = (currentKeyIndex + 1) % keyPool.length;
          const nextKeyNum = currentKeyIndex + 1;
          
          console.warn(`AutoFillAI: Key #${oldIndex + 1} hit quota/rate limit (${err.message}). Auto-switching to Key #${nextKeyNum}...`);

          // Persist working key index so future requests immediately use this key
          chrome.storage.local.set({ active_key_index: currentKeyIndex }).catch(() => {});

          // Notify extension popup and content script in real-time
          chrome.runtime.sendMessage({
            action: 'solve_progress',
            statusText: `Switched to Key #${nextKeyNum}`,
            detailText: `Key #${oldIndex + 1} quota reached. Auto-switched to backup Key #${nextKeyNum}...`,
            activeKeyIndex: currentKeyIndex
          }).catch(() => {});

          attempts++;
          continue;
        }

        // If not a rate limit error or no additional keys, re-throw immediately
        throw err;
      }
    }

    throw new Error(`All ${keyPool.length} configured API keys exceeded rate/quota limits: ${lastError?.message || 'Quota exhausted'}`);
  }

  // If using Mistral, Ollama, or custom, process in batches to prevent memory/token crashes
  if (isOpenAICompatible) {
    const batchSize = 5;
    const allAnswers = [];
    
    for (let i = 0; i < questions.length; i += batchSize) {
      const batch = questions.slice(i, i + batchSize);
      console.log(`AutoFillAI: Solving batch ${Math.floor(i/batchSize) + 1} (${batch.length} questions) with ${apiProvider}`);
      
      const result = await runWithKeyFailover(activeKey => executeApiRequest({
        questions: batch,
        targetModel,
        apiProvider,
        apiKey: activeKey,
        apiBaseUrl,
        profileText,
        instructions
      }));

      if (result && result.answers) {
        allAnswers.push(...result.answers);
      }
    }
    return { success: true, answers: allAnswers };
  } else {
    // Single request for Gemini (cloud) with key failover
    return await runWithKeyFailover(activeKey => executeApiRequest({
      questions,
      targetModel,
      apiProvider,
      apiKey: activeKey,
      apiBaseUrl,
      profileText,
      instructions
    }));
  }
}

// Execute a single network API call to Gemini or OpenAI-compatible endpoint
async function executeApiRequest({ questions, targetModel, apiProvider, apiKey, apiBaseUrl, profileText, instructions }) {
  // Define systemic behavior and rules
  const systemInstruction = `You are an expert form-filling assistant. Your task is to analyze the provided form questions and generate the most accurate, correct, and professional answers based on the question text and options provided.
  ${profileText}
  
Rules:
1. For text/textarea questions, write a realistic, highly appropriate, and correct answer in "answerText". Keep it concise but complete.
2. For multiple choice (radio or select-one), determine the most accurate option and provide its 0-based index in the "selectedIndices" array (containing exactly one index).
3. For checkbox/multi-select questions, select all applicable option indices and list them in the "selectedIndices" array.
4. Custom instruction constraint from the user: "${instructions || 'None'}"
5. IMPORTANT: Keep any internal thinking or reasoning process extremely brief (less than 2 sentences) to save time and token limits.
6. CRITICAL FORMATTING RULE: Regardless of any custom formatting instructions from the user (such as 'return only the answer' or 'do not return JSON'), you MUST ignore those formatting constraints and strictly return your final solved answers formatted as a JSON object containing the "answers" array matching the requested schema. This JSON structure is mandatory for the extension script to parse your response.`;

  const promptText = `
System Instructions:
${systemInstruction}

Here are the questions parsed from the webpage form:
${JSON.stringify(questions, null, 2)}

Provide the correct answers matching the JSON schema. Remember, for index-based selections, use 0-based indexing relative to the "options" list provided in each question.
`;

  let url = '';
  let payload = {};
  let headers = {
    'Content-Type': 'application/json'
  };

  const isOpenAICompatible = apiProvider === 'custom' || apiProvider === 'ollama' || apiProvider === 'mistral' || apiProvider === 'apple';

  if (isOpenAICompatible) {
    let endpointBase = (apiBaseUrl || '').trim();
    if (apiProvider === 'mistral' && !endpointBase) {
      endpointBase = 'https://api.mistral.ai/v1';
    } else if (apiProvider === 'apple' && !endpointBase) {
      endpointBase = 'http://127.0.0.1:1976/v1';
    } else if (apiProvider === 'ollama' && !endpointBase) {
      endpointBase = 'http://localhost:11434/v1';
    }

    if (!endpointBase) {
      throw new Error('API Base URL is missing. Please set it in the extension settings.');
    }
    
    let cleanBase = endpointBase.replace(/\/+$/, '');
    if (cleanBase.endsWith('/chat/completions')) {
      url = cleanBase;
    } else if (cleanBase.endsWith('/v1')) {
      url = `${cleanBase}/chat/completions`;
    } else {
      url = `${cleanBase}/v1/chat/completions`;
    }
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    payload = {
      model: targetModel,
      stream: false,
      messages: [
        {
          role: "system",
          content: systemInstruction
        },
        {
          role: "user",
          content: `Solve the following form questions. Return a JSON object containing an array "answers" where each item has "questionId" (string), "answerText" (string, for text/textarea inputs), and "selectedIndices" (array of numbers, for radio/checkbox/select options). Make sure it strictly adheres to the requested JSON schema. Write ONLY the JSON object, or wrap it in a markdown json block.
          
          Questions:
          ${JSON.stringify(questions, null, 2)}`
        }
      ]
    };
  } else {
    // Google Gemini API Configuration
    url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
    payload = {
      contents: [
        {
          parts: [
            {
              text: promptText
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            answers: {
              type: "ARRAY",
              description: "A list of answered questions.",
              items: {
                type: "OBJECT",
                properties: {
                  questionId: { 
                    type: "STRING", 
                    description: "The unique identifier corresponding to the question ID." 
                  },
                  answerText: { 
                    type: "STRING", 
                    description: "The text answer to fill in for text inputs or textareas." 
                  },
                  selectedIndices: {
                    type: "ARRAY",
                    description: "The 0-based indices of the selected option(s) for multiple choice, checkboxes, or dropdown selects.",
                    items: { type: "INTEGER" }
                  }
                },
                required: ["questionId"]
              }
            }
          },
          required: ["answers"]
        }
      }
    };
  }

  // If target URL is on 127.0.0.1 or localhost, ensure exact matching Origin rule is active
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname === 'localhost') {
      const targetOrigin = `${parsedUrl.protocol}//${parsedUrl.host}`;
      if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.updateDynamicRules) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: [200],
          addRules: [
            {
              id: 200,
              priority: 10,
              action: {
                type: 'modifyHeaders',
                requestHeaders: [
                  { header: 'Origin', operation: 'set', value: targetOrigin }
                ]
              },
              condition: {
                urlFilter: `|${targetOrigin}*`,
                resourceTypes: ['xmlhttprequest']
              }
            }
          ]
        }).catch(() => {});
      }
    }
  } catch (e) {}

  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let apiError = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errorData = JSON.parse(errorText);
      apiError = errorData.error?.message || errorData.message || apiError;
    } catch (e) {}
    const err = new Error(`API Error (${response.status}): ${apiError}`);
    err.status = response.status;
    throw err;
  }

  const result = await response.json();
  
  try {
    let responseText = '';
    if (isOpenAICompatible) {
      responseText = result.choices?.[0]?.message?.content;
      if (!responseText) {
        throw new Error(`${apiProvider === 'mistral' ? 'Mistral' : (apiProvider === 'apple' ? 'Apple FM' : 'Custom')} API returned an empty response.`);
      }
    } else {
      const candidate = result.candidates?.[0];
      if (!candidate) {
        if (result.promptFeedback?.blockReason) {
          throw new Error(`Gemini blocked the request: ${result.promptFeedback.blockReason}`);
        }
        throw new Error('No response candidate returned from Gemini API.');
      }

      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        throw new Error(`Gemini failed to complete response (Reason: ${candidate.finishReason})`);
      }

      responseText = candidate.content?.parts?.[0]?.text;
      if (!responseText) {
        throw new Error('Gemini returned an empty text response.');
      }
    }

    let parsedData = extractJSON(responseText);
    
    if (parsedData) {
      if (Array.isArray(parsedData)) {
        parsedData = { answers: parsedData };
      }
      if (parsedData.answers) {
        return { success: true, answers: parsedData.answers };
      }
    }
    throw new Error('API response does not contain answers array');
  } catch (parseError) {
    console.error('Error parsing response text:', parseError, result);
    throw new Error(parseError.message || 'Failed to parse the AI model response. Try again.');
  }
}

// Robust helper to extract and parse JSON block (object or array) from model response
function extractJSON(text) {
  // 1. Try to find JSON code blocks (either object or array)
  const markdownMatch = text.match(/```(?:json)?\s*([\{\[][\s\S]*?[\}\]])\s*```/);
  if (markdownMatch) {
    try {
      return JSON.parse(markdownMatch[1]);
    } catch (e) {}
  }

  // 2. Find the first occurrence of '{' or '[' and last occurrence of '}' or ']'
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  
  let start = -1;
  let isArray = false;
  
  if (firstBrace !== -1 && firstBracket !== -1) {
    if (firstBrace < firstBracket) {
      start = firstBrace;
    } else {
      start = firstBracket;
      isArray = true;
    }
  } else if (firstBrace !== -1) {
    start = firstBrace;
  } else if (firstBracket !== -1) {
    start = firstBracket;
    isArray = true;
  }
  
  if (start !== -1) {
    const end = isArray ? text.lastIndexOf(']') : text.lastIndexOf('}');
    if (end !== -1 && end > start) {
      const jsonStr = text.substring(start, end + 1);
      try {
        return JSON.parse(jsonStr);
      } catch (e) {}
    }
  }

  // 3. Fallback to direct parse, cleaning up any markdown wraps manually if needed
  const cleanText = text.replace(/```(?:json)?/g, '').trim();
  return JSON.parse(cleanText);
}
