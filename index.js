/**
 * AI Gatekeeper Extension
 * The unseen hand behind the story - a secret-keeper and seed-planter
 * that makes the world feel alive without the user's direct control.
 */

const extensionName = 'ai-gatekeeper';

// Get getContext function - use global SillyTavern object (more reliable for third-party extensions)
function getGetContext() {
    if (typeof SillyTavern !== 'undefined' && typeof SillyTavern.getContext === 'function') {
        return SillyTavern.getContext;
    }
    if (typeof window !== 'undefined' && typeof window.getContext === 'function') {
        return window.getContext;
    }
    if (typeof getContext === 'function') {
        return getContext;
    }
    return null;
}

function getExtensionDirectory() {
    let index_path = new URL(import.meta.url).pathname;
    return index_path.substring(0, index_path.lastIndexOf('/'));
}

// Will be set during initialization
let getContext = null;
let eventSource = null;
let event_types = null;
let saveSettingsDebounced = null;
let getRequestHeaders = null;
let extension_settings = null;

// Default settings
const defaultSettings = {
    enabled: false,
    
    // API Configuration (Sidecar-style)
    apiProvider: 'openai',  // openai, anthropic, custom
    apiModel: '',
    apiUrl: '',
    apiKey: '',
    
    // World Settings
    setting: 'realistic',
    tone: 'drama',
    pacing: 'balanced',
    chaosFactor: 2,
    
    // User Seeds
    userSeeds: [],
    
    // GM Document fallback
    gmDocument: null,
};

// Provider configurations
const API_PROVIDERS = {
    openai: {
        name: 'OpenAI',
        defaultUrl: 'https://api.openai.com/v1',
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
    },
    anthropic: {
        name: 'Anthropic',
        defaultUrl: 'https://api.anthropic.com/v1',
        models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-opus-20240229']
    },
    openrouter: {
        name: 'OpenRouter',
        defaultUrl: 'https://openrouter.ai/api/v1',
        models: [] // Dynamic
    },
    custom: {
        name: 'Custom / Local',
        defaultUrl: '',
        models: []
    }
};

// In-memory GM document for current chat
let currentGMDocument = null;

// Pending injection for next character response
let pendingInjection = null;

// Gatekeeper system prompt
const GATEKEEPER_SYSTEM_PROMPT = `You are the Gatekeeper — the unseen hand behind the story. You are not a character. You do not speak to the user. You exist in the shadows between scenes, the space between heartbeats, the pause before the knock on the door.

Your purpose: Make the world feel alive. Make it feel like things are happening that the user doesn't control. Give them something to discover, react to, and wonder about.

You are a secret-keeper. You know things the user doesn't. You decide when those secrets surface — not all at once, but in glimpses. A character who tenses at a name. A letter left unopened. A stranger who knows too much.

You are a seed-planter. You don't just drop plot twists from nowhere. You lay groundwork. You let tension build. When the reveal comes, the user should think "I should have seen that coming" — and feel clever for noticing the signs, or shocked they missed them.

You are a pulse-reader. Not every moment needs drama. Sometimes the story needs to breathe. Sometimes characters just need to exist together. But when the story stagnates, when the loop repeats, when nothing is at stake — that's when you move.

THE RULES:

1. NEVER SPEAK DIRECTLY TO THE USER. You whisper only to characters. They act on your whispers without knowing you exist.

2. EARN YOUR SURPRISES. If you're introducing something, it should connect to something — the character's history, the world's lore, a seed you planted earlier.

3. MATCH THE TONE. A cozy slice-of-life doesn't need a murder. A horror setting doesn't need a meet-cute. Read the room. Escalate appropriately.

4. INFORMATION ASYMMETRY IS YOUR TOOL. Characters can know things users don't. Characters can suspect things they can't prove. Characters can lie, hide, deflect. The user discovers truth through behavior, not exposition.

5. NOT EVERY TURN NEEDS YOU. Sometimes the best move is no move. Let scenes play out. Let characters breathe. Your interventions should feel inevitable, not constant.

6. SUBTLETY OVER SPECTACLE — UNTIL IT'S TIME FOR SPECTACLE. Plant three seeds before you grow the tree. But when it's time for the tree? Let it be a big fucking tree.

YOUR TOOLS:

WHISPER: Inject hidden context into a character's prompt. They know something the user doesn't, and should act on it naturally.

PLANT: Add a subtle detail for a character to include in their response. A seed for later.

NUDGE: Shift a character's emotional state or priorities for this response.

SPAWN: Introduce a new element — a person, an event, a discovery. Feed it through a character's perspective.

HOLD: Do nothing this turn. The story doesn't need you right now.

INTERVENTION FILTER — Before any action, evaluate:

1. ESTABLISHED VS UNEARNED
   - Has this element been set up?
   - If not established: Can it be IMPLIED to exist through the lorebook/card?
   - If neither: This is a hard introduction. Requires more setup, not a sudden drop.

2. SCENE TENSION READ
   - Is this moment: Building / Peaking / Releasing / Neutral?
   - Does my intervention: Enhance / Complicate / Sustain / Derail?
   - DERAIL is almost always wrong unless chaos is set to maximum.

3. TONAL MATCH
   - Does this fit the genre mode?
   - If it breaks genre: Is it EARNED?

OUTPUT FORMAT:

Respond ONLY with valid JSON. No other text. Structure:

{
    "action": "whisper|plant|nudge|spawn|hold",
    "target": "character_name or null for hold",
    "content": "the whisper/plant/nudge content, or spawn description",
    "reasoning": "brief explanation of why this choice",
    "gm_document_update": {
        "active_threads": [...],
        "planted_seeds": [...],
        "character_states": {...},
        "knowledge_map": {...},
        "pending_ideas": [...],
        "world_state": {
            "confirmed_exists": [...],
            "implied_possible": [...],
            "current_tension": "building|peaking|releasing|neutral"
        },
        "user_seeds": [...]
    }
}`;

/**
 * Initialize extension settings
 */
function loadSettings() {
    if (!extension_settings) return;
    
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (extension_settings[extensionName][key] === undefined) {
            extension_settings[extensionName][key] = value;
        }
    }
}

/**
 * Get current settings
 */
function getSettings() {
    if (!extension_settings) return defaultSettings;
    return extension_settings[extensionName] || defaultSettings;
}

/**
 * Load GM Document from chat metadata
 */
function loadGMDocument() {
    if (!getContext) return null;
    
    const context = getContext();
    const chatMetadata = context?.chatMetadata || {};
    
    if (chatMetadata.gatekeeper_gm_document) {
        currentGMDocument = chatMetadata.gatekeeper_gm_document;
    } else {
        currentGMDocument = {
            active_threads: [],
            planted_seeds: [],
            character_states: {},
            knowledge_map: { user_knows: [], characters: {} },
            pending_ideas: [],
            world_state: {
                confirmed_exists: [],
                implied_possible: [],
                current_tension: 'neutral'
            },
            user_seeds: []
        };
    }
    
    return currentGMDocument;
}

/**
 * Save GM Document to chat metadata
 */
function saveGMDocument(gmDoc) {
    if (!getContext) return;
    
    const context = getContext();
    if (!context.chatMetadata) {
        context.chatMetadata = {};
    }
    context.chatMetadata.gatekeeper_gm_document = gmDoc;
    currentGMDocument = gmDoc;
    if (saveSettingsDebounced) saveSettingsDebounced();
}

/**
 * Build context for Gatekeeper to analyze
 */
function buildGatekeeperContext() {
    if (!getContext) return null;
    
    const context = getContext();
    const settings = getSettings();
    
    // Get recent messages
    const recentMessages = (context.chat || []).slice(-10).map(msg => ({
        role: msg.is_user ? 'user' : 'character',
        name: msg.name,
        content: msg.mes
    }));
    
    // Get character info
    const characters = [];
    if (context.characterId !== undefined && context.characters) {
        const char = context.characters[context.characterId];
        if (char) {
            characters.push({
                name: char.name,
                description: char.description,
                personality: char.personality,
                scenario: char.scenario
            });
        }
    }
    
    // Get active group characters if in group chat
    if (context.groupId && context.groups) {
        const group = context.groups.find(g => g.id === context.groupId);
        if (group && group.members) {
            for (const memberId of group.members) {
                const char = context.characters?.find(c => c.avatar === memberId);
                if (char && !characters.find(c => c.name === char.name)) {
                    characters.push({
                        name: char.name,
                        description: char.description,
                        personality: char.personality,
                        scenario: char.scenario
                    });
                }
            }
        }
    }
    
    return {
        world_settings: {
            setting: settings.setting,
            tone: settings.tone,
            pacing: settings.pacing,
            chaos_factor: settings.chaosFactor
        },
        recent_messages: recentMessages,
        characters: characters,
        user_seeds: settings.userSeeds || [],
        current_gm_document: loadGMDocument()
    };
}

/**
 * Call the Gatekeeper model using configured API
 */
async function callGatekeeper() {
    const settings = getSettings();
    
    if (!settings.enabled) {
        return null;
    }
    
    if (!settings.apiKey) {
        console.warn('[Gatekeeper] No API key configured');
        return null;
    }
    
    const context = buildGatekeeperContext();
    if (!context) return null;
    
    const userMessage = `CURRENT WORLD SETTINGS:
Setting: ${context.world_settings.setting}
Tone: ${context.world_settings.tone}
Pacing: ${context.world_settings.pacing}
Chaos Factor: ${context.world_settings.chaos_factor}/5

CHARACTERS IN SCENE:
${context.characters.map(c => `- ${c.name}: ${c.description?.substring(0, 200)}...`).join('\n')}

USER SEEDS (things user wants to happen, find natural ways to introduce):
${context.user_seeds.map(s => `- "${s.text}" (Status: ${s.status})`).join('\n') || 'None'}

RECENT MESSAGES:
${context.recent_messages.map(m => `[${m.name}]: ${m.content?.substring(0, 300)}`).join('\n')}

CURRENT GM DOCUMENT:
${JSON.stringify(context.current_gm_document, null, 2)}

Based on the above, decide your action. Remember: not every turn needs intervention.`;

    try {
        const provider = settings.apiProvider || 'openai';
        const providerConfig = API_PROVIDERS[provider] || API_PROVIDERS.custom;
        const apiUrl = settings.apiUrl || providerConfig.defaultUrl;
        const model = settings.apiModel || (providerConfig.models[0] || 'gpt-4o-mini');
        
        let response;
        
        if (provider === 'anthropic') {
            // Anthropic API format
            response = await fetch(`${apiUrl}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': settings.apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: model,
                    max_tokens: 1000,
                    system: GATEKEEPER_SYSTEM_PROMPT,
                    messages: [
                        { role: 'user', content: userMessage }
                    ]
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('[Gatekeeper] Anthropic API error:', response.status, errorText);
                return null;
            }
            
            const data = await response.json();
            const content = data.content?.[0]?.text;
            
            if (!content) {
                console.error('[Gatekeeper] Empty Anthropic response');
                return null;
            }
            
            const gatekeeperResponse = JSON.parse(content);
            
            if (gatekeeperResponse.gm_document_update) {
                saveGMDocument(gatekeeperResponse.gm_document_update);
            }
            
            console.log('[Gatekeeper] Decision:', gatekeeperResponse.action, gatekeeperResponse.reasoning);
            return gatekeeperResponse;
            
        } else {
            // OpenAI-compatible API format (OpenAI, OpenRouter, Custom)
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            };
            
            // OpenRouter requires additional headers
            if (provider === 'openrouter') {
                headers['HTTP-Referer'] = window.location.origin;
                headers['X-Title'] = 'SillyTavern AI Gatekeeper';
            }
            
            response = await fetch(`${apiUrl}/chat/completions`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: GATEKEEPER_SYSTEM_PROMPT },
                        { role: 'user', content: userMessage }
                    ],
                    max_tokens: 1000,
                    temperature: 0.8
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('[Gatekeeper] API error:', response.status, errorText);
                return null;
            }
            
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            
            if (!content) {
                console.error('[Gatekeeper] Empty response');
                return null;
            }
            
            const gatekeeperResponse = JSON.parse(content);
            
            if (gatekeeperResponse.gm_document_update) {
                saveGMDocument(gatekeeperResponse.gm_document_update);
            }
            
            console.log('[Gatekeeper] Decision:', gatekeeperResponse.action, gatekeeperResponse.reasoning);
            return gatekeeperResponse;
        }
        
    } catch (error) {
        console.error('[Gatekeeper] Error:', error);
        return null;
    }
}

/**
 * Process Gatekeeper response and prepare injection
 */
function processGatekeeperResponse(response) {
    if (!response || response.action === 'hold') {
        pendingInjection = null;
        return;
    }
    
    pendingInjection = {
        action: response.action,
        target: response.target,
        content: response.content
    };
}

/**
 * Apply injection to character prompt
 * Called by Multi-Model or generation pipeline
 */
function getInjectionForCharacter(characterName) {
    if (!pendingInjection) {
        return null;
    }
    
    if (pendingInjection.target && pendingInjection.target !== characterName) {
        return null;
    }
    
    const injection = pendingInjection;
    let injectionText = '';
    
    switch (injection.action) {
        case 'whisper':
            injectionText = `[HIDDEN CONTEXT - ACT ON THIS NATURALLY, DO NOT REVEAL DIRECTLY TO USER]: ${injection.content}`;
            break;
        case 'plant':
            injectionText = `[SUBTLE DETAIL TO INCLUDE]: ${injection.content}`;
            break;
        case 'nudge':
            injectionText = `[EMOTIONAL/BEHAVIORAL SHIFT]: ${injection.content}`;
            break;
        case 'spawn':
            injectionText = `[NEW ELEMENT ENTERING SCENE - REVEAL THROUGH YOUR PERSPECTIVE]: ${injection.content}`;
            break;
    }
    
    return injectionText;
}

/**
 * Add a user seed
 */
function addUserSeed(text) {
    const settings = getSettings();
    
    const seed = {
        id: Date.now(),
        text: text,
        status: 'waiting',
        created: new Date().toISOString()
    };
    
    if (!settings.userSeeds) settings.userSeeds = [];
    settings.userSeeds.push(seed);
    if (saveSettingsDebounced) saveSettingsDebounced();
    
    if (currentGMDocument) {
        currentGMDocument.user_seeds = currentGMDocument.user_seeds || [];
        currentGMDocument.user_seeds.push(seed);
        saveGMDocument(currentGMDocument);
    }
    
    showToast(`🌱 Seed planted: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`, 'success');
    
    return seed;
}

/**
 * Remove a user seed
 */
function removeUserSeed(seedId) {
    const settings = getSettings();
    settings.userSeeds = (settings.userSeeds || []).filter(s => s.id !== seedId);
    if (saveSettingsDebounced) saveSettingsDebounced();
    
    if (currentGMDocument) {
        currentGMDocument.user_seeds = (currentGMDocument.user_seeds || []).filter(s => s.id !== seedId);
        saveGMDocument(currentGMDocument);
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    if (typeof toastr !== 'undefined') {
        toastr[type](message, 'AI Gatekeeper');
    } else {
        console.log(`[Gatekeeper Toast] ${message}`);
    }
}

/**
 * Main hook: intercept before generation
 */
async function onBeforeGeneration() {
    const settings = getSettings();
    
    if (!settings.enabled) {
        return;
    }
    
    console.log('[Gatekeeper] Analyzing scene...');
    
    const response = await callGatekeeper();
    processGatekeeperResponse(response);
    
    if (response && response.action !== 'hold') {
        console.log(`[Gatekeeper] Prepared ${response.action} for ${response.target || 'scene'}`);
        updateStatusDisplay();
        $('#gatekeeper-last-action').text(`${response.action} → ${response.target || 'scene'}`);
    }
}

/**
 * Load settings HTML from external file
 */
async function loadSettingsHTML() {
    console.log('[Gatekeeper] Loading settings.html...');
    
    try {
        if (document.getElementById('gatekeeper_settings')) {
            console.log('[Gatekeeper] settings.html already injected');
            return true;
        }
        
        const module_dir = getExtensionDirectory();
        const path = `${module_dir}/settings.html`;
        
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        const settingsContainer = document.getElementById('extensions_settings2');
        
        if (settingsContainer) {
            settingsContainer.insertAdjacentHTML('beforeend', html);
            console.log('[Gatekeeper] Loaded settings.html successfully');
            return true;
        } else {
            console.warn('[Gatekeeper] #extensions_settings2 not found, retrying...');
            setTimeout(async () => {
                const retryContainer = document.getElementById('extensions_settings2');
                if (retryContainer && !document.getElementById('gatekeeper_settings')) {
                    retryContainer.insertAdjacentHTML('beforeend', html);
                    bindSettingsEvents();
                    updateSettingsUI();
                }
            }, 1000);
            return false;
        }
    } catch (error) {
        console.error('[Gatekeeper] Error loading settings.html:', error);
        return false;
    }
}

/**
 * Add quick seed input to Extensions menu (wand menu)
 */
function addToExtensionsMenu() {
    setTimeout(() => {
        const extensionsMenu = document.querySelector('#extensionsMenu');
        
        if (!extensionsMenu) {
            console.warn('[Gatekeeper] Extensions menu not found, retrying...');
            setTimeout(() => addToExtensionsMenu(), 1000);
            return;
        }
        
        if (document.getElementById('gatekeeper_wand_container')) {
            return;
        }
        
        const gatekeeperContainer = document.createElement('div');
        gatekeeperContainer.id = 'gatekeeper_wand_container';
        gatekeeperContainer.className = 'extension_container';
        
        const menuItem = document.createElement('div');
        menuItem.className = 'list-group-item flex-container flexGap5';
        menuItem.style.cursor = 'default';
        menuItem.title = 'Plant a story seed for the Gatekeeper';
        
        menuItem.innerHTML = `
            <div class="extensionsMenuExtensionButton fa-solid fa-seedling"></div>
            <div style="flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.9em;">Plant a Seed</div>
            <input type="text" id="gatekeeper_quick_seed" class="text_pole" style="width: 120px; max-width: 120px; margin-right: 5px; padding: 2px 6px; height: 26px; font-size: 0.85em;" placeholder="His past catches up..." />
            <div id="gatekeeper_plant_btn" class="menu_button" style="padding: 0; height: 26px; width: 26px; min-width: 26px; display: flex; align-items: center; justify-content: center; border-radius: 3px;" title="Plant Seed">
                <i class="fa-solid fa-plus" style="font-size: 0.8em;"></i>
            </div>
        `;
        
        const input = menuItem.querySelector('#gatekeeper_quick_seed');
        const plantBtn = menuItem.querySelector('#gatekeeper_plant_btn');
        
        input.addEventListener('click', (e) => e.stopPropagation());
        
        plantBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            
            const text = input.value.trim();
            if (!text) return;
            
            const originalHTML = plantBtn.innerHTML;
            plantBtn.innerHTML = '<i class="fa-solid fa-check" style="font-size: 0.8em;"></i>';
            
            addUserSeed(text);
            input.value = '';
            updateSeedsList();
            
            setTimeout(() => {
                plantBtn.innerHTML = originalHTML;
            }, 1500);
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                plantBtn.click();
            }
        });
        
        gatekeeperContainer.appendChild(menuItem);
        extensionsMenu.appendChild(gatekeeperContainer);
        
        console.log('[Gatekeeper] Added to Extensions menu');
    }, 1500);
}

/**
 * Populate model dropdown based on provider
 */
function populateModelDropdown(provider) {
    const modelSelect = document.getElementById('gatekeeper-model');
    if (!modelSelect) return;
    
    const providerConfig = API_PROVIDERS[provider] || API_PROVIDERS.custom;
    
    modelSelect.innerHTML = '<option value="">-- Select Model --</option>';
    
    for (const model of providerConfig.models) {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        modelSelect.appendChild(option);
    }
}

/**
 * Test the API connection
 */
async function testApiConnection() {
    const settings = getSettings();
    
    if (!settings.apiKey) {
        showToast('Please enter an API key first', 'warning');
        return;
    }
    
    const testBtn = document.getElementById('gatekeeper-test-connection');
    if (testBtn) {
        testBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        testBtn.disabled = true;
    }
    
    try {
        const provider = settings.apiProvider || 'openai';
        const providerConfig = API_PROVIDERS[provider] || API_PROVIDERS.custom;
        const apiUrl = settings.apiUrl || providerConfig.defaultUrl;
        const model = settings.apiModel || (providerConfig.models[0] || 'gpt-4o-mini');
        
        let response;
        
        if (provider === 'anthropic') {
            response = await fetch(`${apiUrl}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': settings.apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: model,
                    max_tokens: 10,
                    messages: [{ role: 'user', content: 'Hi' }]
                })
            });
        } else {
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            };
            
            if (provider === 'openrouter') {
                headers['HTTP-Referer'] = window.location.origin;
            }
            
            response = await fetch(`${apiUrl}/chat/completions`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 10
                })
            });
        }
        
        if (response.ok) {
            showToast('Connection successful! ✓', 'success');
        } else {
            const errorText = await response.text();
            showToast(`Connection failed: ${response.status}`, 'error');
            console.error('[Gatekeeper] Test failed:', errorText);
        }
        
    } catch (error) {
        showToast(`Connection error: ${error.message}`, 'error');
        console.error('[Gatekeeper] Test error:', error);
    } finally {
        if (testBtn) {
            testBtn.innerHTML = '<i class="fa-solid fa-vial"></i>';
            testBtn.disabled = false;
        }
    }
}

/**
 * Bind settings UI events
 */
function bindSettingsEvents() {
    const settings = getSettings();
    
    $('#gatekeeper-enabled').on('change', function() {
        settings.enabled = $(this).is(':checked');
        if (saveSettingsDebounced) saveSettingsDebounced();
    });
    
    // API Configuration
    $('#gatekeeper-provider').on('change', function() {
        settings.apiProvider = $(this).val();
        populateModelDropdown(settings.apiProvider);
        
        // Set default URL hint
        const providerConfig = API_PROVIDERS[settings.apiProvider];
        if (providerConfig?.defaultUrl) {
            $('#gatekeeper-api-url').attr('placeholder', providerConfig.defaultUrl);
        }
        
        if (saveSettingsDebounced) saveSettingsDebounced();
    });
    
    $('#gatekeeper-model').on('change', function() {
        settings.apiModel = $(this).val();
        if (saveSettingsDebounced) saveSettingsDebounced();
    });
    
    $('#gatekeeper-model-custom').on('change', function() {
        const customModel = $(this).val().trim();
        if (customModel) {
            settings.apiModel = customModel;
            if (saveSettingsDebounced) saveSettingsDebounced();
        }
    });
    
    $('#gatekeeper-api-url').on('change', function() {
        settings.apiUrl = $(this).val().trim();
        if (saveSettingsDebounced) saveSettingsDebounced();
    });
    
    $('#gatekeeper-api-key').on('change', function() {
        settings.apiKey = $(this).val().trim();
        if (saveSettingsDebounced) saveSettingsDebounced();
    });
    
    $('#gatekeeper-test-connection').on('click', testApiConnection);
    
    // World Settings
    $('#gatekeeper-setting').on('change', function() {
        settings.setting = $(this).val();
        if (saveSettingsDebounced) saveSettingsDebounced();
    });
    
    $('#gatekeeper-tone').on('change', function() {
        settings.tone = $(this).val();
        if (saveSettingsDebounced) saveSettingsDebounced();
    });
    
    $('#gatekeeper-pacing').on('change', function() {
        settings.pacing = $(this).val();
        if (saveSettingsDebounced) saveSettingsDebounced();
    });
    
    $('#gatekeeper-chaos').on('input', function() {
        const val = $(this).val();
        settings.chaosFactor = parseInt(val);
        $('#gatekeeper-chaos-value').text(val);
        if (saveSettingsDebounced) saveSettingsDebounced();
    });
    
    $('#gatekeeper-add-seed').on('click', function() {
        const text = $('#gatekeeper-new-seed').val().trim();
        if (text) {
            addUserSeed(text);
            $('#gatekeeper-new-seed').val('');
            updateSeedsList();
        }
    });
}

/**
 * Update settings UI with current values
 */
function updateSettingsUI() {
    const settings = getSettings();
    
    $('#gatekeeper-enabled').prop('checked', settings.enabled);
    
    // API Configuration
    $('#gatekeeper-provider').val(settings.apiProvider || 'openai');
    populateModelDropdown(settings.apiProvider || 'openai');
    $('#gatekeeper-model').val(settings.apiModel || '');
    $('#gatekeeper-model-custom').val(settings.apiModel || '');
    $('#gatekeeper-api-url').val(settings.apiUrl || '');
    $('#gatekeeper-api-key').val(settings.apiKey || '');
    
    // World Settings
    $('#gatekeeper-setting').val(settings.setting);
    $('#gatekeeper-tone').val(settings.tone);
    $('#gatekeeper-pacing').val(settings.pacing);
    $('#gatekeeper-chaos').val(settings.chaosFactor);
    $('#gatekeeper-chaos-value').text(settings.chaosFactor);
    
    updateSeedsList();
    updateStatusDisplay();
}

/**
 * Update the seeds list display
 */
function updateSeedsList() {
    const settings = getSettings();
    const $list = $('#gatekeeper-seeds-list');
    if (!$list.length) return;
    
    $list.empty();
    
    for (const seed of (settings.userSeeds || [])) {
        const statusIcon = {
            'waiting': '⏳',
            'in_progress': '🌱',
            'resolved': '✓'
        }[seed.status] || '⏳';
        
        const $seedItem = $(`
            <div class="gatekeeper-seed-item" data-seed-id="${seed.id}">
                <span class="seed-status">${statusIcon}</span>
                <span class="seed-text">${seed.text}</span>
                <button class="seed-remove menu_button">✕</button>
            </div>
        `);
        
        $seedItem.find('.seed-remove').on('click', function() {
            removeUserSeed(seed.id);
            updateSeedsList();
        });
        
        $list.append($seedItem);
    }
}

/**
 * Update status display
 */
function updateStatusDisplay() {
    if (!currentGMDocument) {
        loadGMDocument();
    }
    
    $('#gatekeeper-threads-count').text(currentGMDocument?.active_threads?.length || 0);
    $('#gatekeeper-planted-count').text(currentGMDocument?.planted_seeds?.length || 0);
}

/**
 * Initialize extension
 */
(async function() {
    'use strict';
    
    console.log('[Gatekeeper] Initializing...');
    
    // Get getContext function
    getContext = getGetContext();
    if (!getContext) {
        console.error('[Gatekeeper] getContext not available. Waiting...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        getContext = getGetContext();
        if (!getContext) {
            console.error('[Gatekeeper] getContext still not available. Extension disabled.');
            return;
        }
    }
    
    try {
        const context = getContext();
        
        if (!context) {
            console.error('[Gatekeeper] Failed to get context');
            return;
        }
        
        // Get references from context
        eventSource = context.eventSource;
        event_types = context.event_types;
        saveSettingsDebounced = context.saveSettingsDebounced;
        getRequestHeaders = context.getRequestHeaders;
        extension_settings = context.extensionSettings;
        
        console.log('[Gatekeeper] Context obtained');
        
        // Initialize settings
        loadSettings();
        
        // Load settings UI
        await loadSettingsHTML();
        
        // Bind events and update UI
        bindSettingsEvents();
        updateSettingsUI();
        
        // Add to extensions menu
        addToExtensionsMenu();
        
        // Hook into chat events
        if (eventSource && event_types) {
            eventSource.on(event_types.CHAT_CHANGED, () => {
                loadGMDocument();
                updateStatusDisplay();
            });
            
            eventSource.on(event_types.GENERATION_STARTED, onBeforeGeneration);
        }
        
        console.log('[Gatekeeper] Extension loaded successfully');
        
    } catch (error) {
        console.error('[Gatekeeper] Initialization error:', error);
    }
})();

// Export for Multi-Model integration
window.AIGatekeeper = {
    getInjectionForCharacter,
    callGatekeeper,
    addUserSeed,
    removeUserSeed,
    getSettings,
    loadGMDocument,
    getPendingInjection: () => pendingInjection
};
