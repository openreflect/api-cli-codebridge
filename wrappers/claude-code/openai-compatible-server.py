"""
Claude Code OpenAI-Compatible Proxy
====================================
Exposes an OpenAI-compatible /v1/chat/completions endpoint that routes
requests through Claude Code CLI via the Agent SDK.

Uses your existing Claude Code subscription; no separate API key needed.

NOTE: Each request spawns a Claude Code CLI subprocess (~5-10s overhead).
      Clients must have timeouts >= 60s.

Usage:
    python server.py [--port 8082] [--host 0.0.0.0]

Then point any OpenAI-compatible client at http://localhost:8082/v1
"""

import argparse
import os
import asyncio
import json
import time
import uuid
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from claude_agent_sdk import (
    query,
    ClaudeAgentOptions,
    AssistantMessage,
    ResultMessage,
    SystemMessage,
    TextBlock,
)

# ---------------------------------------------------------------------------
# Session store: conversation_id -> claude code session_id
# Enables multi-turn by resuming the same Claude Code session.
# ---------------------------------------------------------------------------
sessions: dict[str, str] = {}

app = FastAPI(title="Claude Code Proxy", version="0.1.0")


# ---------------------------------------------------------------------------
# /v1/models
# ---------------------------------------------------------------------------
@app.get("/v1/models")
async def list_models():
    return {
        "object": "list",
        "data": [
            {
                "id": "claude-opus-4-6",
                "object": "model",
                "created": 1700000000,
                "owned_by": "anthropic",
            },
            {
                "id": "claude-sonnet-4-6",
                "object": "model",
                "created": 1700000000,
                "owned_by": "anthropic",
            },
        ],
    }


# ---------------------------------------------------------------------------
# /v1/chat/completions
# ---------------------------------------------------------------------------
@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    body = await request.json()

    messages = body.get("messages", [])
    stream = body.get("stream", False)
    model = body.get("model", "claude-opus-4-6")

    # Extract system prompt if present
    system_prompt = None
    chat_messages = []
    for msg in messages:
        if msg["role"] == "system":
            system_prompt = _extract_text(msg)
        else:
            chat_messages.append(msg)

    # Build the prompt: last user message for resumed sessions,
    # full formatted history for new sessions
    conv_id = request.headers.get("x-conversation-id")
    session_id = sessions.get(conv_id) if conv_id else None

    if session_id:
        # Resumed session: only send the latest user message.
        prompt = _last_user_message(chat_messages)
    else:
        # New session: format the full conversation into the prompt.
        prompt = _format_messages(chat_messages)

    options = _build_options(system_prompt, session_id)

    completion_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    created = int(time.time())

    if stream:
        return StreamingResponse(
            _stream_response(prompt, options, completion_id, created, model, conv_id),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    # Non-streaming
    full_text, new_session_id = await _collect_response(prompt, options)

    if conv_id and new_session_id:
        sessions[conv_id] = new_session_id

    return JSONResponse({
        "id": completion_id,
        "object": "chat.completion",
        "created": created,
        "model": model,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": full_text},
            "finish_reason": "stop",
        }],
        "usage": {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        },
    })


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_text(msg: dict) -> str:
    content = msg.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(
            part.get("text", "") for part in content if part.get("type") == "text"
        )
    return str(content)


def _last_user_message(messages: list[dict]) -> str:
    for msg in reversed(messages):
        if msg["role"] == "user":
            return _extract_text(msg)
    return ""


def _format_messages(messages: list[dict]) -> str:
    """Format OpenAI-style messages into a single prompt string."""
    if len(messages) == 1 and messages[0]["role"] == "user":
        return _extract_text(messages[0])

    parts = []
    for msg in messages:
        role = msg["role"].capitalize()
        text = _extract_text(msg)
        parts.append(f"{role}: {text}")
    return "\n\n".join(parts)


def _build_options(
    system_prompt: Optional[str] = None,
    session_id: Optional[str] = None,
) -> ClaudeAgentOptions:
    kwargs = {
        "cwd": os.environ.get("CODEBRIDGE_CLAUDE_CWD", "."),
        "permission_mode": "acceptEdits",
        "allowed_tools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    }
    if session_id:
        kwargs["resume"] = session_id
    if system_prompt:
        kwargs["system_prompt"] = system_prompt
    return ClaudeAgentOptions(**kwargs)


async def _collect_response(
    prompt: str, options: ClaudeAgentOptions
) -> tuple[str, Optional[str]]:
    """Run query and collect the full response text + session ID."""
    full_text = ""
    new_session_id = None

    async for message in query(prompt=prompt, options=options):
        if isinstance(message, SystemMessage) and message.subtype == "init":
            new_session_id = message.data.get("session_id")
        elif isinstance(message, ResultMessage):
            full_text = message.result or full_text
        elif isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    full_text += block.text

    return full_text, new_session_id


async def _stream_response(
    prompt: str,
    options: ClaudeAgentOptions,
    completion_id: str,
    created: int,
    model: str,
    conv_id: Optional[str],
):
    """Yield OpenAI-compatible SSE chunks from the Agent SDK stream."""

    def _chunk(delta: dict, finish_reason: Optional[str] = None) -> str:
        return (
            "data: "
            + json.dumps({
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model,
                "choices": [{
                    "index": 0,
                    "delta": delta,
                    "finish_reason": finish_reason,
                }],
            })
            + "\n\n"
        )

    # Opening chunk with role
    yield _chunk({"role": "assistant"})

    new_session_id = None
    sent_result = False

    async for message in query(prompt=prompt, options=options):
        if isinstance(message, SystemMessage) and message.subtype == "init":
            new_session_id = message.data.get("session_id")

        elif isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock) and block.text:
                    yield _chunk({"content": block.text})
                    sent_result = True

        elif isinstance(message, ResultMessage):
            # ResultMessage.result may duplicate AssistantMessage text.
            # Only yield if we haven't already sent content.
            if not sent_result and message.result:
                yield _chunk({"content": message.result})

    if conv_id and new_session_id:
        sessions[conv_id] = new_session_id

    # Closing chunks
    yield _chunk({}, finish_reason="stop")
    yield "data: [DONE]\n\n"


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="Claude Code OpenAI-Compatible Proxy")
    parser.add_argument("--port", type=int, default=8082)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    args = parser.parse_args()

    print(f"Starting Claude Code proxy on {args.host}:{args.port}")
    print(f"Endpoint: http://{args.host}:{args.port}/v1/chat/completions")
    uvicorn.run(app, host=args.host, port=args.port)
