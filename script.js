document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.querySelector('.chat-input');
    const submitBtn = document.querySelector('.submit-btn');
    const newChatBtn = document.querySelectorAll('.nav-item')[0];
    const historyList = document.getElementById('history-list');
    const refreshBtn = document.getElementById('refresh-btn');
    const topNewChatBtn = document.getElementById('top-new-chat-btn');
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            window.location.reload();
        });
    }
    
    // Multi-Session State
    let allChats = JSON.parse(localStorage.getItem('synapse_all_chats') || localStorage.getItem('bajju_all_chats') || '[]');
    let sessionId = localStorage.getItem('synapse_session_id') || localStorage.getItem('bajju_session_id');
    let currentUser = JSON.parse(localStorage.getItem('synapse_user') || localStorage.getItem('mastan_user'));
    let conversationHistory = [];
    let chatAttachments = []; // Moved to top to avoid Temporal Dead Zone errors

    // Initialize if no session exists or find existing session history
    if (!sessionId) {
        createNewSession();
    } else {
        const currentChat = allChats.find(c => c.id === sessionId);
        if (currentChat) {
            conversationHistory = currentChat.history;
        }
    }

    updateAuthUI();
    renderSidebar();
    loadCurrentHistory();

    // WebSocket Setup
    let ws = null;
    let pingInterval = null;
    connectWebSocket();

    function createNewSession() {
        sessionId = 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        localStorage.setItem('synapse_session_id', sessionId);
        conversationHistory = [];
        // Optional: Pre-add to allChats if we want empty chats to show up
    }

    function saveCurrentChat() {
        if (conversationHistory.length === 0) return;

        let chatIndex = allChats.findIndex(c => c.id === sessionId);
        
        // Generate a title from the first user message if not set
        let title = "New Conversation";
        const firstUserMsg = conversationHistory.find(m => m.sender === 'user');
        if (firstUserMsg) {
            title = firstUserMsg.text.substring(0, 30) + (firstUserMsg.text.length > 30 ? '...' : '');
        }

        const chatData = {
            id: sessionId,
            title: title,
            history: conversationHistory,
            lastModified: Date.now()
        };

        if (chatIndex > -1) {
            allChats[chatIndex] = chatData;
        } else {
            allChats.unshift(chatData); // Newest at top
        }

        localStorage.setItem('synapse_all_chats', JSON.stringify(allChats));
        renderSidebar();
    }

    function renderSidebar() {
        if (!historyList) return;
        historyList.innerHTML = '';
        
        allChats.forEach(chat => {
            const wrapper = document.createElement('div');
            wrapper.className = 'history-item-wrapper' + (chat.id === sessionId ? ' active' : '');
            
            const item = document.createElement('a');
            item.href = '#';
            item.className = 'history-item';
            item.textContent = chat.title;
            item.addEventListener('click', (e) => {
                e.preventDefault();
                switchChat(chat.id);
            });
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-chat-btn';
            deleteBtn.title = 'Delete chat';
            deleteBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            `;
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteChat(chat.id);
            });
            
            wrapper.appendChild(item);
            wrapper.appendChild(deleteBtn);
            historyList.appendChild(wrapper);
        });
    }

    function deleteChat(id) {
        const chatToDelete = allChats.find(c => c.id === id);
        const title = chatToDelete ? chatToDelete.title : 'this chat';
        
        if (!confirm(`Are you sure you want to delete "${title}"?`)) return;
        
        allChats = allChats.filter(c => c.id !== id);
        localStorage.setItem('synapse_all_chats', JSON.stringify(allChats));
        
        if (id === sessionId) {
            createNewSession();
            clearChatUI();
            if (ws) ws.close();
        }
        
        renderSidebar();
    }

    function switchChat(newId) {
        if (newId === sessionId) return;
        
        // Save current before leaving
        saveCurrentChat();

        sessionId = newId;
        localStorage.setItem('synapse_session_id', sessionId);
        
        const chat = allChats.find(c => c.id === sessionId);
        conversationHistory = chat ? chat.history : [];
        
        // Refresh UI
        clearChatUI();
        loadCurrentHistory();
        
        // Reconnect WebSocket for the new session
        if (ws) ws.close();
        renderSidebar();
    }

    function clearChatUI() {
        const messagesContainer = document.querySelector('.messages-container');
        if (messagesContainer) messagesContainer.remove();
        
        const greeting = document.querySelector('.greeting');
        if (greeting) greeting.style.display = 'block';
    }

    function loadCurrentHistory() {
        if (conversationHistory.length > 0) {
            conversationHistory.forEach(msg => {
                addMessageToUI(msg.text, msg.sender, null, true);
            });
        }
    }

    function connectWebSocket() {
        const statusIndicator = document.getElementById('connection-status');
        const statusText = statusIndicator?.querySelector('.status-text');
        
        if (pingInterval) clearInterval(pingInterval);

        const userId = currentUser ? currentUser.user_id : 'guest';
        ws = new WebSocket(`ws://127.0.0.1:8001/ws/chat/${sessionId}?user_id=${userId}`);
        
        ws.onopen = () => {
            console.log('Connected to Session:', sessionId);
            if (statusIndicator) statusIndicator.classList.add('connected');
            if (statusText) statusText.textContent = 'Connected';

            // Heartbeat ping every 15s to keep connection alive
            pingInterval = setInterval(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'ping' }));
                }
            }, 15000);
        };
        
        let currentStreamingText = "";
        let currentStreamingId = null;

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'pong') return; // Heartbeat pong

            const loadings = document.querySelectorAll('.message.loading-message');
            
            if (data.chunk) {
                // Remove loading on first chunk
                if (loadings.length > 0) loadings[loadings.length - 1].remove();
                
                if (!currentStreamingId) {
                    currentStreamingId = 'streaming-' + Date.now();
                    addMessageToUI('', 'ai', currentStreamingId);
                    currentStreamingText = "";
                }
                
                const msgElem = document.getElementById(currentStreamingId);
                if (msgElem) {
                    currentStreamingText += data.chunk;
                    msgElem.textContent = currentStreamingText;
                    const container = document.querySelector('.messages-container');
                    if (container) container.scrollTop = container.scrollHeight;
                }
            } else if (data.end) {
                const msgElem = document.getElementById(currentStreamingId);
                if (msgElem) {
                    msgElem.innerHTML = marked.parse(currentStreamingText);
                    conversationHistory.push({ sender: 'ai', text: currentStreamingText });
                    saveCurrentChat();
                }
                currentStreamingId = null;
                currentStreamingText = "";
            } else if (data.response) {
                // Fallback for non-streaming
                if (loadings.length > 0) loadings[loadings.length - 1].remove();
                conversationHistory.push({ sender: 'ai', text: data.response });
                saveCurrentChat();
                addMessageToUI(data.response, 'ai');
            } else if (data.error) {
                if (loadings.length > 0) loadings[loadings.length - 1].remove();
                addMessageToUI('Error: ' + data.error, 'error');
            }
        };
        
        ws.onclose = (e) => {
            console.log('WebSocket closed. Reconnecting...', e);
            if (pingInterval) clearInterval(pingInterval);
            if (statusIndicator) statusIndicator.classList.remove('connected');
            if (statusText) statusText.textContent = 'Disconnected';
            
            setTimeout(() => {
                if (!ws || ws.readyState === WebSocket.CLOSED) connectWebSocket();
            }, 2000);
        };

        ws.onerror = (err) => {
            console.error('WebSocket error:', err);
            if (statusIndicator) statusIndicator.classList.remove('connected');
            if (statusText) statusText.textContent = 'Connection Error';
        };
    }

    let handleNewChatAction = (e) => {
        if (e) e.preventDefault();
        saveCurrentChat();
        createNewSession();
        clearChatUI();
        if (ws) ws.close();
        renderSidebar();
    };

    if (newChatBtn) {
        newChatBtn.addEventListener('click', handleNewChatAction);
    }

    if (topNewChatBtn) {
        topNewChatBtn.addEventListener('click', handleNewChatAction);
    }

    const chatForm = document.getElementById('chat-form');

    if (chatInput && submitBtn) {
        submitBtn.disabled = false;

        const updateSubmitState = () => {
            const hasText = chatInput.value.trim().length > 0;
            const hasAttachments = chatAttachments && chatAttachments.length > 0;
            submitBtn.style.opacity = (hasText || hasAttachments) ? '1' : '0.6';
            submitBtn.style.cursor = 'pointer';
        };

        chatInput.addEventListener('input', updateSubmitState);
        chatInput.addEventListener('keyup', updateSubmitState);
        chatInput.addEventListener('change', updateSubmitState);
        chatInput.addEventListener('paste', () => setTimeout(updateSubmitState, 50));
        
        updateSubmitState();

        const sendMessage = () => {
            const prompt = chatInput.value.trim();
            const hasAttachments = chatAttachments && chatAttachments.length > 0;

            if (!prompt && !hasAttachments) {
                chatInput.focus();
                return;
            }

            chatInput.value = '';
            updateSubmitState();
            
            conversationHistory.push({ sender: 'user', text: prompt });
            saveCurrentChat();
            addMessageToUI(prompt, 'user');
            
            const loadingId = 'loading-' + Date.now();
            addMessageToUI('typing...', 'loading', loadingId);
            
            let attempts = 0;
            const trySend = () => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    const messageData = {
                        prompt: prompt,
                        attachments: chatAttachments.map(f => ({ name: f.name, size: f.size, type: f.type }))
                    };
                    ws.send(JSON.stringify(messageData));
                    chatAttachments = [];
                    renderChatAttachments();
                } else if (attempts < 5) {
                    attempts++;
                    console.log(`WebSocket reconnecting attempt ${attempts}...`);
                    if (!ws || ws.readyState === WebSocket.CLOSED) connectWebSocket();
                    setTimeout(trySend, 800);
                } else {
                    document.getElementById(loadingId)?.remove();
                    addMessageToUI('Error: Backend connection lost. Please refresh.', 'error');
                }
            };
            trySend();
        };

        if (chatForm) {
            chatForm.addEventListener('submit', (e) => {
                e.preventDefault();
                sendMessage();
            });
        }

        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        submitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sendMessage();
        });
    }

    // View Switching Logic
    const chatView = document.getElementById('chat-view');
    const converterView = document.getElementById('converter-view');
    const navConverter = document.getElementById('nav-converter');

    function switchView(viewName) {
        if (viewName === 'converter') {
            chatView.style.display = 'none';
            converterView.style.display = 'flex';
            navConverter.classList.add('active');
        } else {
            chatView.style.display = 'flex';
            converterView.style.display = 'none';
            navConverter.classList.remove('active');
        }
    }

    if (navConverter) {
        navConverter.addEventListener('click', (e) => {
            e.preventDefault();
            switchView('converter');
        });
    }

    // Reset view when starting a new chat
    const originalNewChatAction = handleNewChatAction;
    handleNewChatAction = (e) => {
        switchView('chat');
        originalNewChatAction(e);
    };

    // File Converter UI Logic
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileInfo = document.getElementById('selected-file-info');
    const startConvertBtn = document.getElementById('start-convert-btn');
    const targetFormatSelect = document.getElementById('target-format');
    const conversionStatus = document.getElementById('conversion-status');
    const progressBar = document.getElementById('convert-progress');
    const statusMessage = document.getElementById('status-message');

    // Chat Attachment Elements
    const attachBtn = document.getElementById('attach-btn');
    const chatFileInput = document.getElementById('chat-file-input');
    const attachmentPreviewContainer = document.getElementById('attachment-preview-container');

    const pickFileBtn = document.getElementById('pick-file-btn');
    const pickFolderBtn = document.getElementById('pick-folder-btn');

    let selectedFile = null;
    let selectedFolderFiles = [];
    // chatAttachments removed from here (already declared at top)

    // Modern File/Folder Picking Utility
    async function pickFile(options = {}) {
        if ('showOpenFilePicker' in window) {
            try {
                const [handle] = await window.showOpenFilePicker(options);
                return await handle.getFile();
            } catch (err) {
                if (err.name === 'AbortError') return null;
                console.warn('showOpenFilePicker failed, falling back to input:', err);
            }
        }
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            if (options.multiple) input.multiple = true;
            input.onchange = () => resolve(input.files[0] || null);
            input.click();
        });
    }

    async function pickFolder() {
        if ('showDirectoryPicker' in window) {
            try {
                const handle = await window.showDirectoryPicker();
                const files = [];
                for await (const entry of scanDirectory(handle)) {
                    if (entry.kind === 'file') files.push(await entry.getFile());
                }
                return files;
            } catch (err) {
                if (err.name === 'AbortError') return null;
                console.error('Directory picker error:', err);
                alert('Folder access was denied or failed.');
            }
        } else {
            alert('Your browser does not support direct folder picking. Please drag and drop a folder instead.');
        }
        return null;
    }

    async function* scanDirectory(handle) {
        for await (const entry of handle.values()) {
            if (entry.kind === 'file') {
                yield entry;
            } else if (entry.kind === 'directory') {
                yield* scanDirectory(entry);
            }
        }
    }

    if (dropZone) {
        if (pickFileBtn) {
            pickFileBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const file = await pickFile();
                if (file) handleFileSelect(file);
            });
        }

        if (pickFolderBtn) {
            pickFolderBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const files = await pickFolder();
                if (files && files.length > 0) handleFolderSelect(files);
            });
        }

        // Drop zone click fallback
        dropZone.addEventListener('click', (e) => {
             if (e.target === dropZone || dropZone.contains(e.target)) {
                 if (!pickFileBtn) fileInput.click();
             }
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            
            const items = e.dataTransfer.items;
            if (items && items.length > 0) {
                const entries = Array.from(items).map(item => item.webkitGetAsEntry()).filter(e => e);
                const files = [];
                for (const entry of entries) {
                    if (entry.isFile) {
                        files.push(await new Promise(r => entry.file(r)));
                    } else if (entry.isDirectory) {
                        const folderFiles = await scanEntry(entry);
                        files.push(...folderFiles);
                    }
                }
                
                if (files.length > 1) {
                    handleFolderSelect(files);
                } else if (files.length === 1) {
                    handleFileSelect(files[0]);
                }
            }
        });
    }

    async function scanEntry(entry) {
        const files = [];
        const reader = entry.createReader();
        const entries = await new Promise(r => reader.readEntries(r));
        for (const e of entries) {
            if (e.isFile) {
                files.push(await new Promise(resolve => e.file(resolve)));
            } else if (e.isDirectory) {
                files.push(...(await scanEntry(e)));
            }
        }
        return files;
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });
    }

    function handleFileSelect(file) {
        selectedFile = file;
        selectedFolderFiles = [];
        fileInfo.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        startConvertBtn.disabled = false;
        conversionStatus.style.display = 'none';
    }

    function handleFolderSelect(files) {
        selectedFolderFiles = files;
        selectedFile = files[0]; // Default to first file for simplicity
        fileInfo.textContent = `Selected Folder: ${files.length} files found. Converting '${selectedFile.name}'...`;
        startConvertBtn.disabled = false;
        conversionStatus.style.display = 'none';
    }

    // Chat Attachment Logic
    if (attachBtn) {
        attachBtn.addEventListener('click', async () => {
            const file = await pickFile();
            if (file) addChatAttachment(file);
        });
    }

    if (chatFileInput) {
        chatFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                addChatAttachment(e.target.files[0]);
            }
        });
    }

    function addChatAttachment(file) {
        chatAttachments.push(file);
        renderChatAttachments();
    }

    function renderChatAttachments() {
        attachmentPreviewContainer.innerHTML = '';
        chatAttachments.forEach((file, index) => {
            const div = document.createElement('div');
            div.className = 'attachment-preview';
            div.innerHTML = `
                <span>${file.name}</span>
                <button class="remove-btn" title="Remove attachment">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            `;
            div.querySelector('.remove-btn').addEventListener('click', () => {
                chatAttachments.splice(index, 1);
                renderChatAttachments();
            });
            attachmentPreviewContainer.appendChild(div);
        });
    }

    if (startConvertBtn) {
        startConvertBtn.addEventListener('click', async () => {
            if (!selectedFile) return;

            const targetFormat = targetFormatSelect.value;
            startConvertBtn.disabled = true;
            conversionStatus.style.display = 'block';
            progressBar.style.width = '30%';
            statusMessage.textContent = 'Uploading and processing...';

            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('target_format', targetFormat);

            try {
                const response = await fetch('http://localhost:8000/api/convert', {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    progressBar.style.width = '100%';
                    statusMessage.textContent = 'Conversion complete! Downloading...';
                    
                    // Handle file download
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    const fileName = selectedFile.name.split('.')[0] + '.' + targetFormat;
                    a.href = url;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    
                    setTimeout(() => {
                        startConvertBtn.disabled = false;
                        statusMessage.textContent = 'Done!';
                    }, 2000);
                } else {
                    const error = await response.json();
                    throw new Error(error.detail || 'Conversion failed');
                }
            } catch (err) {
                console.error('Conversion error:', err);
                progressBar.style.width = '0%';
                statusMessage.textContent = 'Error: ' + err.message;
                startConvertBtn.disabled = false;
            }
        });
    }

    function addMessageToUI(text, sender, id = null, skipAnimation = false) {
        const chatArea = document.querySelector('.chat-area');
        const greeting = document.querySelector('.greeting');
        if (greeting) greeting.style.display = 'none';
        
        let container = document.querySelector('.messages-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'messages-container';
            chatArea.insertBefore(container, document.querySelector('.input-wrapper'));
        }
        
        const div = document.createElement('div');
        div.className = `message ${sender}-message`;
        if (id) div.id = id;
        
        if (sender === 'ai' && !id?.startsWith('error')) {
            container.appendChild(div);
            if (skipAnimation) {
                div.innerHTML = marked.parse(text);
            } else {
                let i = 0;
                const type = () => {
                    const step = 4;
                    if (i < text.length) {
                        div.textContent += text.substring(i, i + step);
                        i += step;
                        container.scrollTop = container.scrollHeight;
                        requestAnimationFrame(type);
                    } else {
                        div.innerHTML = marked.parse(text);
                        container.scrollTop = container.scrollHeight;
                    }
                };
                type();
            }
        } else {
            div.textContent = text;
            container.appendChild(div);
        }
        container.scrollTop = container.scrollHeight;
    }

    // Login Modal Logic
    const loginModal = document.getElementById('login-modal');
    const loginTrigger = document.getElementById('login-trigger');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    if (loginTrigger && loginModal) {
        loginTrigger.addEventListener('click', (e) => {
            e.preventDefault();
            loginModal.classList.add('active');
        });
    }

    if (modalCloseBtn && loginModal) {
        modalCloseBtn.addEventListener('click', () => {
            loginModal.classList.remove('active');
        });
    }

    // Close modal on clicking outside the content
    if (loginModal) {
        loginModal.addEventListener('click', (e) => {
            if (e.target === loginModal) {
                loginModal.classList.remove('active');
            }
        });
    }

    // Login Modal Transitions
    const emailOptionBtn = document.getElementById('email-option-btn');
    const emailBackBtn = document.getElementById('email-back-btn');
    const modalViewOptions = document.getElementById('modal-view-options');
    const modalViewEmail = document.getElementById('modal-view-email');

    if (emailOptionBtn) {
        emailOptionBtn.addEventListener('click', () => {
            modalViewOptions.classList.remove('active');
            modalViewEmail.classList.add('active');
        });
    }

    if (emailBackBtn) {
        emailBackBtn.addEventListener('click', () => {
            modalViewEmail.classList.remove('active');
            modalViewOptions.classList.add('active');
        });
    }

    // Email Login Form Handling
    const emailLoginForm = document.getElementById('email-login-form');
    const emailLoginInput = document.getElementById('login-email-input');

    if (emailLoginForm) {
        emailLoginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = emailLoginInput.value.trim();
            
            try {
                const response = await fetch('http://localhost:8000/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email })
                });
                
                if (response.ok) {
                    const userData = await response.json();
                    loginUser(userData);
                } else {
                    const error = await response.json();
                    alert(error.detail || 'Login failed');
                }
            } catch (err) {
                console.error('Login error:', err);
                alert('Connection error. Is the backend running?');
            }
        });
    }

    function loginUser(userData) {
        currentUser = userData;
        localStorage.setItem('synapse_user', JSON.stringify(userData));
        
        // Reset session and chats for the new user (or load them if we wanted to be more complex)
        // For now, we just refresh the UI and WebSocket
        updateAuthUI();
        loginModal.classList.remove('active');
        
        // Reset to options view for next time
        modalViewEmail.classList.remove('active');
        modalViewOptions.classList.add('active');
        
        // Reconnect WebSocket with new user_id
        if (ws) ws.close();
        
        // Reload history if we had a persistent store on backend (optional)
        // For simplicity in this demo, we just stay on current session but associate it
    }

    function logoutUser() {
        currentUser = null;
        localStorage.removeItem('synapse_user');
        localStorage.removeItem('mastan_user');
        updateAuthUI();
        if (ws) ws.close();
    }

    function updateAuthUI() {
        const loggedOutView = document.getElementById('logged-out-view');
        const loggedInView = document.getElementById('logged-in-view');
        const userNameElem = document.getElementById('user-name');
        const userAvatarElem = document.getElementById('user-avatar');

        if (currentUser) {
            if (loggedOutView) loggedOutView.style.display = 'none';
            if (loggedInView) loggedInView.style.display = 'flex';
            if (userNameElem) userNameElem.textContent = currentUser.name;
            if (userAvatarElem) userAvatarElem.textContent = currentUser.name.charAt(0).toUpperCase();
        } else {
            if (loggedOutView) loggedOutView.style.display = 'block';
            if (loggedInView) loggedInView.style.display = 'none';
        }
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logoutUser();
        });
    }

    // Handle generic login option clicks (fallback)
    const loginOptions = document.querySelectorAll('.login-option-btn:not(#email-option-btn)');
    loginOptions.forEach(btn => {
        btn.addEventListener('click', () => {
            const method = btn.textContent.trim();
            alert(`Sign-in functionality for "${method}" will be implemented in the next phase!`);
        });
    });
    // ============================
    // CHAT MIX FEATURE
    // ============================

    const mixChatsBtn = document.getElementById('mix-chats-btn');
    const chatMixModal = document.getElementById('chat-mix-modal');
    const mixModalCloseBtn = document.getElementById('mix-modal-close-btn');
    const mixChatList = document.getElementById('mix-chat-list');
    const mixSearchInput = document.getElementById('mix-search-input');
    const mixSelectedCount = document.getElementById('mix-selected-count');
    const mixConfirmBtn = document.getElementById('mix-confirm-btn');
    const mixNameInput = document.getElementById('mix-name-input');

    let mixSelectedIds = [];

    function showMixModal() {
        mixSelectedIds = [];
        mixNameInput.value = '';
        mixSearchInput.value = '';
        renderMixChatList('');
        updateMixUI();
        chatMixModal.classList.add('active');
        mixSearchInput.focus();
    }

    function hideMixModal() {
        chatMixModal.classList.remove('active');
    }

    function renderMixChatList(filter) {
        if (!mixChatList) return;
        mixChatList.innerHTML = '';
        const filtered = allChats.filter(c => c.title.toLowerCase().includes(filter.toLowerCase()));
        if (filtered.length === 0) {
            mixChatList.innerHTML = '<div class="mix-empty-state">No chats found</div>';
            return;
        }
        filtered.forEach(chat => {
            const orderIdx = mixSelectedIds.indexOf(chat.id);
            const isSelected = orderIdx !== -1;
            const item = document.createElement('div');
            item.className = 'mix-chat-item' + (isSelected ? ' selected' : '');
            item.dataset.id = chat.id;
            const msgCount = chat.history ? chat.history.length : 0;
            const date = chat.lastModified
                ? new Date(chat.lastModified).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                : '';
            item.innerHTML = `
                <div class="mix-chat-checkbox">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <div class="mix-chat-info">
                    <div class="mix-chat-title">${chat.title}</div>
                    <div class="mix-chat-meta">${msgCount} message${msgCount !== 1 ? 's' : ''}${date ? ' � ' + date : ''}</div>
                </div>
                <div class="mix-chat-order">${isSelected ? orderIdx + 1 : ''}</div>
            `;
            item.addEventListener('click', () => toggleMixSelection(chat.id));
            mixChatList.appendChild(item);
        });
    }

    function toggleMixSelection(id) {
        const idx = mixSelectedIds.indexOf(id);
        if (idx === -1) { mixSelectedIds.push(id); } else { mixSelectedIds.splice(idx, 1); }
        renderMixChatList(mixSearchInput ? mixSearchInput.value : '');
        updateMixUI();
    }

    function updateMixUI() {
        const count = mixSelectedIds.length;
        if (mixSelectedCount) {
            mixSelectedCount.textContent = count === 0
                ? 'No chats selected'
                : count === 1
                    ? '1 chat selected � select at least 1 more'
                    : `${count} chats selected`;
        }
        if (mixConfirmBtn) { mixConfirmBtn.disabled = count < 2; }
    }

    function showMixToast(message) {
        let toast = document.querySelector('.mix-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'mix-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    function executeChatMix() {
        if (mixSelectedIds.length < 2) return;
        const mergedHistory = [];
        mixSelectedIds.forEach((id) => {
            const chat = allChats.find(c => c.id === id);
            if (!chat) return;
            mergedHistory.push({ sender: 'ai', text: `--- *Merged from: "${chat.title}"* ---` });
            if (chat.history) { chat.history.forEach(msg => mergedHistory.push({ ...msg })); }
        });
        const customTitle = mixNameInput && mixNameInput.value.trim();
        const autoTitle = mixSelectedIds
            .map(id => allChats.find(c => c.id === id)?.title?.substring(0, 15) || '')
            .filter(Boolean).join(' + ');
        const mergedTitle = customTitle || ('Mix: ' + autoTitle);
        saveCurrentChat();
        const newId = 'session_mix_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        const mergedChat = { id: newId, title: mergedTitle, history: mergedHistory, lastModified: Date.now() };
        allChats.unshift(mergedChat);
        localStorage.setItem('synapse_all_chats', JSON.stringify(allChats));
        sessionId = newId;
        localStorage.setItem('synapse_session_id', sessionId);
        conversationHistory = mergedHistory;
        clearChatUI();
        loadCurrentHistory();
        renderSidebar();
        if (ws) ws.close();
        hideMixModal();
        showMixToast('Merged ' + mixSelectedIds.length + ' chats successfully!');
    }

    if (mixChatsBtn) {
        mixChatsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (allChats.length < 2) { showMixToast('You need at least 2 saved chats to mix!'); return; }
            showMixModal();
        });
    }
    if (mixModalCloseBtn) { mixModalCloseBtn.addEventListener('click', hideMixModal); }
    if (chatMixModal) {
        chatMixModal.addEventListener('click', (e) => { if (e.target === chatMixModal) hideMixModal(); });
    }
    if (mixSearchInput) {
        mixSearchInput.addEventListener('input', () => { renderMixChatList(mixSearchInput.value); });
    }
    if (mixConfirmBtn) { mixConfirmBtn.addEventListener('click', executeChatMix); }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && chatMixModal && chatMixModal.classList.contains('active')) hideMixModal();
    });
    // ============================
    // MICROPHONE / VOICE INPUT LOGIC
    // ============================

    const micBtn = document.querySelector('.mic-btn');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (micBtn) {
        if (!SpeechRecognition) {
            micBtn.title = "Voice input (Not supported in this browser)";
            micBtn.addEventListener('click', () => {
                showMixToast('🎤 Speech Recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
            });
        } else {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            let isListening = false;
            let finalTranscript = '';

            recognition.onstart = () => {
                isListening = true;
                micBtn.classList.add('listening');
                micBtn.title = "Listening... Click to stop";
                showMixToast('??? Listening... Speak now!');
            };

            recognition.onresult = (event) => {
                let interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript + ' ';
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }
                const currentText = finalTranscript + interimTranscript;
                if (chatInput) {
                    chatInput.value = currentText;
                    chatInput.dispatchEvent(new Event('input'));
                }
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                stopListening();
                if (event.error === 'not-allowed') {
                    showMixToast('⚠️ Microphone access denied. Please allow microphone permissions in browser.');
                } else if (event.error !== 'no-speech') {
                    showMixToast('⚠️ Voice error: ' + event.error);
                }
            };

            recognition.onend = () => {
                stopListening();
            };

            function stopListening() {
                if (!isListening) return;
                isListening = false;
                micBtn.classList.remove('listening');
                micBtn.title = "Voice input";
                try { recognition.stop(); } catch (e) {}
            }

            micBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (isListening) {
                    stopListening();
                    showMixToast('🎙️ Voice recording stopped.');
                } else {
                    finalTranscript = chatInput.value ? chatInput.value + ' ' : '';
                    try {
                        recognition.start();
                    } catch (err) {
                        console.error('Error starting recognition:', err);
                    }
                }
            });
        }
    }
    // ============================
    // SEARCH CHATS FEATURE
    // ============================

    const navSearchChats = document.getElementById('nav-search-chats');
    const searchChatsModal = document.getElementById('search-chats-modal');
    const searchModalCloseBtn = document.getElementById('search-modal-close-btn');
    const globalSearchInput = document.getElementById('global-search-input');
    const searchResultsList = document.getElementById('search-results-list');

    function showSearchModal() {
        if (!searchChatsModal) return;
        globalSearchInput.value = '';
        renderSearchResults('');
        searchChatsModal.classList.add('active');
        globalSearchInput.focus();
    }

    function hideSearchModal() {
        if (!searchChatsModal) return;
        searchChatsModal.classList.remove('active');
    }

    function renderSearchResults(query) {
        if (!searchResultsList) return;
        searchResultsList.innerHTML = '';

        const q = query.trim().toLowerCase();

        const matches = [];
        allChats.forEach(chat => {
            const titleMatch = chat.title && chat.title.toLowerCase().includes(q);
            let snippet = '';

            if (chat.history) {
                for (const msg of chat.history) {
                    if (msg.text && msg.text.toLowerCase().includes(q)) {
                        snippet = msg.text;
                        break;
                    }
                }
            }

            if (!snippet && chat.history && chat.history.length > 0) {
                snippet = chat.history[0].text;
            }

            if (!q || titleMatch || (snippet && snippet.toLowerCase().includes(q))) {
                matches.push({ chat, titleMatch, snippet });
            }
        });

        if (matches.length === 0) {
            searchResultsList.innerHTML = `<div class="search-no-results">No chats matching "${query}"</div>`;
            return;
        }

        matches.forEach(({ chat, snippet }) => {
            const item = document.createElement('div');
            item.className = 'search-result-item';

            const date = chat.lastModified
                ? new Date(chat.lastModified).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                : '';

            const highlightedTitle = highlightText(chat.title || 'Untitled Chat', q);
            const snippetText = snippet ? snippet.substring(0, 100) + (snippet.length > 100 ? '...' : '') : '';
            const highlightedSnippet = highlightText(snippetText, q);

            item.innerHTML = `
                <div class="search-result-header">
                    <span class="search-result-title">${highlightedTitle}</span>
                    <span class="search-result-date">${date}</span>
                </div>
                ${snippetText ? `<div class="search-result-snippet">${highlightedSnippet}</div>` : ''}
            `;

            item.addEventListener('click', () => {
                switchChat(chat.id);
                hideSearchModal();
            });

            searchResultsList.appendChild(item);
        });
    }

    function highlightText(text, query) {
        if (!query) return text;
        const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${esc})`, 'gi');
        return text.replace(regex, '<span class="search-highlight">$1</span>');
    }

    if (navSearchChats) {
        navSearchChats.addEventListener('click', (e) => {
            e.preventDefault();
            showSearchModal();
        });
    }

    if (searchModalCloseBtn) {
        searchModalCloseBtn.addEventListener('click', hideSearchModal);
    }

    if (searchChatsModal) {
        searchChatsModal.addEventListener('click', (e) => {
            if (e.target === searchChatsModal) hideSearchModal();
        });
    }

    if (globalSearchInput) {
        globalSearchInput.addEventListener('input', () => {
            renderSearchResults(globalSearchInput.value);
        });
    }

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            showSearchModal();
        }
        if (e.key === 'Escape' && searchChatsModal && searchChatsModal.classList.contains('active')) {
            hideSearchModal();
        }
    });
    // ============================
    // MOBILE NAVIGATION & TOUCH LOGIC
    // ============================

    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.querySelector('.sidebar');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');

    function toggleMobileSidebar() {
        if (!sidebar) return;
        const isActive = sidebar.classList.contains('active');
        if (isActive) {
            closeMobileSidebar();
        } else {
            openMobileSidebar();
        }
    }

    function openMobileSidebar() {
        if (sidebar) sidebar.classList.add('active');
        if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
    }

    function closeMobileSidebar() {
        if (sidebar) sidebar.classList.remove('active');
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleMobileSidebar();
        });
    }

    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', closeMobileSidebar);
    }

    // Auto-close sidebar on mobile when selecting a chat
    document.querySelectorAll('.history-item, .nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                closeMobileSidebar();
            }
        });
    });
});
