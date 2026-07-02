document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const modelSelect = document.getElementById("model-select");
    const activeModelDisplay = document.getElementById("active-model-display");
    const headerModelName = document.getElementById("header-model-name");
    const hostStatus = document.getElementById("host-status");
    const userInput = document.getElementById("user-input");
    const sendBtn = document.getElementById("send-btn");
    const chatMessages = document.getElementById("chat-messages");
    const mainContent = document.querySelector(".main-content");
    const newChatBtn = document.getElementById("new-chat-btn");
    const clearHistoryBtn = document.getElementById("clear-history-btn");

    // Context UI elements
    const contextMenuBtn = document.getElementById("context-menu-btn");
    const contextPopover = document.getElementById("context-popover");
    const btnUploadFile = document.getElementById("btn-upload-file");
    const btnPasteText = document.getElementById("btn-paste-text");
    const fileInput = document.getElementById("file-input");
    const contextEmpty = document.getElementById("context-empty");
    const contextActive = document.getElementById("context-active");
    const contextSizeDisplay = document.getElementById("context-size-display");
    const contextPreviewDisplay = document.getElementById("context-preview-display");
    const clearContextBtn = document.getElementById("clear-context-btn");

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
    renderWelcomeMessage();
    fetchModels();
    updateContextUI();

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
            hostStatus.textContent = "Checking...";
            hostStatus.className = "status-value";
            
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
                
                hostStatus.textContent = "Online";
                hostStatus.className = "status-value status-online";
            } else {
                hostStatus.textContent = "No Models";
                hostStatus.className = "status-value status-offline";
                headerModelName.textContent = "No local models found";
            }
        } catch (error) {
            console.error("Failed to fetch models:", error);
            hostStatus.textContent = "Offline";
            hostStatus.className = "status-value status-offline";
            headerModelName.textContent = "Connection failed";
        }
    }

    // 3. Handle model selection change
    function handleModelChange() {
        const selectedModel = modelSelect.value;
        if (selectedModel) {
            activeModelDisplay.textContent = selectedModel;
            headerModelName.textContent = selectedModel;
            validateSendState();
        }
    }

    modelSelect.addEventListener("change", handleModelChange);

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
                updateContextUI();
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
                updateContextUI();
            } else {
                alert(`Context error: ${data.detail}`);
            }
        } catch (error) {
            console.error("Text context save error:", error);
            alert("Error sending context text to server.");
        }
    });

    // Clear context from sidebar
    clearContextBtn.addEventListener("click", async () => {
        try {
            const response = await fetch("/api/context", { method: "DELETE" });
            if (response.ok) {
                updateContextUI();
            }
        } catch (e) {
            console.error("Error clearing context:", e);
        }
    });

    // Load active context state and update sidebar display
    async function updateContextUI() {
        try {
            const response = await fetch("/api/context");
            if (!response.ok) return;
            
            const data = await response.json();
            if (data.active) {
                hasContextLoaded = true;
                contextEmpty.classList.add("hidden");
                contextActive.classList.remove("hidden");
                contextSizeDisplay.textContent = formatBytes(data.length);
                contextPreviewDisplay.textContent = data.preview;
            } else {
                hasContextLoaded = false;
                contextEmpty.classList.remove("hidden");
                contextActive.classList.add("hidden");
            }
        } catch (e) {
            console.error("Error updating context UI:", e);
        }
    }

    // 7. Reset sessions
    function clearSession() {
        conversationHistory = [];
        chatMessages.innerHTML = "";
        mainContent.classList.add("welcome-mode");
        renderWelcomeMessage();
        validateSendState();
    }

    newChatBtn.addEventListener("click", clearSession);
    clearHistoryBtn.addEventListener("click", clearSession);

    // Helpers
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
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
