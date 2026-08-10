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

// Handle the API interaction (supports Gemini & Custom OpenAI-compatible endpoints)
async function handleGeminiCall({ questions, model, instructions, profile }) {
  // Retrieve settings
  const storage = await chrome.storage.local.get(['api_key', 'api_provider', 'api_url', 'custom_model']);
  const apiProvider = storage.api_provider || 'gemini';
  const apiKey = storage.api_key;
  const apiBaseUrl = storage.api_url || '';

  // Custom/Ollama providers might not require an API key (e.g. local Ollama server)
  const isCustomOrOllama = apiProvider === 'custom' || apiProvider === 'ollama';
  if (!isCustomOrOllama && !apiKey) {
    throw new Error('API Key is missing. Please set it in the extension popup settings.');
  }

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

  const targetModel = isCustomOrOllama ? (storage.custom_model || model) : (model || 'gemini-2.5-flash');

  // If using local Ollama or custom, process in batches to prevent memory/token crashes
  if (isCustomOrOllama) {
    const batchSize = 5;
    const allAnswers = [];
    
    for (let i = 0; i < questions.length; i += batchSize) {
      const batch = questions.slice(i, i + batchSize);
      console.log(`AutoFillAI: Solving local batch ${Math.floor(i/batchSize) + 1} (${batch.length} questions)`);
      const result = await executeApiRequest({
        questions: batch,
        targetModel,
        apiProvider,
        apiKey,
        apiBaseUrl,
        profileText,
        instructions
      });
      if (result && result.answers) {
        allAnswers.push(...result.answers);
      }
    }
    return { success: true, answers: allAnswers };
  } else {
    // Single request for Gemini (cloud)
    return await executeApiRequest({
      questions,
      targetModel,
      apiProvider,
      apiKey,
      apiBaseUrl,
      profileText,
      instructions
    });
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

  const isCustomOrOllama = apiProvider === 'custom' || apiProvider === 'ollama';

  if (isCustomOrOllama) {
    if (!apiBaseUrl) {
      throw new Error('Custom API Base URL is missing. Please set it in the extension settings.');
    }
    
    url = `${apiBaseUrl.replace(/\/$/, '')}/chat/completions`;
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    payload = {
      model: targetModel,
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
    throw new Error(`API Error: ${apiError}`);
  }

  const result = await response.json();
  
  try {
    let responseText = '';
    if (isCustomOrOllama) {
      responseText = result.choices?.[0]?.message?.content;
      if (!responseText) {
        throw new Error('Custom API returned an empty response.');
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
