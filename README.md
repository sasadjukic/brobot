# BroBot

BroBot is my personal fun chatbot. I use it for light research, general chat, quick explanations, and those small "wait, what is the difference between these two things?" questions that show up during the day.

It is intentionally local-first. BroBot talks to small local LLMs through Ollama, so it is useful for experimenting with 3B, 8B, and other lightweight models without turning every random thought into a cloud request.

## What BroBot Does

- Chat with local Ollama models from a simple web UI.
- Stream model responses as they are generated.
- Save chat history locally with SQLite.
- Reopen previous chats from the sidebar.
- Create folders for related chats.
- Move chats into folders or back to Unfiled.
- Rename saved chats and folders.
- Delete chats from history when they are no longer useful.
- Upload or paste text/code as temporary context for a session.
- Auto-title saved chats from the first user message.

## Why I Built It

BroBot is not trying to be an enterprise AI platform with a tie and a compliance department.

It is a local playground for learning, thinking, testing small models, and having a helpful assistant nearby. Sometimes I ask it about programming. Sometimes I ask it about food. Sometimes I just want a second brain that runs on my machine and does not mind being asked oddly specific questions.

## Tech Stack

- Python
- FastAPI
- SQLite
- Vanilla HTML/CSS/JavaScript
- Ollama for local model inference

## Requirements

- Python 3
- Ollama installed and running
- At least one local Ollama model pulled

Example:

```bash
ollama pull llama3.2:3b
```

Use whichever local models you prefer. BroBot is especially meant to be comfortable with smaller local models.

## Running BroBot

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the server:

```bash
uvicorn main:app --host 127.0.0.1 --port 8000
```

Then open:

```text
http://127.0.0.1:8000
```

If Ollama is running somewhere other than `http://localhost:11434`, set `OLLAMA_HOST` before starting BroBot.

## Local Data

BroBot stores saved chats and folders in:

```text
data/brobot.sqlite3
```

That database is local to the project. Delete it only if you intentionally want to wipe saved chat history.

## Current Status

BroBot currently supports a practical local chat workflow:

- pick a local model
- ask questions
- save and revisit chats
- organize related chats into folders
- rename, move, and delete history items
- add temporary context when needed

It is small, useful, and still very much allowed to be a little weird.

## Maybe Later

Ideas I might explore later:

- Bot personalities or presets.
- Local-model-assisted web search.
- Better summaries for saved chats.
- Automatic folder suggestions.
- Search across chat history.
- Exporting chats.

No promises. BroBot grows when I feel like giving it new tricks.
