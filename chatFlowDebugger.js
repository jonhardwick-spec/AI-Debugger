(function() {
  // Config
  const KEEP_COUNT = 5;
  const DEBOUNCE_MS = 100;
  let debugSite = true;
  let debugPlugin = true;
  let messageHistory = [];
  let debugLogs = [];
  let lastLogTime = 0;
  let chatContainer = null;
  let observer = null;
  let isActive = false;

  // Fancy logging
  function log(type, ...args) {
    if (!isActive) return;
    const now = Date.now();
    if (now - lastLogTime < DEBOUNCE_MS) return;
    lastLogTime = now;
    const timestamp = new Date(now).toISOString().split('T')[1].slice(0, -1);
    const prefix = `${type.padEnd(7, ' ')} | ${timestamp} |`;
    const msg = `${prefix} ${args.join(' ')}`;
    console.log(`%c${msg}`, `color: ${type === '[Site]' ? '#0ff' : '#f0f'}; background: #222; padding: 2px 4px; border-radius: 2px;`);
    debugLogs.push(msg);
  }

  function logSite(...args) {
    if (debugSite) log('[Site]', ...args);
  }

  function logPlugin(...args) {
    if (debugPlugin) log('[Plugin]', ...args);
  }

  // Detailed element logger
  function logElement(el, label = 'Element', indent = '') {
    const tag = el.tagName.toLowerCase();
    const id = el.id || 'None';
    const classes = Array.from(el.classList).join(', ') || 'None';
    const attrs = Array.from(el.attributes)
      .map(a => `${a.name}=${a.value.slice(0, 20)}${a.value.length > 20 ? '...' : ''}`)
      .join(', ') || 'None';
    const text = el.textContent.trim().slice(0, 50) + (el.textContent.length > 50 ? '...' : '') || 'None';
    const styles = getComputedStyle(el);
    const keyStyles = `display: ${styles.display}, position: ${styles.position}, visibility: ${styles.visibility}`;
    const depth = getElementDepth(el);
    const title = el.title || el.getAttribute('aria-label') || 'None';

    logSite(`${indent}${label}: ${tag}${id !== 'None' ? `#${id}` : ''}`);
    logSite(`${indent}  Classes: ${classes}`);
    logSite(`${indent}  Attributes: ${attrs}`);
    logSite(`${indent}  Text: ${text}`);
    logSite(`${indent}  Title/Aria: ${title}`);
    logSite(`${indent}  Styles: ${keyStyles}`);
    logSite(`${indent}  Depth: ${depth}`);
  }

  // Find chat elements
  function findChatElements() {
    const selectors = {
      windows: ['body', '[role="dialog"]', '[class*="window"]', '[id*="window"]'],
      containers: ['.max-w-3xl', '.conversation', '.chat-container', '.chat-box', '.chat-thread', '[class*="chat"]', '[class*="conversation"]'],
      messages: ['.message-row', '.message', '.chat-message', '.msg', '.chat-entry', '[class*="message"]'],
      boxes: ['input', 'textarea', '[contenteditable]', '[class*="input"]', '[class*="box"]', '[id*="input"]'],
      users: ['[class*="user"]', '[class*="human"]', '[class*="end"]', '[id*="user"]'],
      buttons: ['button', '[type="button"]', '[type="submit"]', '[class*="btn"]', '[class*="button"]', '[role="button"]']
    };

    const elements = {};
    for (const [type, selList] of Object.entries(selectors)) {
      elements[type] = [];
      selList.forEach(sel => {
        Array.from(document.querySelectorAll(sel)).forEach(el => {
          if (!elements[type].some(e => e.element === el)) {
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

    chatContainer = elements.containers[0]?.element || document.body;
    logPlugin(`Chat container set to: ${chatContainer.tagName}${chatContainer.id ? `#${chatContainer.id}` : ''}`);
    return elements;
  }

  // Track messages
  function trackMessages(elements) {
    const messages = elements.messages.map(m => m.element);
    const newMessages = messages.slice(-KEEP_COUNT);

    newMessages.forEach((msg, index) => {
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
      const timestamp = Date.now();

      const messageData = {
        text,
        tag,
        classes,
        id,
        attributes,
        parentTag,
        parentClasses,
        parentId,
        isUser,
        isAI,
        depth,
        timestamp
      };

      if (!messageHistory.some(m => m.text === text && m.timestamp === messageData.timestamp)) {
        messageHistory.push(messageData);
        if (messageHistory.length > KEEP_COUNT) messageHistory.shift();
        logSite(`--- Message ${index + 1} ---`);
        logSite(`Text: ${text}`);
        logSite(`Tag: ${tag}, ID: ${id}, Classes: ${classes}`);
        logSite(`Attributes: ${attributes}`);
        logSite(`Parent: ${parentTag}, ID: ${parentId}, Classes: ${parentClasses}`);
        logSite(`Role: ${isUser ? 'User' : isAI ? 'AI' : 'Unknown'}, Depth: ${depth}`);
        logSite(`Timing: ${timestamp - (messageHistory[messageHistory.length - 2]?.timestamp || timestamp)}ms since last`);
      }
    });

    logPlugin(`Tracking ${newMessages.length} messages, history: ${messageHistory.length}, total elements: ${messages.length}`);
  }

  // Element depth
  function getElementDepth(el) {
    let depth = 0;
    let current = el;
    while (current.parentElement) {
      depth++;
      current = current.parentElement;
    }
    return depth;
  }

  // Toggle button
  function injectToggleButton() {
    if (document.getElementById('chat-debug-toggle')) return;
    const button = document.createElement('button');
    button.id = 'chat-debug-toggle';
    button.textContent = 'Debug';
    button.style.cssText = `
      position: fixed; top: 10px; left: 10px; z-index: 9999; 
      width: 40px; height: 40px; border-radius: 50%; 
      background: ${isActive ? '#0f0' : '#f00'}; color: #fff; 
      border: none; cursor: pointer; font-size: 12px; text-align: center;
    `;
    document.body.appendChild(button);

    button.addEventListener('click', () => {
      isActive = !isActive;
      button.style.background = isActive ? '#0f0' : '#f00';
      if (isActive) initDebugger();
      else if (observer) observer.disconnect();
      console.log(`Chat Flow Debugger ${isActive ? 'activated' : 'deactivated'}`);
    });
  }

  // GUI
  function injectDebugGUI() {
    if (document.getElementById('chat-debug-gui')) return;
    const gui = document.createElement('div');
    gui.id = 'chat-debug-gui';
    gui.style.cssText = `
      position: fixed; bottom: 10px; right: 10px; background: #000; color: #fff; 
      padding: 8px; border-radius: 4px; z-index: 9999; font-size: 12px; width: 320px;
    `;
    gui.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px;">Chat Flow Debugger</div>
      <label><input type="checkbox" id="debug-site" ${debugSite ? 'checked' : ''}> Site</label>
      <label><input type="checkbox" id="debug-plugin" ${debugPlugin ? 'checked' : ''}> Plugin</label>
      <button id="copy-logs" style="background: #000; border: 1px solid #f00; color: #fff; padding: 2px 4px; margin: 0 4px;">Copy Logs</button>
      <button id="copy-history" style="background: #000; border: 1px solid #0f0; color: #fff; padding: 2px 4px;">Copy History</button>
      <div id="stats" style="margin-top: 4px;"></div>
    `;
    document.body.appendChild(gui);

    document.getElementById('debug-site').addEventListener('change', (e) => {
      debugSite = e.target.checked;
      chrome.storage.sync.set({ debugSite });
      logSite(`Site debug ${debugSite ? 'on' : 'off'}`);
    });
    document.getElementById('debug-plugin').addEventListener('change', (e) => {
      debugPlugin = e.target.checked;
      chrome.storage.sync.set({ debugPlugin });
      logPlugin(`Plugin debug ${debugPlugin ? 'on' : 'off'}`);
    });
    document.getElementById('copy-logs').addEventListener('click', () => {
      navigator.clipboard.writeText(debugLogs.join('\n'))
        .then(() => logPlugin('Logs copied to clipboard'))
        .catch(err => logPlugin(`Copy logs failed: ${err}`));
    });
    document.getElementById('copy-history').addEventListener('click', () => {
      const historyText = messageHistory.map(m => 
        `---\nText: ${m.text}\nTag: ${m.tag}, ID: ${m.id}, Classes: ${m.classes}\nAttributes: ${m.attributes}\nParent: ${m.parentTag}, ID: ${m.parentId}, Classes: ${m.parentClasses}\nRole: ${m.isUser ? 'User' : m.isAI ? 'AI' : 'Unknown'}\nDepth: ${m.depth}, Time: ${m.timestamp}`
      ).join('\n');
      navigator.clipboard.writeText(historyText)
        .then(() => logPlugin('History copied to clipboard'))
        .catch(err => logPlugin(`Copy history failed: ${err}`));
    });

    setInterval(updateStats, 1000);
  }

  function updateStats() {
    const stats = document.getElementById('stats');
    if (stats) {
      stats.textContent = `Logs: ${debugLogs.length} | History: ${messageHistory.length} | Uptime: ${Math.round(performance.now()/1000)}s`;
    }
  }

  // Core debugger
  function initDebugger() {
    logPlugin('Activating Chat Flow Debugger');
    const elements = findChatElements();
    injectDebugGUI();
    trackMessages(elements);

    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
      requestIdleCallback(() => {
        mutations.forEach(m => {
          const added = Array.from(m.addedNodes).filter(n => n.nodeType === 1);
          const removed = Array.from(m.removedNodes).filter(n => n.nodeType === 1);
          logSite(`--- Mutation ---`);
          logSite(`Type: ${m.type}, Target: ${m.target.tagName.toLowerCase()}#${m.target.id || 'no-id'}`);
          added.forEach((n, i) => logElement(n, `Added ${i + 1}`, '  '));
          removed.forEach((n, i) => logElement(n, `Removed ${i + 1}`, '  '));
        });
        const updatedElements = findChatElements();
        trackMessages(updatedElements);
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    logPlugin('Observer started on document');

    window.addEventListener('resize', () => logSite(`Window resized: ${window.innerWidth}x${window.innerHeight}, DevicePixelRatio: ${window.devicePixelRatio}`));
    window.addEventListener('scroll', () => logSite(`Window scrolled: top=${window.scrollY}, left=${window.scrollX}`));
    window.addEventListener('load', () => logSite(`Window fully loaded: ${document.readyState}`));
    document.addEventListener('input', (e) => logElement(e.target, 'Input Event Target'));
    document.addEventListener('click', (e) => logElement(e.target, 'Click Event Target'));
    document.addEventListener('keydown', (e) => logSite(`Keydown: ${e.key}, Code: ${e.code}, Ctrl: ${e.ctrlKey}, Alt: ${e.altKey}`));
    document.addEventListener('mouseover', (e) => logElement(e.target, 'Mouseover Target', '  '));
    window.onerror = (msg, url, line) => logPlugin(`Global error: ${msg} at ${url}:${line}`);

    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      logSite(`Fetch request: ${args[0]}, Method: ${args[1]?.method || 'GET'}`);
      return originalFetch.apply(this, args).then(res => {
        logSite(`Fetch response: ${args[0]}, Status: ${res.status}`);
        return res;
      });
    };
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      logSite(`XHR request: ${method} ${url}`);
      originalXHROpen.apply(this, arguments);
    };

    setInterval(() => {
      const newElements = findChatElements();
      if (newElements.containers[0]?.element !== chatContainer) {
        logPlugin('Chat container changed, re-tracking');
        chatContainer = newElements.containers[0]?.element || document.body;
        trackMessages(newElements);
      }
    }, 5000);
  }

  // Startup
  chrome.storage.sync.get(['debugSite', 'debugPlugin'], (data) => {
    debugSite = data.debugSite !== undefined ? data.debugSite : true;
    debugPlugin = data.debugPlugin !== undefined ? data.debugPlugin : true;
    injectToggleButton();
    console.log('[Chat Flow Debugger] Loaded, click the top-left button to toggle');
  });
})();