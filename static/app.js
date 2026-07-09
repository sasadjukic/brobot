document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const modelSelect = document.getElementById("model-select");
    const userInput = document.getElementById("user-input");
    const sendBtn = document.getElementById("send-btn");
    const chatMessages = document.getElementById("chat-messages");
    const mainContent = document.querySelector(".main-content");
    const sidebar = document.querySelector(".sidebar");
    const sidebarToggle = document.getElementById("sidebar-toggle");
    const newChatBtn = document.getElementById("new-chat-btn");
    const chatHistoryList = document.getElementById("chat-history-list");

    // Context UI elements
    const contextMenuBtn = document.getElementById("context-menu-btn");
    const contextPopover = document.getElementById("context-popover");
    const btnUploadFile = document.getElementById("btn-upload-file");
    const btnPasteText = document.getElementById("btn-paste-text");
    const fileInput = document.getElementById("file-input");

    // Text Context Modal elements
    const textModal = document.getElementById("text-modal");
    const modalCloseBtn = document.getElementById("modal-close-btn");
    const modalCancelBtn = document.getElementById("modal-cancel-btn");
    const modalSaveBtn = document.getElementById("modal-save-btn");
    const modalTextInput = document.getElementById("modal-text-input");

    // App State
    let conversationHistory = [];
    let isGenerating = false;
    let hasContextLoaded = false;
    let currentChatId = null;
    let currentChatTitle = "";
    let currentChatSummary = null;

    const greetings = [
        {
            title: "What can Bro do for you today?",
            subtitle: "Pick a model and hand over the problem. Bro brought snacks."
        },
        {
            title: "BroBot reporting for duty-ish.",
            subtitle: "Point me at a question and I’ll press the important-looking buttons."
        },
        {
            title: "Welcome back, carbon-based colleague.",
            subtitle: "Choose a model and let’s make the computers do something useful."
        },
        {
            title: "Got problems? Bro has tokens.",
            subtitle: "Drop a question below. Results may contain suspicious amounts of confidence."
        },
        {
            title: "The Bro is in.",
            subtitle: "No appointment necessary—just select a model and start typing."
        },
        {
            title: "Awaken, tiny thinking machine!",
            subtitle: "BroBot is caffeinated, calibrated, and mostly house-trained."
        },
        {
            title: "Your local models have been summoned.",
            subtitle: "Tell Bro what needs building, fixing, explaining, or blaming."
        },
        {
            title: "BroBot online. Wisdom pending.",
            subtitle: "Select a model and let’s turn vague ideas into slightly less vague ideas."
        },
        {
            title: "Hello there. Bro there.",
            subtitle: "Ask away—no question is too strange, though some answers might be."
        },
        {
            title: "Ready when you are, chief.",
            subtitle: "Choose your model. Bro will handle the dramatic keyboard noises."
        }
    ];

    // 1. Initial setup
    restoreSidebarState();
    renderWelcomeMessage();
    fetchModels();
    loadChatHistory();
    updateContextState();

    function setSidebarCollapsed(collapsed) {
        sidebar.classList.toggle("collapsed", collapsed);
        sidebarToggle.setAttribute("aria-expanded", String(!collapsed));

        const action = collapsed ? "Expand" : "Collapse";
        sidebarToggle.title = `${action} side panel`;
        sidebarToggle.setAttribute("aria-label", `${action} side panel`);
    }

    function restoreSidebarState() {
        let collapsed = false;

        try {
            collapsed = localStorage.getItem("brobot-sidebar-collapsed") === "true";
        } catch (error) {
            // Browser storage is optional.
        }

        setSidebarCollapsed(collapsed);
    }

    sidebarToggle.addEventListener("click", () => {
        const collapsed = !sidebar.classList.contains("collapsed");
        setSidebarCollapsed(collapsed);

        try {
            localStorage.setItem("brobot-sidebar-collapsed", String(collapsed));
        } catch (error) {
            // The toggle still works when browser storage is unavailable.
        }
    });

    function pickGreeting() {
        const storageKey = "brobot-last-greeting";
        let previousIndex = -1;

        try {
            previousIndex = Number.parseInt(localStorage.getItem(storageKey), 10);
        } catch (error) {
            // The greeting still works when browser storage is unavailable.
        }

        let nextIndex;
        do {
            nextIndex = Math.floor(Math.random() * greetings.length);
        } while (greetings.length > 1 && nextIndex === previousIndex);

        try {
            localStorage.setItem(storageKey, String(nextIndex));
        } catch (error) {
            // Browser storage is optional.
        }

        return greetings[nextIndex];
    }

    function renderWelcomeMessage() {
        const greeting = pickGreeting();
        let welcome = document.getElementById("welcome-message");

        if (!welcome) {
            welcome = document.createElement("div");
            welcome.className = "welcome-container";
            welcome.id = "welcome-message";
            welcome.innerHTML = `
                <h2 id="welcome-title"></h2>
                <p id="welcome-subtitle"></p>
            `;
            chatMessages.appendChild(welcome);
        }

        welcome.querySelector("#welcome-title").textContent = greeting.title;
        welcome.querySelector("#welcome-subtitle").textContent = greeting.subtitle;
    }

    // 2. Load Ollama models from API
    async function fetchModels() {
        try {
            const response = await fetch("/api/models");
            if (!response.ok) throw new Error("Backend response error");
            
            const data = await response.json();
            const models = data.models || [];
            
            // Clear existing options, keep placeholder
            modelSelect.innerHTML = '<option value="" disabled selected>Select Model...</option>';
            
            if (models.length > 0) {
                models.forEach(model => {
                    const option = document.createElement("option");
                    option.value = model;
                    option.textContent = model;
                    modelSelect.appendChild(option);
                });
                
                // Select first model by default
                modelSelect.selectedIndex = 1;
                handleModelChange();
                
            } else {
                modelSelect.innerHTML = '<option value="" disabled selected>No local models found</option>';
            }
        } catch (error) {
            console.error("Failed to fetch models:", error);
            modelSelect.innerHTML = '<option value="" disabled selected>Unable to load models</option>';
        }
    }

    // 3. Handle model selection change
    function handleModelChange() {
        const selectedModel = modelSelect.value;
        if (selectedModel) {
            validateSendState();
        }
    }

    modelSelect.addEventListener("change", handleModelChange);

    async function loadChatHistory() {
        if (!chatHistoryList) return;

        try {
            const response = await fetch("/api/chats");
            if (!response.ok) throw new Error("Unable to load saved sessions");

            const data = await response.json();
            renderChatHistory(data.chats || []);
        } catch (error) {
            console.error("Chat history load failed:", error);
            chatHistoryList.innerHTML = '<div class="chat-history-empty">Saved sessions unavailable.</div>';
        }
    }

    function renderChatHistory(chats) {
        if (!chatHistoryList) return;

        chatHistoryList.innerHTML = "";

        if (!chats.length) {
            chatHistoryList.innerHTML = '<div class="chat-history-empty">No saved sessions yet.</div>';
            return;
        }

        chats.forEach(chat => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = `chat-history-item${chat.id === currentChatId ? " active" : ""}`;
            item.dataset.chatId = chat.id;
            item.title = chat.title;
            item.innerHTML = `
                <span class="chat-history-title">${escapeHtml(chat.title)}</span>
                <span class="chat-history-meta">${formatChatMeta(chat)}</span>
            `;
            item.addEventListener("click", () => openChat(chat.id));
            chatHistoryList.appendChild(item);
        });
    }

    function formatChatMeta(chat) {
        const count = Number(chat.message_count || 0);
        const messageLabel = count === 1 ? "1 message" : `${count} messages`;
        const updatedAt = new Date(chat.updated_at);

        if (Number.isNaN(updatedAt.getTime())) {
            return messageLabel;
        }

        return `${messageLabel} - ${updatedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    }

    async function openChat(chatId) {
        if (isGenerating) return;

        try {
            const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}`);
            if (!response.ok) throw new Error("Unable to load saved session");

            const chat = await response.json();
            currentChatId = chat.id;
            currentChatTitle = chat.title || "";
            currentChatSummary = chat.summary || null;
            conversationHistory = Array.isArray(chat.messages) ? chat.messages : [];

            if (chat.model && Array.from(modelSelect.options).some(option => option.value === chat.model)) {
                modelSelect.value = chat.model;
            }

            renderConversation();
            validateSendState();
            loadChatHistory();
        } catch (error) {
            console.error("Open chat failed:", error);
            alert("Could not open that saved session.");
        }
    }

    function renderConversation() {
        chatMessages.innerHTML = "";

        if (!conversationHistory.length) {
            mainContent.classList.add("welcome-mode");
            renderWelcomeMessage();
            return;
        }

        mainContent.classList.remove("welcome-mode");
        conversationHistory.forEach(message => {
            appendMessage(message.role, message.content);
        });
    }

    function deriveCurrentChatTitle() {
        const firstUserMessage = conversationHistory.find(message => message.role === "user" && message.content.trim());
        if (!firstUserMessage) return "Untitled chat";

        const firstLine = firstUserMessage.content.trim().split("\n")[0];
        return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
    }

    async function saveCurrentChat(model) {
        if (!conversationHistory.length) return;

        const payload = {
            title: currentChatTitle || deriveCurrentChatTitle(),
            model,
            messages: conversationHistory,
            summary: currentChatSummary
        };

        try {
            const response = await fetch(currentChatId ? `/api/chats/${encodeURIComponent(currentChatId)}` : "/api/chats", {
                method: currentChatId ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("Unable to save session");

            const savedChat = await response.json();
            currentChatId = savedChat.id;
            currentChatTitle = savedChat.title;
            currentChatSummary = savedChat.summary || null;
            loadChatHistory();
        } catch (error) {
            console.error("Chat save failed:", error);
        }
    }

    // 4. Input Textarea Auto-growth & validation
    userInput.addEventListener("input", () => {
        userInput.style.height = "auto";
        userInput.style.height = userInput.scrollHeight + "px";
        validateSendState();
    });

    function validateSendState() {
        const hasText = userInput.value.trim().length > 0;
        const hasModel = modelSelect.value !== "";
        sendBtn.disabled = !hasText || !hasModel || isGenerating;
    }

    // Handle Enter to submit, Shift+Enter for newline
    userInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.disabled) {
                sendMessage();
            }
        }
    });

    // 5. Send Message Function
    async function sendMessage() {
        if (isGenerating) return;

        const text = userInput.value.trim();
        const model = modelSelect.value;
        
        if (!text || !model) return;

        // Move the input to its conversation position and hide the welcome screen.
        mainContent.classList.remove("welcome-mode");
        document.getElementById("welcome-message")?.classList.add("hidden");

        // Add user message to UI
        appendMessage("user", text);
        
        // Reset input textarea
        userInput.value = "";
        userInput.style.height = "auto";
        validateSendState();

        // Push to conversation history
        conversationHistory.push({ role: "user", content: text });

        // Add assistant message block (placeholder for streaming)
        const messageRow = document.createElement("div");
        messageRow.className = "message-row assistant";
        
        const card = document.createElement("div");
        card.className = "message-card";
        
        const meta = document.createElement("div");
        meta.className = "message-meta";
        meta.innerHTML = `<span>assistant</span><span>•</span><span>${model}</span>`;
        
        const contentDiv = document.createElement("div");
        contentDiv.className = "message-content";
        
        // Add thinking animation dots
        const thinking = document.createElement("div");
        thinking.className = "thinking-container";
        thinking.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
        contentDiv.appendChild(thinking);
        
        card.appendChild(meta);
        card.appendChild(contentDiv);
        messageRow.appendChild(card);
        chatMessages.appendChild(messageRow);
        scrollToBottom();

        // Lock interface while generating
        isGenerating = true;
        validateSendState();

        // Stream reader
        let fullResponseText = "";
        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: model,
                    messages: conversationHistory,
                    use_context: hasContextLoaded
                })
            });

            if (!response.ok) throw new Error("Failed to post message");

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";

            // Remove thinking animation once tokens start arriving
            contentDiv.innerHTML = "";

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n\n");
                // Save the last unfinished line back to the buffer
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.trim().startsWith("data: ")) {
                        const jsonStr = line.trim().slice(6);
                        try {
                            const parsed = JSON.parse(jsonStr);
                            if (parsed.error) {
                                contentDiv.innerHTML = `<span class="status-offline">Error: ${parsed.error}</span>`;
                                break;
                            } else if (parsed.content) {
                                fullResponseText += parsed.content;
                                contentDiv.innerHTML = renderMarkdown(fullResponseText);
                                scrollToBottom();
                            }
                        } catch (e) {
                            console.error("JSON parse error on stream line:", e);
                        }
                    }
                }
            }
            
            // Render final markdown block
            contentDiv.innerHTML = renderMarkdown(fullResponseText);
            
            // Record assistant message to history
            conversationHistory.push({ role: "assistant", content: fullResponseText });
            
        } catch (error) {
            console.error("Streaming chat failed:", error);
            contentDiv.innerHTML = `<span class="status-offline">Communication error occurred. Please make sure Ollama server is running.</span>`;
        } finally {
            await saveCurrentChat(model);
            isGenerating = false;
            validateSendState();
            scrollToBottom();
        }
    }

    sendBtn.addEventListener("click", sendMessage);

    // Helper: append complete user message to DOM
    function appendMessage(role, text) {
        const messageRow = document.createElement("div");
        messageRow.className = `message-row ${role}`;
        
        const card = document.createElement("div");
        card.className = "message-card";
        
        const meta = document.createElement("div");
        meta.className = "message-meta";
        meta.innerHTML = `<span>${role}</span>`;
        
        const contentDiv = document.createElement("div");
        contentDiv.className = "message-content";
        contentDiv.innerHTML = role === "user" ? escapeHtml(text).replace(/\n/g, "<br>") : renderMarkdown(text);
        
        card.appendChild(meta);
        card.appendChild(contentDiv);
        messageRow.appendChild(card);
        chatMessages.appendChild(messageRow);
        scrollToBottom();
    }

    // 6. Context management (+ Menu triggers)
    contextMenuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        contextPopover.classList.toggle("active");
    });

    // Close popover when clicking anywhere else
    document.addEventListener("click", () => {
        contextPopover.classList.remove("active");
    });

    // Option: Upload File
    btnUploadFile.addEventListener("click", () => {
        fileInput.click();
    });

    fileInput.addEventListener("change", async () => {
        const file = fileInput.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await fetch("/api/context", {
                method: "POST",
                body: formData
            });
            const data = await response.json();
            if (response.ok) {
                alert(`Loaded file: ${file.name}`);
                updateContextState();
            } else {
                alert(`Upload failed: ${data.detail}`);
            }
        } catch (error) {
            console.error("File upload context error:", error);
            alert("Error sending file to server.");
        } finally {
            fileInput.value = ""; // Reset input
        }
    });

    // Option: Paste Text Modal
    btnPasteText.addEventListener("click", () => {
        modalTextInput.value = "";
        textModal.classList.remove("hidden");
    });

    // Modal buttons
    modalCloseBtn.addEventListener("click", () => textModal.classList.add("hidden"));
    modalCancelBtn.addEventListener("click", () => textModal.classList.add("hidden"));
    
    modalSaveBtn.addEventListener("click", async () => {
        const text = modalTextInput.value.trim();
        if (!text) {
            textModal.classList.add("hidden");
            return;
        }

        const formData = new FormData();
        formData.append("text", text);

        try {
            const response = await fetch("/api/context", {
                method: "POST",
                body: formData
            });
            const data = await response.json();
            if (response.ok) {
                textModal.classList.add("hidden");
                updateContextState();
            } else {
                alert(`Context error: ${data.detail}`);
            }
        } catch (error) {
            console.error("Text context save error:", error);
            alert("Error sending context text to server.");
        }
    });

    // Keep request state synchronized with the active backend context.
    async function updateContextState() {
        try {
            const response = await fetch("/api/context");
            if (!response.ok) return;
            
            const data = await response.json();
            hasContextLoaded = Boolean(data.active);
        } catch (e) {
            console.error("Error updating context state:", e);
        }
    }

    // 7. Reset sessions
    function clearSession() {
        conversationHistory = [];
        currentChatId = null;
        currentChatTitle = "";
        currentChatSummary = null;
        chatMessages.innerHTML = "";
        mainContent.classList.add("welcome-mode");
        renderWelcomeMessage();
        validateSendState();
        loadChatHistory();
    }

    newChatBtn.addEventListener("click", clearSession);

    // Helpers
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    // Custom light Markdown parser
    function renderMarkdown(text) {
        // Split by code blocks first
        const parts = text.split(/(```[\s\S]*?```)/g);
        
        return parts.map(part => {
            if (part.startsWith('```') && part.endsWith('```')) {
                // Code block
                const code = part.slice(3, -3);
                // Extract language if present
                const firstNewline = code.indexOf('\n');
                let lang = '';
                let codeContent = code;
                if (firstNewline !== -1) {
                    lang = code.substring(0, firstNewline).trim();
                    codeContent = code.substring(firstNewline + 1);
                }
                return `<pre><code class="language-${lang}">${escapeHtml(codeContent.trim())}</code></pre>`;
            } else {
                // Inline styles parsing
                let html = escapeHtml(part);
                
                // Bold (**text**)
                html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
                
                // Italic (*text*)
                html = html.replace(/\*([\s\S]+?)\*/g, '<em>$1</em>');
                
                // Inline Code (`code`)
                html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
                
                // Headings
                html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
                html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
                html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
                
                // Bullet points (* or - )
                html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<ul><li>$1</li></ul>');
                html = html.replace(/<\/ul>\s*<ul>/g, ''); // Merge consecutive ul blocks
                
                // Numbered lists (1. )
                html = html.replace(/^\s*\d+\.\s+(.*$)/gim, '<ol><li>$1</li></ol>');
                html = html.replace(/<\/ol>\s*<ol>/g, ''); // Merge consecutive ol blocks
                
                // Convert newlines to breaks
                html = html.replace(/\n/g, '<br>');
                
                return html;
            }
        }).join('');
    }
});
