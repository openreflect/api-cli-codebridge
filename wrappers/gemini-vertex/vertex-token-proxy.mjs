#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';

const PORT = Number(process.env.VERTEX_PROXY_PORT || 8091);
const HOST = process.env.VERTEX_PROXY_HOST || '127.0.0.1';
const CREDS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || './path/to/vertex-service-account.json';
const QUOTA_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'YOUR_PROJECT_ID';
const DEFAULT_MODEL = process.env.VERTEX_MODEL || 'gemini-3.1-pro-preview';
const TOKEN_URI_FALLBACK = 'https://oauth2.googleapis.com/token';

const sa = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
const tokenUri = sa.token_uri || TOKEN_URI_FALLBACK;
let tokenCache = { accessToken: null, expiresAt: 0 };
let inflightTokenPromise = null;

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function signJwtAssertion() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: tokenUri,
    iat: now,
    exp: now + 3600
  };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaim = base64url(JSON.stringify(claim));
  const signingInput = `${encodedHeader}.${encodedClaim}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(sa.private_key, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${signingInput}.${signature}`;
}

function httpsJson({ hostname, path, method = 'POST', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: 'https:',
      hostname,
      port: 443,
      path,
      method,
      headers
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode || 0, headers: res.headers, text });
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('upstream timeout')));
    if (body) req.write(body);
    req.end();
  });
}

async function fetchAccessToken() {
  const now = Date.now();
  if (tokenCache.accessToken && now < tokenCache.expiresAt - 120000) return tokenCache.accessToken;
  if (inflightTokenPromise) return inflightTokenPromise;
  inflightTokenPromise = (async () => {
    try {
      const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signJwtAssertion()
      }).toString();
      const url = new URL(tokenUri);
      const resp = await httpsJson({
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body)
        },
        body
      });
      if (resp.status < 200 || resp.status >= 300) {
        throw new Error(`token exchange failed: ${resp.status} ${resp.text}`);
      }
      const json = JSON.parse(resp.text);
      tokenCache = {
        accessToken: json.access_token,
        expiresAt: Date.now() + ((json.expires_in || 3600) * 1000)
      };
      return tokenCache.accessToken;
    } finally {
      inflightTokenPromise = null;
    }
  })();
  return inflightTokenPromise;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}


function sanitizeSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(sanitizeSchema);
  
  const result = {};
  
  if (schema.type !== undefined) {
    if (Array.isArray(schema.type)) {
      result.type = schema.type.find(t => t !== 'null') || 'string';
    } else {
      result.type = schema.type;
    }
  }
  
  if (schema.description !== undefined) result.description = schema.description;
  if (schema.format !== undefined) result.format = schema.format;
  if (schema.nullable !== undefined) result.nullable = schema.nullable;
  
  if (schema.enum !== undefined) {
    result.enum = schema.enum;
  } else if (schema.const !== undefined) {
    result.enum = [schema.const];
  }
  
  if (schema.items !== undefined) {
    result.items = sanitizeSchema(schema.items);
    if (!result.type) result.type = 'array';
  }
  
  if (schema.properties !== undefined) {
    result.properties = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      result.properties[k] = sanitizeSchema(v);
    }
    if (!result.type) result.type = 'object';
  }
  
  if (schema.required !== undefined) result.required = schema.required;
  
  // Fallbacks
  if (!result.type) {
    if (result.enum) {
      result.type = typeof result.enum[0] === 'number' ? 'number' : 'string';
    } else {
      result.type = 'string';
    }
  }
  
  return result;
}

function convertTools(openaiTools) {
  if (!openaiTools || !openaiTools.length) return undefined;
  const functionDeclarations = openaiTools
    .filter(t => t.type === 'function' && t.function)
    .map(t => ({
      name: t.function.name,
      description: t.function.description,
      parameters: sanitizeSchema(t.function.parameters)
    }));
  return functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined;
}

function openAiMessagesToVertexContents(messages = []) {
  const contents = [];
  let systemText = '';
  for (const msg of messages) {
    const role = msg?.role;
    const parts = [];

    if (role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.type === 'function' && tc.function) {
          let args = {};
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch(e) {}
          
          let thoughtSignature = undefined;
          if (Array.isArray(msg.reasoning_details)) {
             const detail = msg.reasoning_details.find(d => d.id === tc.id && d.type === 'reasoning.encrypted');
             if (detail && detail.data) {
               thoughtSignature = detail.data;
             }
          }
          
          const part = { functionCall: { name: tc.function.name, args } };
          if (thoughtSignature) part.thoughtSignature = thoughtSignature;
          parts.push(part);
        }
      }
    }

    if (role === 'tool') {
      let contentObj = { result: msg.content };
      try { 
        const parsed = JSON.parse(msg.content); 
        if (typeof parsed === 'object') contentObj = parsed;
      } catch(e) {}
      parts.push({
        functionResponse: {
          name: msg.name || 'unknown_function',
          response: { name: msg.name || 'unknown_function', content: contentObj }
        }
      });
    } else {
      const content = msg?.content;
      if (typeof content === 'string') {
        if (content) parts.push({ text: content });
      } else if (Array.isArray(content)) {
        for (const item of content) {
          if (item?.type === 'text' && item.text) {
            parts.push({ text: item.text });
          } else if (item?.type === 'image_url' && item.image_url?.url) {
             const match = item.image_url.url.match(/^data:(image\/[^;]+);base64,(.+)$/);
             if (match) {
               parts.push({
                 inlineData: {
                   mimeType: match[1],
                   data: match[2]
                 }
               });
             }
          }
        }
      }
    }

    if (!parts.length) continue;

    if (role === 'system') {
      systemText += parts.map((p) => p.text).join('\n') + '\n';
      continue;
    }

    const vertexRole = (role === 'assistant') ? 'model' : 'user';

    if (contents.length > 0 && contents[contents.length - 1].role === vertexRole) {
      contents[contents.length - 1].parts.push(...parts);
    } else {
      contents.push({ role: vertexRole, parts });
    }
  }
  return { contents, systemInstruction: systemText.trim() ? { parts: [{ text: systemText.trim() }] } : undefined };
}

function buildVertexRequest(body) {
  const { contents, systemInstruction } = openAiMessagesToVertexContents(body.messages || []);
  const tools = convertTools(body.tools);
  const generationConfig = {};
  const maxTokens = body.max_completion_tokens ?? body.max_tokens;
  
  if (typeof body.temperature === 'number') generationConfig.temperature = body.temperature;
  if (typeof body.top_p === 'number') generationConfig.topP = body.top_p;
  if (typeof maxTokens === 'number') generationConfig.maxOutputTokens = maxTokens;
  
  if (body.reasoning_effort || body.enable_thinking) {
    const level = (body.reasoning_effort || '').toLowerCase();
    const thinkingLevel = level === 'high' ? 'HIGH' :
                          level === 'medium' ? 'MEDIUM' :
                          level === 'low' ? 'LOW' : 'MINIMAL';
    generationConfig.thinkingConfig = {
      includeThoughts: true,
      thinkingLevel
    };
  }

  const req = { contents };
  if (tools) req.tools = tools;
  if (systemInstruction) req.systemInstruction = systemInstruction;
  if (Object.keys(generationConfig).length) req.generationConfig = generationConfig;
  return req;
}

function pickTextAndToolsFromVertex(json) {
  const cand = json?.candidates?.[0];
  const parts = cand?.content?.parts || [];
  const textParts = [];
  const toolCalls = [];

  for (const p of parts) {
    if (p.text) textParts.push(p.text);
    if (p.functionCall) {
      const tc = {
        id: `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`,
        type: 'function',
        function: {
          name: p.functionCall.name,
          arguments: JSON.stringify(p.functionCall.args || {})
        }
      };
      if (p.thoughtSignature) {
        tc.thoughtSignature = p.thoughtSignature;
      }
      toolCalls.push(tc);
    }
  }
  
  let finishReason = cand?.finishReason ? String(cand.finishReason).toLowerCase() : 'stop';
  if (toolCalls.length > 0) finishReason = 'tool_calls';

  return {
    text: textParts.join(''),
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    finishReason
  };
}

function usageFromVertex(json, promptText, completionText) {
  const meta = json?.usageMetadata || {};
  return {
    prompt_tokens: meta.promptTokenCount || 0,
    completion_tokens: meta.candidatesTokenCount || 0,
    total_tokens: meta.totalTokenCount || 0,
    prompt_tokens_details: undefined,
    completion_tokens_details: undefined,
    _approx_prompt_chars: promptText?.length || 0,
    _approx_completion_chars: completionText?.length || 0
  };
}

function sendJson(res, status, obj, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(obj));
}

function sendSseChunk(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

async function callVertexChat(body) {
  const model = body.model || DEFAULT_MODEL;
  const vertexBody = JSON.stringify(buildVertexRequest(body));
  const token = await fetchAccessToken();
  const path = `/v1/projects/${encodeURIComponent(QUOTA_PROJECT)}/locations/global/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
  const resp = await httpsJson({
    hostname: 'aiplatform.googleapis.com',
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(vertexBody),
      'Authorization': `Bearer ${token}`,
      'x-goog-user-project': QUOTA_PROJECT
    },
    body: vertexBody
  });
  return { model, ...resp };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/healthz') {
      sendJson(res, 200, { ok: true, quotaProject: QUOTA_PROJECT, defaultModel: DEFAULT_MODEL });
      return;
    }
    if (req.method === 'GET' && req.url === '/v1/models') {
      sendJson(res, 200, {
        object: 'list',
        data: [{ id: DEFAULT_MODEL, object: 'model', created: 0, owned_by: 'google-vertex' }]
      });
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      const body = await readJsonBody(req);
      const completionId = `chatcmpl-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
      const created = Math.floor(Date.now() / 1000);
      const stream = !!body.stream;
      const upstream = await callVertexChat(body);
      
      if (upstream.status < 200 || upstream.status >= 300) {
        sendJson(res, upstream.status || 502, {
          error: {
            message: upstream.text,
            type: 'upstream_error',
            provider: 'google-vertex'
          }
        });
        return;
      }
      
      const json = JSON.parse(upstream.text);
      const { text, toolCalls, finishReason } = pickTextAndToolsFromVertex(json);
      const usage = usageFromVertex(json, JSON.stringify(body.messages || []), text);

      if (stream) {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'connection': 'keep-alive'
        });
        sendSseChunk(res, {
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model: upstream.model,
          choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]
        });
        
        if (text) {
          sendSseChunk(res, {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model: upstream.model,
            choices: [{ index: 0, delta: { content: text }, finish_reason: null }]
          });
        }
        
        if (toolCalls) {
          const reasoningDetails = [];
          toolCalls.forEach(tc => {
            if (tc.thoughtSignature) {
              reasoningDetails.push({
                type: 'reasoning.encrypted',
                id: tc.id,
                data: tc.thoughtSignature
              });
              delete tc.thoughtSignature; // Remove from standard tool_calls array
            }
          });
          
          const toolCallChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model: upstream.model,
            choices: [{
              index: 0,
              delta: {
                tool_calls: toolCalls.map((tc, idx) => ({
                  index: idx,
                  id: tc.id,
                  type: tc.type,
                  function: tc.function
                }))
              },
              finish_reason: null
            }]
          };
          
          if (reasoningDetails.length > 0) {
             toolCallChunk.choices[0].delta.reasoning_details = reasoningDetails;
          }
          sendSseChunk(res, toolCallChunk);
        }
        
        sendSseChunk(res, {
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model: upstream.model,
          choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
          usage
        });
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      sendJson(res, 200, {
        id: completionId,
        object: 'chat.completion',
        created,
        model: upstream.model,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: text, tool_calls: toolCalls },
          finish_reason: finishReason
        }],
        usage
      });
      return;
    }

    sendJson(res, 404, { error: { message: `not found: ${req.method} ${req.url}` } });
  } catch (err) {
    sendJson(res, 500, { error: { message: String(err?.message || err), type: 'proxy_error' } });
  }
});

server.requestTimeout = 0;
server.headersTimeout = 65000;
server.keepAliveTimeout = 65000;
server.listen(PORT, HOST, () => {
  console.log(`vertex-token-proxy listening on http://${HOST}:${PORT}`);
  console.log(`quota project: ${QUOTA_PROJECT}`);
  console.log(`default model: ${DEFAULT_MODEL}`);
  console.log(`creds path: ${CREDS_PATH}`);
});
