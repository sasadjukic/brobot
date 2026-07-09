import os
import json
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
import httpx
from fastapi import FastAPI, Request, HTTPException, UploadFile, File, Form
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional

app = FastAPI(title="BroBot")
DB_PATH = Path(os.environ.get("BROBOT_DB_PATH", "data/brobot.sqlite3"))

# CORS middleware for testing / local requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for chat context (for simplicity in this basic version)
session_context = {
    "text": ""
}

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatPayload(BaseModel):
    model: str
    messages: List[ChatMessage]
    use_context: bool = False

class StoredChatPayload(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None
    messages: List[ChatMessage] = Field(default_factory=list)
    folder_id: Optional[str] = None
    summary: Optional[str] = None

class StoredChatUpdate(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None
    messages: Optional[List[ChatMessage]] = None
    folder_id: Optional[str] = None
    summary: Optional[str] = None

def utc_now():
    return datetime.now(timezone.utc).isoformat()

def get_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_database():
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chats (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                model TEXT,
                messages TEXT NOT NULL,
                folder_id TEXT,
                summary TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        existing_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(chats)").fetchall()
        }
        if "summary" not in existing_columns:
            conn.execute("ALTER TABLE chats ADD COLUMN summary TEXT")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC)"
        )

def dump_messages(messages: List[ChatMessage]):
    return json.dumps([message.dict() for message in messages], ensure_ascii=False)

def load_messages(raw_messages: str):
    try:
        messages = json.loads(raw_messages)
        return messages if isinstance(messages, list) else []
    except json.JSONDecodeError:
        return []

def default_chat_title(messages: List[ChatMessage]):
    for message in messages:
        if message.role == "user" and message.content.strip():
            first_line = message.content.strip().splitlines()[0]
            return first_line[:57] + "..." if len(first_line) > 60 else first_line
    return "Untitled chat"

def row_to_chat(row: sqlite3.Row, include_messages=False):
    messages = load_messages(row["messages"])
    chat = {
        "id": row["id"],
        "title": row["title"],
        "model": row["model"],
        "folder_id": row["folder_id"],
        "summary": row["summary"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "message_count": len(messages),
    }
    if include_messages:
        chat["messages"] = messages
    return chat

def field_was_provided(payload: BaseModel, field_name: str):
    fields_set = getattr(payload, "model_fields_set", None)
    if fields_set is None:
        fields_set = getattr(payload, "__fields_set__", set())
    return field_name in fields_set

init_database()

@app.get("/api/models")
async def get_models():
    """
    Scans available local models. Attempts to run the `ollama list` command.
    Falls back to querying the Ollama API (/api/tags) if the command fails
    or if Ollama is running on a different host.
    """
    models = []
    
    # 1. Try running 'ollama list' command as requested
    try:
        result = subprocess.run(
            ["ollama", "list"],
            capture_output=True,
            text=True,
            check=False
        )
        if result.returncode == 0:
            lines = result.stdout.strip().split("\n")
            if len(lines) > 1:
                # First line is header: NAME | ID | SIZE | MODIFIED
                for line in lines[1:]:
                    parts = line.split()
                    if parts:
                        models.append(parts[0])
    except Exception as e:
        print(f"Subprocess 'ollama list' failed: {e}. Falling back to HTTP API.")

    # 2. If subprocess failed or returned empty list, try Ollama HTTP API
    if not models:
        ollama_host = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{ollama_host}/api/tags")
                if response.status_code == 200:
                    data = response.json()
                    for model_info in data.get("models", []):
                        models.append(model_info.get("name"))
        except Exception as e:
            print(f"Ollama API tags query failed: {e}")

    # Deduplicate while preserving order
    unique_models = []
    for m in models:
        if m not in unique_models:
            unique_models.append(m)

    # If still empty, return a default model
    if not unique_models:
        # We don't want an empty menu, so return a placeholder
        unique_models = ["llama3:latest", "mistral:latest", "gemma:latest"]

    return {"models": unique_models}

@app.get("/api/chats")
async def list_chats():
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, title, model, messages, folder_id, summary, created_at, updated_at
            FROM chats
            ORDER BY updated_at DESC
            """
        ).fetchall()
    return {"chats": [row_to_chat(row) for row in rows]}

@app.post("/api/chats")
async def create_chat(payload: StoredChatPayload):
    chat_id = str(uuid4())
    now = utc_now()
    title = (payload.title or "").strip() or default_chat_title(payload.messages)

    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO chats (id, title, model, messages, folder_id, summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                chat_id,
                title,
                payload.model,
                dump_messages(payload.messages),
                payload.folder_id,
                payload.summary,
                now,
                now,
            ),
        )
        row = conn.execute(
            """
            SELECT id, title, model, messages, folder_id, summary, created_at, updated_at
            FROM chats
            WHERE id = ?
            """,
            (chat_id,),
        ).fetchone()

    return row_to_chat(row, include_messages=True)

@app.get("/api/chats/{chat_id}")
async def get_chat(chat_id: str):
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT id, title, model, messages, folder_id, summary, created_at, updated_at
            FROM chats
            WHERE id = ?
            """,
            (chat_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Chat not found.")

    return row_to_chat(row, include_messages=True)

@app.put("/api/chats/{chat_id}")
async def update_chat(chat_id: str, payload: StoredChatUpdate):
    with get_db() as conn:
        existing = conn.execute(
            """
            SELECT id, title, model, messages, folder_id, summary, created_at, updated_at
            FROM chats
            WHERE id = ?
            """,
            (chat_id,),
        ).fetchone()

        if existing is None:
            raise HTTPException(status_code=404, detail="Chat not found.")

        existing_messages = load_messages(existing["messages"])
        messages = payload.messages if payload.messages is not None else [
            ChatMessage(**message) for message in existing_messages
        ]
        title = (
            payload.title.strip()
            if payload.title is not None and payload.title.strip()
            else existing["title"]
        )

        conn.execute(
            """
            UPDATE chats
            SET title = ?, model = ?, messages = ?, folder_id = ?, summary = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                title,
                payload.model if field_was_provided(payload, "model") else existing["model"],
                dump_messages(messages),
                payload.folder_id if field_was_provided(payload, "folder_id") else existing["folder_id"],
                payload.summary if field_was_provided(payload, "summary") else existing["summary"],
                utc_now(),
                chat_id,
            ),
        )
        row = conn.execute(
            """
            SELECT id, title, model, messages, folder_id, summary, created_at, updated_at
            FROM chats
            WHERE id = ?
            """,
            (chat_id,),
        ).fetchone()

    return row_to_chat(row, include_messages=True)

@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: str):
    with get_db() as conn:
        result = conn.execute("DELETE FROM chats WHERE id = ?", (chat_id,))

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Chat not found.")

    return {"status": "success"}

@app.post("/api/chat")
async def chat(payload: ChatPayload):
    """
    Handles streaming chat using SSE. Integrates session context if requested.
    """
    ollama_host = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
    
    # Formulate messages list
    messages = [msg.dict() for msg in payload.messages]
    
    # Inject context if active and requested
    if payload.use_context and session_context["text"]:
        # Find the system prompt if it exists, or insert one
        system_msg_idx = -1
        for i, msg in enumerate(messages):
            if msg["role"] == "system":
                system_msg_idx = i
                break
        
        context_instruction = (
            f"Use the following context to help answer the user's questions:\n"
            f"--- START CONTEXT ---\n{session_context['text']}\n--- END CONTEXT ---\n"
        )
        
        if system_msg_idx != -1:
            messages[system_msg_idx]["content"] = (
                context_instruction + "\n" + messages[system_msg_idx]["content"]
            )
        else:
            messages.insert(0, {
                "role": "system",
                "content": context_instruction + "You are a helpful assistant."
            })

    async def stream_ollama():
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                async with client.stream(
                    "POST",
                    f"{ollama_host}/api/chat",
                    json={
                        "model": payload.model,
                        "messages": messages,
                        "stream": True
                    }
                ) as response:
                    if response.status_code != 200:
                        yield f"data: {json.dumps({'error': f'Ollama returned status {response.status_code}'})}\n\n"
                        return
                    
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                            content = data.get("message", {}).get("content", "")
                            done = data.get("done", False)
                            yield f"data: {json.dumps({'content': content, 'done': done})}\n\n"
                        except json.JSONDecodeError:
                            continue
            except Exception as e:
                yield f"data: {json.dumps({'error': f'Connection to Ollama failed: {str(e)}'})}\n\n"

    return StreamingResponse(stream_ollama(), media_type="text/event-stream")

@app.post("/api/context")
async def add_context(
    text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    """
    Endpoints to upload or set text/file context.
    """
    if file:
        try:
            contents = await file.read()
            # Decode content as text
            session_context["text"] = contents.decode("utf-8", errors="ignore")
            filename = file.filename
            return {"status": "success", "message": f"File '{filename}' loaded as context.", "length": len(session_context["text"])}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")
    elif text is not None:
        session_context["text"] = text
        return {"status": "success", "message": "Text context loaded.", "length": len(session_context["text"])}
    
    raise HTTPException(status_code=400, detail="No text or file provided.")

@app.delete("/api/context")
async def clear_context():
    """
    Clears the active session context.
    """
    session_context["text"] = ""
    return {"status": "success", "message": "Context cleared."}

@app.get("/api/context")
async def get_context():
    """
    Retrieves information about current context status.
    """
    length = len(session_context["text"])
    preview = session_context["text"][:200] + "..." if length > 200 else session_context["text"]
    return {
        "active": length > 0,
        "length": length,
        "preview": preview
    }

# Mount the static files directory at root
# Note: Ensure static folder exists
os.makedirs("static", exist_ok=True)
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # Start the server
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
