import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '../design/atoms/Icon';
import { StatusDot, type DotState } from '../design/atoms/StatusDot';
import { AmPhone } from '../design/phone/AmPhone';
import { useTheme } from '../design/theme/useTheme';
import { fonts } from '../design/tokens/typography';
import { radii } from '../design/tokens/radii';
import { useAmarre } from '../lib/AmarreProvider';
import {
  store,
  useAgent,
  useConnection,
  useIsStreaming,
  useMessages,
  useStreamingAssistant,
  useToolExecs,
  type ToolExecState,
} from '../lib/store';
import type {
  AgentMessage,
  AssistantContentBlock,
  ToolCall,
  ToolPartialResult,
} from '../lib/protocol';
import { Composer } from './_parts/Composer';
import { UserBubble } from './_parts/Inline';
import { StatusStrip } from './_parts/StatusStrip';
import { SubHeaderBack } from './_parts/SubHeaderBack';

export function Chat() {
  const t = useTheme();
  const { client } = useAmarre();
  const conn = useConnection();
  const agent = useAgent();
  const messages = useMessages();
  const streaming = useStreamingAssistant();
  const toolExecs = useToolExecs();
  const isStreaming = useIsStreaming();
  const scrollRef = useRef<ScrollView>(null);

  // Redirect to /connect if no live socket.
  useEffect(() => {
    if (conn.status === 'idle' || conn.status === 'closed') {
      router.replace('/connect');
    }
  }, [conn.status]);

  // Auto-scroll on new messages or streaming deltas.
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, streaming?.text.length, toolExecs.size]);

  const onSend = (text: string) => {
    // pi doesn't echo prompt/steer as a message_update event — push optimistically so the bubble appears now.
    store.pushUserMessage(text);
    if (isStreaming) {
      client.send({ type: 'steer', message: text });
    } else {
      client.send({ type: 'prompt', message: text });
    }
  };

  const onStop = () => {
    client.send({ type: 'abort' });
  };

  const subtitle =
    conn.status === 'open'
      ? conn.url
      : conn.status === 'reconnecting'
      ? 'reconnecting…'
      : conn.status;

  return (
    <AmPhone>
      <SubHeaderBack title={agent.sessionName ?? 'amarre'} subtitle={subtitle ?? ''} />
      <StatusStrip
        state={isStreaming ? 'run' : conn.status === 'open' ? 'ok' : 'warn'}
        text={
          isStreaming
            ? 'amarre is working…'
            : conn.status === 'reconnecting'
            ? 'reconnecting…'
            : 'idle'
        }
      />

      {conn.status === 'connecting' && messages.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}>
          {messages.length === 0 && !streaming ? (
            <Text style={[styles.empty, { color: t.ink3 }]}>
              connected. type a message to start.
            </Text>
          ) : null}

          {messages.map((m, idx) => (
            <MessageRow key={`m-${idx}`} message={m} toolExecs={toolExecs} />
          ))}

          {streaming ? <StreamingRow streaming={streaming} toolExecs={toolExecs} /> : null}
        </ScrollView>
      )}

      <Composer mode="code" working={isStreaming} onSend={onSend} onStop={onStop} />
    </AmPhone>
  );
}

// ---------- rows ----------

function MessageRow({
  message,
  toolExecs,
}: {
  message: AgentMessage;
  toolExecs: Map<string, ToolExecState>;
}) {
  if (message.role === 'user') {
    const text = message.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
    if (!text) return null;
    return <UserBubble>{text}</UserBubble>;
  }
  if (message.role === 'assistant') {
    return <AssistantBlocks blocks={message.content} toolExecs={toolExecs} />;
  }
  // toolResult is rendered by its parent assistant message's tool card lookup;
  // skip it as a standalone row.
  return null;
}

function AssistantBlocks({
  blocks,
  toolExecs,
}: {
  blocks: AssistantContentBlock[];
  toolExecs: Map<string, ToolExecState>;
}) {
  return (
    <View style={{ gap: 12 }}>
      {blocks.map((b, idx) => {
        if (b.type === 'text') return <Prose key={idx} text={b.text} />;
        if (b.type === 'thinking') return null;
        if (b.type === 'toolCall') {
          const exec = toolExecs.get(b.id);
          return <ToolBlock key={idx} call={{ id: b.id, name: b.name, arguments: b.arguments }} exec={exec} />;
        }
        return null;
      })}
    </View>
  );
}

function StreamingRow({
  streaming,
  toolExecs,
}: {
  streaming: { text: string; thinking: string; toolCalls: ToolCall[] };
  toolExecs: Map<string, ToolExecState>;
}) {
  return (
    <View style={{ gap: 12 }}>
      {streaming.text ? <Prose text={streaming.text} streaming /> : null}
      {streaming.toolCalls.map((tc) => (
        <ToolBlock key={`s-${tc.id}`} call={tc} exec={toolExecs.get(tc.id)} />
      ))}
    </View>
  );
}

function Prose({ text, streaming }: { text: string; streaming?: boolean }) {
  const t = useTheme();
  return (
    <Text
      style={{
        fontFamily: fonts.sans,
        fontSize: 14,
        lineHeight: 22,
        color: streaming ? t.ink2 : t.ink,
      }}>
      {text}
    </Text>
  );
}

// ---------- tool block ----------

function ToolBlock({ call, exec }: { call: ToolCall; exec: ToolExecState | undefined }) {
  const t = useTheme();
  const argsSummary = oneLineArgs(call.arguments);
  const status: DotState =
    exec?.status === 'done' ? (exec.isError ? 'err' : 'ok') : exec?.status === 'error' ? 'err' : 'run';
  const icon = iconForTool(call.name);
  const meta = exec?.result ? truncate(extractText(exec.result), 30) : exec?.partial ? 'streaming…' : undefined;

  return (
    <View
      style={{
        backgroundColor: t.bgElev,
        borderColor: t.line,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radii.md,
        overflow: 'hidden',
      }}>
      <View style={[styles.cardHead, { borderBottomColor: t.line }]}>
        <StatusDot state={status} />
        <Icon name={icon} size={14} color={t.ink2} />
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: t.ink }}>{call.name}</Text>
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontFamily: fonts.mono, fontSize: 11, color: t.ink3 }}>
          {argsSummary}
        </Text>
        {meta ? <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: t.ink3 }}>{meta}</Text> : null}
      </View>
      {exec?.partial || exec?.result ? (
        <View style={[styles.codeBlock, { backgroundColor: t.codeBg }]}>
          <Text
            numberOfLines={6}
            style={{ fontFamily: fonts.mono, fontSize: 11, color: exec.isError ? t.err : t.ink2, lineHeight: 17 }}>
            {extractText(exec.result ?? exec.partial!)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ---------- helpers ----------

function iconForTool(name: string): IconName {
  const n = name.toLowerCase();
  if (n.includes('bash') || n.includes('shell') || n.includes('exec')) return 'terminal';
  if (n.includes('edit') || n.includes('write')) return 'edit';
  if (n.includes('read') || n.includes('view') || n.includes('cat')) return 'file';
  if (n.includes('grep') || n.includes('search') || n.includes('find') || n.includes('ls') || n.includes('glob')) return 'folder';
  if (n.includes('web') || n.includes('fetch') || n.includes('http')) return 'web';
  return 'sparkle';
}

function oneLineArgs(args: unknown): string {
  if (args == null) return '';
  if (typeof args === 'string') return args;
  if (typeof args !== 'object') return String(args);
  const obj = args as Record<string, unknown>;
  // Prefer common primary fields.
  for (const key of ['command', 'path', 'file_path', 'pattern', 'url', 'query']) {
    const v = obj[key];
    if (typeof v === 'string') return v;
  }
  try {
    return truncate(JSON.stringify(obj), 80);
  } catch {
    return '';
  }
}

function extractText(result: ToolPartialResult): string {
  if (!result?.content) return '';
  return result.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    gap: 18,
  },
  empty: {
    fontFamily: fonts.mono,
    fontSize: 12,
    paddingVertical: 32,
    textAlign: 'center',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  codeBlock: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
