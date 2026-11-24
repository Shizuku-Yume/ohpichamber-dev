#!/usr/bin/env node
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';

const ContentPartSchema = z.looseObject({ text: z.string().optional() });
const MessageSchema = z.looseObject({
  role: z.string(),
  content: z.union([z.string(), z.array(ContentPartSchema)]).nullish(),
});
const ToolSchema = z.looseObject({
  name: z.string().optional(),
  function: z.looseObject({
    name: z.string(),
    parameters: z.looseObject({
      properties: z.looseObject({}).optional(),
    }).optional(),
  }).optional(),
});
const ChatCompletionRequestSchema = z.looseObject({
  model: z.string().optional(),
  stream: z.boolean().optional(),
  messages: z.array(MessageSchema).optional(),
  tools: z.array(ToolSchema).optional(),
});

function textFromContent(content) {
  if (content === null || content === undefined) return '';
  if (!Array.isArray(content)) return content;
  return content.map((part) => part.text ?? '').join('\n');
}

function readJsonBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolveBody(ChatCompletionRequestSchema.parse(raw ? JSON.parse(raw) : {}));
      } catch (error) {
        rejectBody(error);
      }
    });
    req.on('error', rejectBody);
  });
}

function selectToolCall(tools) {
  if (!tools || tools.length === 0) return null;
  const byName = new Map();
  for (const entry of tools) {
    const fn = entry.function ?? (entry.name ? { name: entry.name } : undefined);
    if (fn) byName.set(fn.name, fn);
  }
  if (byName.has('vibe_spawn')) {
    return {
      name: 'vibe_spawn',
      arguments: JSON.stringify({
        cli: 'fast',
        name: 'home-disk-usage-2',
        prompt: 'Inspect workspace disk usage and summarize findings.',
      }),
    };
  }
  const taskTool = byName.get('task');
  if (taskTool) {
    const properties = taskTool.parameters?.properties;
    const isBatch = Boolean(properties && 'tasks' in properties);
    const args = isBatch
      ? {
        context: 'Check 8 live subagent fixture',
        tasks: [{
          name: 'home-disk-usage-2',
          agent: 'sonic',
          task: 'Inspect workspace disk usage and summarize findings.',
          solutionSpace: 'read-only workspace inspection',
        }],
      }
      : {
        name: 'home-disk-usage-2',
        agent: 'sonic',
        task: 'Inspect workspace disk usage and summarize findings.',
        solutionSpace: 'read-only workspace inspection',
      };
    return {
      name: 'task',
      arguments: JSON.stringify(args),
    };
  }
  return null;
}

function buildPlan(body) {
  const messages = body.messages ?? [];
  const hasToolResult = messages.some((message) => message.role === 'tool');
  const userMessages = messages.filter((message) => message.role === 'user');
  const lastUserText = userMessages.length > 0 ? textFromContent(userMessages[userMessages.length - 1].content) : '';
  const systemText = messages
    .filter((message) => message.role === 'system')
    .map((message) => textFromContent(message.content))
    .join('\n');

  if (!body.tools || body.tools.length === 0) {
    const isTitleRequest = /title/i.test(systemText) || /title/i.test(lastUserText);
    return {
      kind: 'text',
      delayMs: 0,
      text: isTitleRequest ? 'Check 8 Subagent Demo' : 'Ready.',
    };
  }

  if (!hasToolResult && lastUserText.includes('[CHECK8_SUBAGENT]')) {
    const toolCall = selectToolCall(body.tools);
    if (toolCall) {
      return {
        kind: 'tool_call',
        delayMs: 0,
        toolCall,
      };
    }
  }

  if (hasToolResult) {
    return {
      kind: 'text',
      delayMs: 0,
      text: 'Subagent `home-disk-usage-2` completed and reported its findings.',
    };
  }

  return {
    kind: 'text',
    delayMs: 150,
    text: '## Disk Usage Report\n\n- Subagent `home-disk-usage-2` inspected the workspace.\n- Disk usage is healthy (Check 8 live fixture).',
  };
}

function sendSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function handleChatCompletions(req, res, holdMs) {
  const body = await readJsonBody(req);
  const model = body.model && body.model.length > 0 ? body.model : 'mock-gpt';
  const plan = buildPlan(body);
  const id = `chatcmpl_check8_${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  if (plan.delayMs > 0 || (holdMs > 0 && plan.kind === 'text' && (body.tools?.length ?? 0) > 0)) {
    const waitMs = Math.max(plan.delayMs, holdMs);
    if (waitMs > 0) await new Promise((resolveWait) => setTimeout(resolveWait, waitMs));
  }

  if (body.stream === false) {
    const message = plan.kind === 'tool_call'
      ? {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_check8_subagent_1',
          type: 'function',
          function: plan.toolCall,
        }],
      }
      : { role: 'assistant', content: plan.text };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id,
      object: 'chat.completion',
      created,
      model,
      choices: [{
        index: 0,
        message,
        finish_reason: plan.kind === 'tool_call' ? 'tool_calls' : 'stop',
      }],
      usage: { prompt_tokens: 16, completion_tokens: 24, total_tokens: 40 },
    }));
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  if (plan.kind === 'tool_call') {
    sendSse(res, {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [{
            index: 0,
            id: 'call_check8_subagent_1',
            type: 'function',
            function: { name: plan.toolCall.name, arguments: '' },
          }],
        },
        finish_reason: null,
      }],
    });
    sendSse(res, {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{
            index: 0,
            function: { arguments: plan.toolCall.arguments },
          }],
        },
        finish_reason: null,
      }],
    });
    sendSse(res, {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 16, completion_tokens: 24, total_tokens: 40 },
    });
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  sendSse(res, {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta: { role: 'assistant', content: plan.text }, finish_reason: null }],
  });
  sendSse(res, {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    usage: { prompt_tokens: 16, completion_tokens: 24, total_tokens: 40 },
  });
  res.write('data: [DONE]\n\n');
  res.end();
}

export function startCheck8MockProvider({ port = 18477, host = '127.0.0.1', holdMs = 150 } = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${host}:${port}`);
    if (req.method === 'GET' && url.pathname === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        object: 'list',
        data: [{ id: 'mock-gpt', object: 'model', created: 1700000000, owned_by: 'multiprov' }],
      }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
      void handleChatCompletions(req, res, holdMs).catch((error) => {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return new Promise((resolveServer, rejectServer) => {
    server.once('error', rejectServer);
    server.listen(port, host, () => resolveServer(server));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.MOCK_PROVIDER_PORT || 18477);
  const holdMs = Number(process.env.MOCK_PROVIDER_HOLD_MS || 150);
  startCheck8MockProvider({ port, holdMs }).then(() => {
    process.stdout.write(`Check-8 mock provider listening on http://127.0.0.1:${port}/v1\n`);
  });
}
