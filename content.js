// Content Script - Form Parsing and Autofilling Logic

console.log('AutoFillAI: Content script loaded.');

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fill_profile') {
    handleFillProfile()
      .then(result => sendResponse(result))
      .catch(err => {
        console.error('Error filling profile:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep channel open
  }
  
  if (message.action === 'solve_questions') {
    handleSolveQuestions()
      .then(result => sendResponse(result))
      .catch(err => {
        console.error('Error solving questions:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep channel open
  }

  if (message.action === 'clear_form') {
    handleClearForm()
      .then(result => sendResponse(result))
      .catch(err => {
        console.error('Error clearing form:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep channel open
  }
});

// --- Action 1: Fill Profile Details ---
async function handleFillProfile() {
  const settings = await chrome.storage.local.get(['name', 'enrollment', 'custom_fields']);
  const name = settings.name || '';
  const enrollment = settings.enrollment || '';
  const customFields = settings.custom_fields || [];

  let filledCount = 0;

  // Build target fields list
  const targets = [];
  if (name) targets.push({ keys: ['name', 'fullname', 'full name', 'first name', 'lastname', 'last name'], value: name });
  if (enrollment) targets.push({ keys: ['enrollment', 'enrolment', 'roll', 'rollno', 'roll number', 'student id', 'id number', 'reg', 'registration'], value: enrollment });
  
  customFields.forEach(field => {
    if (field.key && field.value) {
      targets.push({ keys: [field.key.toLowerCase()], value: field.value });
    }
  });

  // 1. Fill standard HTML inputs
  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="radio"]):not([type="checkbox"]), textarea');
  inputs.forEach(input => {
    // Find best match by attributes
    const match = findBestFieldMatch(input, targets);
    if (match) {
      setValueAndTriggerEvents(input, match.value);
      filledCount++;
    }
  });

  // 2. Fill Google Forms specific text inputs
  if (isGoogleForm()) {
    const gfTextInputs = document.querySelectorAll('.whsOnd, .KH3N7c');
    gfTextInputs.forEach(input => {
      const match = findBestFieldMatch(input, targets);
      if (match) {
        setValueAndTriggerEvents(input, match.value);
        filledCount++;
      }
    });
  }

  return { success: true, filledCount };
}

// Find matching target config for a given input element
function findBestFieldMatch(input, targets) {
  const id = (input.id || '').toLowerCase();
  const name = (input.name || '').toLowerCase();
  const placeholder = (input.placeholder || '').toLowerCase();
  const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
  
  // Search labels associated with this input
  let labelText = '';
  if (input.id) {
    try {
      const labelEl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (labelEl) labelText = labelEl.textContent.toLowerCase();
    } catch (e) {
      console.warn('AutoFillAI: Error querying label for ID:', input.id, e);
    }
  }
  if (!labelText) {
    const parentLabel = input.closest('label');
    if (parentLabel) labelText = parentLabel.textContent.toLowerCase();
  }

  // Check parent container headers for context
  const parentContainer = input.closest('.form-group, .M7eJec, .geS5qb, .Qr7Oae');
  let containerText = '';
  if (parentContainer) {
    const header = parentContainer.querySelector('h1, h2, h3, h4, label, .M7eJec, .ssbdfc');
    if (header) containerText = header.textContent.toLowerCase();
  }

  // Score match quality
  for (const target of targets) {
    for (const key of target.keys) {
      const regex = new RegExp(`\\b${escapeRegExp(key)}\\b|${escapeRegExp(key)}`, 'i');
      if (
        regex.test(id) || 
        regex.test(name) || 
        regex.test(placeholder) || 
        regex.test(ariaLabel) || 
        regex.test(labelText) ||
        (containerText && regex.test(containerText))
      ) {
        return target;
      }
    }
  }
  return null;
}

// --- Action 2: Solve Form Questions Using Gemini AI ---
async function handleSolveQuestions() {
  const settings = await chrome.storage.local.get(['model', 'instructions', 'name', 'enrollment', 'custom_fields']);
  const model = settings.model || 'gemini-2.5-flash';
  const instructions = settings.instructions || '';
  
  const profileContext = {
    name: settings.name || '',
    enrollment: settings.enrollment || '',
    customFields: settings.custom_fields || []
  };

  // 1. Scrape the page for questions
  const parsedQuestions = parsePageQuestions();
  
  if (parsedQuestions.length === 0) {
    throw new Error('No questions or form fields detected on this page.');
  }

  // Remove elements array from data sent to background to prevent serialization error
  const apiPayloadQuestions = parsedQuestions.map(q => ({
    id: q.id,
    text: q.text,
    type: q.type,
    options: q.options
  }));

  console.log('AutoFillAI: Solving all questions together for full context:', apiPayloadQuestions);

  // Report solving status to popup
  try {
    chrome.runtime.sendMessage({
      action: 'solve_progress',
      statusText: 'Solving...',
      detailText: 'AI is analyzing the full quiz context...'
    }).catch(() => {});
  } catch(e) {}

  // 2. Query API via background script
  const apiResponse = await chrome.runtime.sendMessage({
    action: 'call_gemini_api',
    payload: {
      questions: apiPayloadQuestions,
      model: model,
      instructions: instructions,
      profile: profileContext
    }
  });

  if (!apiResponse || !apiResponse.success) {
    throw new Error(apiResponse?.error || 'Failed to communicate with AI solver service worker.');
  }

  console.log('AutoFillAI: Received all answers:', apiResponse.answers);

  // 3. Fill the answers back into DOM one-by-one with a smooth delay
  let filledCount = 0;
  
  for (let i = 0; i < apiResponse.answers.length; i++) {
    const answer = apiResponse.answers[i];
    const matchedQuestion = parsedQuestions.find(q => q.id === answer.questionId);
    if (!matchedQuestion) continue;

    // Report progress to popup
    try {
      chrome.runtime.sendMessage({
        action: 'solve_progress',
        statusText: `Filling ${i + 1}/${apiResponse.answers.length}...`,
        detailText: matchedQuestion.text
      }).catch(() => {});
    } catch(e) {}

    const fillSuccess = fillQuestionAnswer(matchedQuestion, answer);
    if (fillSuccess) {
      filledCount++;
    }

    // Add a 200ms delay to make the filling animation smooth and visible
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return { success: true, filledCount };
}

// Scrape page for inputs and structure them as questions
// Scrape page for inputs and structure them as questions (unified accessibility-first parser)
function parsePageQuestions() {
  const questions = [];
  
  // 1. Gather all interactive inputs (native + custom roles)
  const elements = Array.from(document.querySelectorAll(
    'input, textarea, select, [role="radio"], [role="checkbox"], [role="listbox"], [role="combobox"], [role="textbox"]'
  ));
  
  // Filter out elements we don't want to fill (buttons, hidden inputs, etc.)
  const interactiveElements = elements.filter(el => {
    const tagName = el.tagName.toLowerCase();
    
    // Skip hidden/button inputs
    if (tagName === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (
        type === 'hidden' || type === 'submit' || type === 'button' ||
        type === 'reset' || type === 'image' || type === 'file'
      ) {
        return false;
      }
    }
    
    // Skip standard buttons
    if (tagName === 'button') return false;
    
    // Skip hidden elements or display none
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    
    return true;
  });

  // Track which elements have been processed to avoid double processing
  const processedElements = new Set();
  
  // Helper to get text from aria-labelledby
  function getAriaLabelledByText(el) {
    const ids = el.getAttribute('aria-labelledby');
    if (!ids) return '';
    return ids.split(/\s+/)
      .map(id => document.getElementById(id))
      .filter(target => target !== null)
      .map(target => target.textContent.trim())
      .filter(text => text.length > 0)
      .join(' ');
  }

  // Helper to find question container
  function getQuestionContainer(el) {
    return el.closest('[role="listitem"], [role="group"], fieldset, .Qr7Oae, .form-group, div[class*="question"], div[class*="group"]');
  }

  let questionIndex = 0;

  // Process all interactive elements
  interactiveElements.forEach(el => {
    if (processedElements.has(el)) return;

    const tagName = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || '';
    const typeAttr = el.getAttribute('type') || '';
    
    const isRadio = (tagName === 'input' && typeAttr === 'radio') || role === 'radio';
    const isCheckbox = (tagName === 'input' && typeAttr === 'checkbox') || role === 'checkbox';

    // A. Handle Radio Groups
    if (isRadio) {
      // Find all radios in the same group
      let groupRadios = [];
      const container = getQuestionContainer(el);
      
      if (tagName === 'input' && el.name) {
        // Native radio group by name
        groupRadios = Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`));
      } else if (container) {
        // Prefer custom ARIA radios if present to avoid duplicate option elements (e.g. native hidden inputs)
        const customRadios = Array.from(container.querySelectorAll('[role="radio"]'));
        if (customRadios.length > 0) {
          groupRadios = customRadios;
        } else {
          groupRadios = Array.from(container.querySelectorAll('input[type="radio"]'));
        }
      } else {
        groupRadios = [el];
      }

      // Filter group radios to only interactive ones
      groupRadios = groupRadios.filter(radio => interactiveElements.includes(radio));

      // Mark all as processed
      groupRadios.forEach(radio => processedElements.add(radio));

      if (groupRadios.length > 0) {
        // Get question text
        let questionText = '';
        if (container) {
          questionText = getAriaLabelledByText(container);
          if (!questionText) {
            // Find a header inside the container
            const header = container.querySelector('h1, h2, h3, h4, [role="heading"], legend, .M7eJec');
            if (header) questionText = header.textContent.trim();
          }
        }
        
        if (!questionText) {
          questionText = getAriaLabelledByText(groupRadios[0]) || findElementQuestionLabel(groupRadios[0], true);
        }
        
        // Remove trailing * from required fields
        questionText = questionText.replace(/\s*\*$/, '').trim();

        // Extract option label texts
        const options = groupRadios.map(radio => {
          let label = radio.getAttribute('aria-label') || '';
          if (!label) {
            label = getAriaLabelledByText(radio);
          }
          if (!label) {
            label = getOptionLabelText(radio);
          }
          return label ? label.trim() : 'Option';
        });

        questions.push({
          id: `q-radio-${questionIndex++}`,
          text: questionText || 'Select an option',
          type: 'radio',
          options: options,
          elements: groupRadios
        });
      }
      return;
    }

    // B. Handle Checkbox Groups
    if (isCheckbox) {
      let groupCheckboxes = [];
      const container = getQuestionContainer(el);
      
      if (tagName === 'input' && el.name && el.name !== 'single-checkbox') {
        groupCheckboxes = Array.from(document.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(el.name)}"]`));
      } else if (container) {
        // Prefer custom ARIA checkboxes if present to avoid duplicates (e.g. native hidden inputs)
        const customCheckboxes = Array.from(container.querySelectorAll('[role="checkbox"]'));
        if (customCheckboxes.length > 0) {
          groupCheckboxes = customCheckboxes;
        } else {
          groupCheckboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
        }
      } else {
        groupCheckboxes = [el];
      }

      groupCheckboxes = groupCheckboxes.filter(cb => interactiveElements.includes(cb));
      groupCheckboxes.forEach(cb => processedElements.add(cb));

      if (groupCheckboxes.length > 0) {
        if (groupCheckboxes.length === 1) {
          // Single standalone checkbox
          const cb = groupCheckboxes[0];
          let questionText = getAriaLabelledByText(cb) || getOptionLabelText(cb) || findElementQuestionLabel(cb, false);
          questionText = questionText.replace(/\s*\*$/, '').trim();
          
          questions.push({
            id: `q-checkbox-single-${questionIndex++}`,
            text: questionText,
            type: 'checkbox',
            options: ['Yes/Agree'],
            elements: [cb]
          });
        } else {
          // Multi checkbox group
          let questionText = '';
          if (container) {
            questionText = getAriaLabelledByText(container);
            if (!questionText) {
              const header = container.querySelector('h1, h2, h3, h4, [role="heading"], legend, .M7eJec');
              if (header) questionText = header.textContent.trim();
            }
          }
          
          if (!questionText) {
            questionText = getAriaLabelledByText(groupCheckboxes[0]) || findElementQuestionLabel(groupCheckboxes[0], true);
          }
          
          questionText = questionText.replace(/\s*\*$/, '').trim();

          const options = groupCheckboxes.map(cb => {
            let label = cb.getAttribute('aria-label') || '';
            if (!label) label = getAriaLabelledByText(cb);
            if (!label) label = getOptionLabelText(cb);
            return label ? label.trim() : 'Option';
          });

          questions.push({
            id: `q-checkbox-group-${questionIndex++}`,
            text: questionText || 'Select options',
            type: 'checkbox',
            options: options,
            elements: groupCheckboxes
          });
        }
      }
      return;
    }

    // C. Handle Dropdowns / Selects
    const isSelect = tagName === 'select' || role === 'listbox' || role === 'combobox';
    if (isSelect) {
      processedElements.add(el);
      
      let questionText = getAriaLabelledByText(el);
      const container = getQuestionContainer(el);
      
      if (!questionText && container) {
        const header = container.querySelector('h1, h2, h3, h4, [role="heading"], legend, .M7eJec');
        if (header) questionText = header.textContent.trim();
      }
      
      if (!questionText) {
        questionText = findElementQuestionLabel(el, false);
      }
      
      questionText = questionText.replace(/\s*\*$/, '').trim();

      // Retrieve options
      let options = [];
      if (tagName === 'select') {
        options = Array.from(el.options).map(opt => opt.text.trim());
      } else {
        const optionEls = container ? container.querySelectorAll('[role="option"]') : [];
        if (optionEls.length > 0) {
          options = Array.from(optionEls).map(opt => opt.textContent.trim());
        } else {
          options = ['Yes', 'No']; // generic fallback
        }
      }

      questions.push({
        id: `q-select-${questionIndex++}`,
        text: questionText || 'Select option',
        type: el.multiple ? 'select-multiple' : 'select-one',
        options: options,
        elements: [el]
      });
      return;
    }

    // D. Handle Text Inputs / Textareas / Textbox roles
    processedElements.add(el);
    
    let questionText = getAriaLabelledByText(el) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
    const container = getQuestionContainer(el);
    
    if (!questionText && container) {
      const header = container.querySelector('h1, h2, h3, h4, [role="heading"], legend, .M7eJec');
      if (header) questionText = header.textContent.trim();
    }
    
    if (!questionText) {
      questionText = findElementQuestionLabel(el, false);
    }
    
    questionText = questionText.replace(/\s*\*$/, '').trim();

    questions.push({
      id: `q-text-${questionIndex++}`,
      text: questionText || 'Fill text',
      type: tagName === 'textarea' ? 'textarea' : 'text',
      options: [],
      elements: [el]
    });
  });

  return questions;
}

// Find label text associated with standard inputs
function findElementQuestionLabel(element, isOptionGroup = false) {
  // 1. Check for label element pointing to element ID
  if (element.id) {
    try {
      const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (label) return label.textContent.trim();
    } catch (e) {
      console.warn('AutoFillAI: Error querying label for ID:', element.id, e);
    }
  }

  // 2. Check parent element label wrapper
  const parentLabel = element.closest('label');
  if (parentLabel) {
    // Return parent text, excluding element's own label
    return parentLabel.textContent.replace(element.textContent || '', '').trim();
  }

  // 3. If it's a radio/checkbox group, find the parent container header text
  if (isOptionGroup) {
    const container = element.closest('fieldset, form, div[class*="group"], div[class*="container"]');
    if (container) {
      const legend = container.querySelector('legend, h1, h2, h3, h4, h5, .group-label, label');
      if (legend) return legend.textContent.trim();
    }
  }

  // 4. Walk up and look for sibling headers or text nodes
  let parent = element.parentElement;
  for (let i = 0; i < 3 && parent; i++) {
    const labelSibling = parent.querySelector('h1, h2, h3, h4, h5, label, p, span, div');
    if (labelSibling && labelSibling !== element && labelSibling.textContent.trim().length > 3) {
      return labelSibling.textContent.trim();
    }
    parent = parent.parentElement;
  }

  // Fallbacks
  return element.name || element.placeholder || 'Question';
}

// Helper to find specific option label for radio/checkbox inputs
function getOptionLabelText(input) {
  if (input.id) {
    try {
      const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (label) return label.textContent.trim();
    } catch (e) {
      console.warn('AutoFillAI: Error querying label for ID:', input.id, e);
    }
  }
  const parentLabel = input.closest('label');
  if (parentLabel) return parentLabel.textContent.trim();
  
  if (input.nextSibling && input.nextSibling.nodeType === Node.TEXT_NODE) {
    return input.nextSibling.textContent.trim();
  }
  if (input.nextElementSibling) {
    return input.nextElementSibling.textContent.trim();
  }
  return input.value || 'Option';
}

// Fill parsed answers into DOM elements
function fillQuestionAnswer(question, answer) {
  if (!question.elements || question.elements.length === 0) return false;

  const elements = question.elements;
  const indices = answer.selectedIndices || [];

  if (question.type === 'text' || question.type === 'textarea') {
    if (answer.answerText) {
      setValueAndTriggerEvents(elements[0], answer.answerText);
      return true;
    }
  }

  if (question.type === 'radio') {
    const index = indices.length > 0 ? indices[0] : 0;
    const el = elements[index];
    if (el) {
      if (el.tagName && el.tagName.toLowerCase() === 'input') {
        el.checked = true;
        el.click();
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // Custom interactive element (e.g. role="radio" div)
        el.click();
      }
      return true;
    }
  }

  if (question.type === 'checkbox') {
    if (indices.length > 0) {
      indices.forEach(index => {
        const el = elements[index];
        if (el) {
          if (el.tagName && el.tagName.toLowerCase() === 'input') {
            if (!el.checked) {
              el.checked = true;
              el.click();
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          } else {
            // Custom interactive checkbox (e.g. role="checkbox" div)
            const isChecked = el.getAttribute('aria-checked') === 'true';
            if (!isChecked) el.click();
          }
        }
      });
      return true;
    }
  }

  if (question.type === 'select-one') {
    const index = indices.length > 0 ? indices[0] : 0;
    const select = elements[0];
    
    if (select.tagName && select.tagName.toLowerCase() === 'select') {
      if (select.options && select.options[index]) {
        select.selectedIndex = index;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    } else {
      // Custom dropdown/listbox click simulation
      select.click();
      setTimeout(() => {
        const options = document.querySelectorAll('[role="option"], .quantumWizMenuPaperselectOption');
        if (options && options[index]) {
          options[index].click();
        }
      }, 300);
      return true;
    }
  }

  return false;
}

// --- Action 3: Clear Form Elements ---
async function handleClearForm() {
  let cleared = 0;

  // 1. Clear text inputs
  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea');
  inputs.forEach(input => {
    if (input.type === 'radio' || input.type === 'checkbox') {
      input.checked = false;
    } else {
      input.value = '';
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    cleared++;
  });

  // 2. Clear Google Forms custom elements
  if (isGoogleForm()) {
    // Uncheck Google Forms radios/checkboxes
    const gfCheckables = document.querySelectorAll('[role="radio"][aria-checked="true"], [role="checkbox"][aria-checked="true"]');
    gfCheckables.forEach(el => {
      el.click(); // clicks to toggle/uncheck
      cleared++;
    });
  }

  return { success: true, clearedCount: cleared };
}

// Utility: Check if page is Google Forms
function isGoogleForm() {
  return window.location.hostname.includes('docs.google.com') && window.location.pathname.includes('/forms/');
}

// Utility: Set value and fire events for framework input synchronization (React/Vue support)
function setValueAndTriggerEvents(element, value) {
  const lastValue = element.value;
  element.value = value;
  
  // React-specific state update tracking bypass
  const tracker = element._valueTracker;
  if (tracker) {
    tracker.setValue(lastValue);
  }
  
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

// Utility: Helper to escape regex special chars
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
