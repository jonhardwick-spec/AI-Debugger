(function() {
  console.log('[Data Flow Debugger] Script loaded—starting up!');

  const KEEP_COUNT = 5;
  const DEBOUNCE_MS = 50;
  let debugSite = true;
  let debugNetwork = true;
  let debugTrimmer = true;
  let messageHistory = [];
  let debugLogs = [];
  let lastLogTime = 0;
  let isActive = false;
  let startTime = 0;
  let observer = null;
  let guiListeners = [];
  let consoleVisible = true;

  function log(type, ...args) {
    if (!isActive) return;
    const now = Date.now();
    if (now - lastLogTime < DEBOUNCE_MS) return;
    lastLogTime = now;
    const timestamp = new Date(now).toISOString();
    const prefix = `${type.padEnd(10)} | ${timestamp} |`;
    const msg = `${prefix} ${args.join(' ')}`;
    debugLogs.push({ type, text: msg, timestamp: now });
    updateConsole();
  }

  function logSite(...args) {
    if (debugSite) log('[Site]', ...args);
  }

  function logNetwork(...args) {
    if (debugNetwork) log('[Network]', ...args);
  }

  function logTrimmer(...args) {
    if (debugTrimmer) log('[Trimmer]', ...args);
  }

  function logPlugin(...args) {
    log('[Plugin]', ...args);
  }

  function logElement(el, label = 'Element', indent = '') {
    if (!el || !el.tagName || el.nodeType !== 1) {
      logSite(`${indent}--- ${label} --- Skipped: Invalid or non-element node`);
      return;
    }
    const now = Date.now();
    const tag = el.tagName.toLowerCase();
    const id = el.id || 'None';
    const classes = Array.from(el.classList).join(', ') || 'None';
    const attrs = Array.from(el.attributes)
      .map(a => `${a.name}=${a.value.slice(0, 20)}${a.value.length > 20 ? '...' : ''}`)
      .join(', ') || 'None';
    const text = el.textContent.trim().slice(0, 50) + (el.textContent.length > 50 ? '...' : '') || 'None';
    const styles = getComputedStyle(el);
    const keyStyles = `display: ${styles.display}, pos: ${styles.position}, vis: ${styles.visibility}, bg: ${styles.backgroundColor}, color: ${styles.color}`;
    const rect = el.getBoundingClientRect();
    const bounds = `x: ${rect.x.toFixed(1)}, y: ${rect.y.toFixed(1)}, w: ${rect.width.toFixed(1)}, h: ${rect.height.toFixed(1)}`;
    const depth = getElementDepth(el);
    const title = el.title || el.getAttribute('aria-label') || 'None';
    const parent = el.parentElement ? `${el.parentElement.tagName.toLowerCase()}#${el.parentElement.id || 'no-id'}` : 'None';
    const children = Array.from(el.children).map(c => c.tagName.toLowerCase()).join(', ') || 'None';
    const listeners = getEventListeners(el);
    const events = Object.keys(listeners).join(', ') || 'None';

    logSite(`${indent}--- ${label} ---`);
    logSite(`${indent}Timestamp: ${new Date(now).toISOString()}`);
    logSite(`${indent}Tag: ${tag}, ID: ${id}`);
    logSite(`${indent}Classes: ${classes}`);
    logSite(`${indent}Attributes: ${attrs}`);
    logSite(`${indent}Text: ${text}`);
    logSite(`${indent}Title/Aria: ${title}`);
    logSite(`${indent}Styles: ${keyStyles}`);
    logSite(`${indent}Bounds: ${bounds}`);
    logSite(`${indent}Depth: ${depth}`);
    logSite(`${indent}Parent: ${parent}`);
    logSite(`${indent}Children: ${children}`);
    logSite(`${indent}Events: ${events}`);
  }

  function getEventListeners(el) {
    return window.getEventListeners ? window.getEventListeners(el) : {};
  }

  function updateConsole() {
    const consoleDiv = document.getElementById('data-debug-console');
    if (!consoleDiv) return;
    consoleDiv.style.display = consoleVisible ? 'flex' : 'none';
    consoleDiv.innerHTML = debugLogs.map(log => {
      const color = log.type === '[Site]' ? '#0ff' : log.type === '[Network]' ? '#0f0' : log.type === '[Trimmer]' ? '#ff0' : '#f0f';
      return `<div style="color: ${color}; padding: 2px 0; white-space: pre-wrap;">${log.text}</div>`;
    }).join('');
    requestAnimationFrame(() => consoleDiv.scrollTop = 0);
  }

  function findDataElements() {
    const selectors = {
      windows: ['body', '[role="dialog"]', '[class*="window"]', '[id*="window"]'],
      containers: ['.max-w-3xl', '.conversation', '.chat-container', '.chat-box', '.chat-thread', '[class*="chat"]', '[class*="conversation"]', '[class*="data"]'],
      messages: ['.message-row', '.message', '.chat-message', '.msg', '.chat-entry', '[class*="message"]', '[class*="data"]'],
      inputs: ['input', 'textarea', '[contenteditable]', '[class*="input"]', '[class*="box"]', '[id*="input"]'],
      interactables: ['[class*="user"]', '[class*="human"]', '[class*="end"]', '[id*="user"]', 'a', 'button', '[role="button"]', '[type="button"]', '[type="submit"]', '[class*="btn"]'],
      network: ['script', 'link', 'img', 'iframe']
    };

    const elements = {};
    for (const [type, selList] of Object.entries(selectors)) {
      elements[type] = [];
      selList.forEach(sel => {
        Array.from(document.querySelectorAll(sel)).forEach(el => {
          if (el.nodeType === 1 && !elements[type].some(e => e.element === el)) {
            elements[type].push({
              element: el,
              tag: el.tagName.toLowerCase(),
              id: el.id,
              classes: Array.from(el.classList),
              attributes: Array.from(el.attributes),
              depth: getElementDepth(el)
            });
          }
        });
      });
      if (elements[type].length > 0) {
        logPlugin(`Found ${type}: ${elements[type].length} elements`);
        elements[type].forEach((el, i) => logElement(el.element, `${type} ${i + 1}`, '  '));
      }
    }
    return elements;
  }

  function trackMessages(elements) {
    const messages = elements.messages.map(m => m.element).filter(el => el && el.nodeType === 1);
    const newMessages = messages.slice(-KEEP_COUNT);

    newMessages.forEach((msg, index) => {
      const now = Date.now();
      const text = msg.textContent.trim().slice(0, 50) + (msg.textContent.length > 50 ? '...' : '');
      const tag = msg.tagName.toLowerCase();
      const classes = Array.from(msg.classList).join(', ') || 'None';
      const id = msg.id || 'None';
      const attributes = Array.from(msg.attributes)
        .map(attr => `${attr.name}=${attr.value.slice(0, 20)}${attr.value.length > 20 ? '...' : ''}`)
        .join(', ') || 'None';
      const parentTag = msg.parentElement?.tagName.toLowerCase() || 'None';
      const parentClasses = msg.parentElement ? Array.from(msg.parentElement.classList).join(', ') : 'None';
      const parentId = msg.parentElement?.id || 'None';
      const isUser = classes.includes('user') || parentClasses.includes('user') || classes.includes('end') || parentClasses.includes('end');
      const isAI = classes.includes('bot') || classes.includes('ai') || classes.includes('start') || parentClasses.includes('start') || classes.includes('assistant');
      const depth = getElementDepth(msg);

      const messageData = { text, tag, classes, id, attributes, parentTag, parentClasses, parentId, isUser, isAI, depth, timestamp: now };

      if (!messageHistory.some(m => m.text === text && m.timestamp === messageData.timestamp)) {
        messageHistory.push(messageData);
        if (messageHistory.length > KEEP_COUNT) messageHistory.shift();
        logElement(msg, `Message ${index + 1}`);
        logSite(`  Role: ${isUser ? 'User' : isAI ? 'AI' : 'Unknown'}, Timing: ${now - (messageHistory[messageHistory.length - 2]?.timestamp || now)}ms since last`);
      }
    });

    logPlugin(`Tracking ${newMessages.length} messages, history: ${messageHistory.length}, total elements: ${messages.length}`);
  }

  function debugChatTrimmer() {
    const trimmer = window['ChatTrimmer'] || {};
    const now = Date.now();
    logTrimmer(`--- Trimmer State (Passive) ---`);
    logTrimmer(`Timestamp: ${new Date(now).toISOString()}`);
    logTrimmer(`Enabled: ${trimmer.isEnabled || 'N/A'}`);
    logTrimmer(`KeepCrashed: ${trimmer.keepCrashed || 'N/A'}`);
    logTrimmer(`DebugMode: ${trimmer.debugMode || 'N/A'}`);
    logTrimmer(`ActiveJugs: ${trimmer.activeJugs?.length || 0}`);
    logTrimmer(`CrashedJugs: ${trimmer.crashedJugsCompressed?.length || 0}`);
    logTrimmer(`Container: ${trimmer.chatContainer ? trimmer.chatContainer.tagName + (trimmer.chatContainer.id ? `#${trimmer.chatContainer.id}` : '') : 'None'}`);
    logTrimmer(`LastTrim: ${trimmer.lastCrashTime ? new Date(trimmer.lastCrashTime).toISOString() : 'Never'}`);
  }

  function getElementDepth(el) {
    let depth = 0;
    let current = el;
    while (current && current.parentElement) {
      depth++;
      current = current.parentElement;
    }
    return depth;
  }

  function injectDebugGUI() {
    if (document.getElementById('data-debug-gui')) return;
    console.log('[Debugger] Injecting GUI');
    const gui = document.createElement('div');
    gui.id = 'data-debug-gui';
    gui.style.cssText = `
      position: fixed; bottom: 10px; right: 10px; z-index: 99999 !important; 
      background: #000; color: #fff; padding: 8px; border-radius: 4px; 
      font-size: 12px; width: 380px; max-height: 80vh; 
      box-shadow: 0 0 10px rgba(0,0,0,0.5); display: flex; flex-direction: column;
    `;
    gui.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px; padding: 4px; background: #111; border-radius: 2px;">Data Flow Debugger</div>
      <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
        <label><input type="checkbox" id="debug-site" ${debugSite ? 'checked' : ''}> Site</label>
        <label><input type="checkbox" id="debug-network" ${debugNetwork ? 'checked' : ''}> Network</label>
        <label><input type="checkbox" id="debug-trimmer" ${debugTrimmer ? 'checked' : ''}> Trimmer</label>
        <button id="debug-toggle" style="background: ${isActive ? '#f00' : '#0f0'}; border: none; color: #fff; padding: 2px 4px;">${isActive ? 'Stop Debug' : 'Debug'}</button>
        <button id="console-toggle" style="background: #000; border: 1px solid #00f; color: #fff; padding: 2px 4px;">${consoleVisible ? 'Hide Console' : 'Show Console'}</button>
        <button id="copy-logs" style="background: #000; border: 1px solid #f00; color: #fff; padding: 2px 4px;">Copy Logs</button>
        <button id="copy-history" style="background: #000; border: 1px solid #0f0; color: #fff; padding: 2px 4px;">Copy History</button>
        <button id="delete-data" style="background: #000; border: 1px solid #ff0; color: #fff; padding: 2px 4px;">Delete</button>
      </div>
      <div id="data-debug-console" style="flex: 1; max-height: ${window.innerHeight * 2 / 3}px; overflow-y: auto; display: ${consoleVisible ? 'flex' : 'none'}; flex-direction: column;"></div>
      <div id="stats" style="margin-top: 8px; padding: 4px; background: #111; border-radius: 2px;"></div>
    `;
    document.body.appendChild(gui);
    console.log('[Debugger] GUI injected');

    // Bind listeners after injection
    const addListener = (id, event, handler) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener(event, (e) => {
          console.log(`[Debugger] ${id} clicked`);
          handler(e);
        });
        guiListeners.push({ element, event, handler });
      } else {
        console.log(`[Debugger] Element #${id} not found`);
      }
    };

    addListener('debug-toggle', 'click', () => {
      isActive = !isActive;
      const toggleButton = document.getElementById('debug-toggle');
      toggleButton.textContent = isActive ? 'Stop Debug' : 'Debug';
      toggleButton.style.background = isActive ? '#f00' : '#0f0';
      if (isActive) {
        startTime = Date.now();
        initDebugger();
      } else {
        cleanupDebugger();
      }
      logPlugin(`Data Flow Debugger ${isActive ? 'started' : 'stopped'}`);
      updateStats();
    });
    addListener('console-toggle', 'click', () => {
      consoleVisible = !consoleVisible;
      const toggleButton = document.getElementById('console-toggle');
      toggleButton.textContent = consoleVisible ? 'Hide Console' : 'Show Console';
      updateConsole();
      logPlugin(`Console ${consoleVisible ? 'shown' : 'hidden'}`);
    });
    addListener('debug-site', 'change', (e) => {
      debugSite = e.target.checked;
      if (chrome.storage) chrome.storage.sync.set({ debugSite });
      logSite(`Site debug ${debugSite ? 'on' : 'off'}`);
    });
    addListener('debug-network', 'change', (e) => {
      debugNetwork = e.target.checked;
      if (chrome.storage) chrome.storage.sync.set({ debugNetwork });
      logNetwork(`Network debug ${debugNetwork ? 'on' : 'off'}`);
    });
    addListener('debug-trimmer', 'change', (e) => {
      debugTrimmer = e.target.checked;
      if (chrome.storage) chrome.storage.sync.set({ debugTrimmer });
      logTrimmer(`Trimmer debug ${debugTrimmer ? 'on' : 'off'}`);
    });
    addListener('copy-logs', 'click', () => {
      navigator.clipboard.writeText(debugLogs.map(l => l.text).join('\n'))
        .then(() => logPlugin('Logs copied to clipboard'))
        .catch(err => logPlugin(`Copy logs failed: ${err}`));
    });
    addListener('copy-history', 'click', () => {
      const historyText = messageHistory.map(m => 
        `---\nTimestamp: ${new Date(m.timestamp).toISOString()}\nText: ${m.text}\nTag: ${m.tag}, ID: ${m.id}, Classes: ${m.classes}\nAttributes: ${m.attributes}\nParent: ${m.parentTag}, ID: ${m.parentId}, Classes: ${m.parentClasses}\nRole: ${m.isUser ? 'User' : m.isAI ? 'AI' : 'Unknown'}\nDepth: ${m.depth}`
      ).join('\n');
      navigator.clipboard.writeText(historyText)
        .then(() => logPlugin('History copied to clipboard'))
        .catch(err => logPlugin(`Copy history failed: ${err}`));
    });
    addListener('delete-data', 'click', () => {
      debugLogs = [];
      messageHistory = [];
      startTime = 0;
      logPlugin('Data and history deleted');
      updateStats();
      updateConsole();
    });
  }

  function updateStats() {
    const stats = document.getElementById('stats');
    if (stats) {
      const uptime = isActive && startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
      stats.textContent = `Logs: ${debugLogs.length} | History: ${messageHistory.length} | Uptime: ${uptime}s`;
    }
  }

  function cleanupDebugger() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    startTime = 0; // Reset uptime, keep logs/history
    guiListeners.forEach(({ element, event, handler }) => {
      if (element && element.removeEventListener) element.removeEventListener(event, handler);
    });
    guiListeners = [];
    logPlugin('Debugger stopped—logs preserved');
  }

  function initDebugger() {
    logPlugin('Starting Data Flow Debugger');
    const elements = findDataElements();
    trackMessages(elements);
    debugChatTrimmer();

    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
      requestIdleCallback(() => {
        if (!isActive) return;
        mutations.forEach(m => {
          const now = Date.now();
          const added = Array.from(m.addedNodes).filter(n => n.nodeType === 1);
          const removed = Array.from(m.removedNodes).filter(n => n.nodeType === 1);
          logSite(`--- Mutation ---`);
          logSite(`Timestamp: ${new Date(now).toISOString()}`);
          logSite(`Type: ${m.type}, Target: ${m.target.tagName ? m.target.tagName.toLowerCase() : 'Unknown'}#${m.target.id || 'no-id'}`);
          logSite(`Attribute Changed: ${m.attributeName || 'N/A'}, Old Value: ${m.oldValue || 'N/A'}`);
          added.forEach((n, i) => logElement(n, `Added ${i + 1}`, '  '));
          removed.forEach((n, i) => logElement(n, `Removed ${i + 1}`, '  '));
        });
        const updatedElements = findDataElements();
        trackMessages(updatedElements);
        debugChatTrimmer();
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true, attributeOldValue: true });
    logPlugin('Observer started on document');

    window.addEventListener('resize', () => logSite(`Window resized: ${window.innerWidth}x${window.innerHeight}, DevicePixelRatio: ${window.devicePixelRatio}`));
    window.addEventListener('scroll', () => logSite(`Window scrolled: top=${window.scrollY}, left=${window.scrollX}`));
    window.addEventListener('load', () => logSite(`Window fully loaded: ${document.readyState}`));
    document.addEventListener('input', (e) => {
      logElement(e.target, 'Input Event Target');
      logSite(`  Current Value: ${e.target.value || e.target.textContent || 'N/A'}`);
    });
    document.addEventListener('click', (e) => logElement(e.target, 'Click Event Target'));
    document.addEventListener('keydown', (e) => logSite(`Keydown: ${e.key}, Code: ${e.code}, Ctrl: ${e.ctrlKey}, Alt: ${e.altKey}`));
    document.addEventListener('mouseover', (e) => logElement(e.target, 'Mouseover Target', '  '));
    document.addEventListener('focus', (e) => logElement(e.target, 'Focus Event Target'));
    document.addEventListener('blur', (e) => logElement(e.target, 'Blur Event Target'));
    window.onerror = (msg, url, line, col, error) => logPlugin(`Global error: ${msg} at ${url}:${line}:${col}, Stack: ${error?.stack || 'N/A'}`);

    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const now = Date.now();
      logNetwork(`--- Fetch Request ---`);
      logNetwork(`Timestamp: ${new Date(now).toISOString()}`);
      logNetwork(`URL: ${args[0]}, Method: ${args[1]?.method || 'GET'}`);
      logNetwork(`Headers: ${JSON.stringify(args[1]?.headers || {})}`);
      const start = performance.now();
      return originalFetch.apply(this, args).then(res => {
        const end = performance.now();
        logNetwork(`--- Fetch Response ---`);
        logNetwork(`Timestamp: ${new Date(end).toISOString()}`);
        logNetwork(`URL: ${args[0]}, Status: ${res.status}, Latency: ${Math.round(end - start)}ms`);
        return res;
      });
    };
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      logNetwork(`--- XHR Request ---`);
      logNetwork(`Timestamp: ${new Date().toISOString()}`);
      logNetwork(`Method: ${method}, URL: ${url}`);
      originalXHROpen.apply(this, arguments);
    };
    const originalXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
      logNetwork(`  Body: ${body?.slice(0, 50) || 'N/A'}${body?.length > 50 ? '...' : ''}`);
      originalXHRSend.apply(this, arguments);
    };

    window.addEventListener('beforeunload', () => logNetwork(`Page unloading: ${document.location.href}`));
    logNetwork(`Page started: ${document.location.href}`);

    setInterval(() => {
      if (!isActive) return;
      const newElements = findDataElements();
      trackMessages(newElements);
      debugChatTrimmer();
    }, 5000);
  }

  function ensureGUI() {
    if (!document.body) {
      setTimeout(ensureGUI, 100);
      return;
    }
    injectDebugGUI();
    if (chrome.storage) {
      chrome.storage.sync.get(['debugSite', 'debugNetwork', 'debugTrimmer'], (data) => {
        debugSite = data.debugSite !== undefined ? data.debugSite : true;
        debugNetwork = data.debugNetwork !== undefined ? data.debugNetwork : true;
        debugTrimmer = data.debugTrimmer !== undefined ? data.debugTrimmer : true;
      });
    }
  }

  ensureGUI();
})();