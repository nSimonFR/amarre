import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '../design/atoms/Icon';
import { StatusDot } from '../design/atoms/StatusDot';
import { AmPhone } from '../design/phone/AmPhone';
import { useTheme } from '../design/theme/useTheme';
import { fonts } from '../design/tokens/typography';
import { radii } from '../design/tokens/radii';
import { Composer } from './_parts/Composer';
import { CodeText, ToolRow, UserBubble } from './_parts/Inline';
import { StatusStrip } from './_parts/StatusStrip';
import { SubHeaderBack } from './_parts/SubHeaderBack';

// screen-chat.jsx:5-78 — active session, prose-first, with a live tool card.
export function Chat() {
  const t = useTheme();
  return (
    <AmPhone>
      <SubHeaderBack title="Permission gate UX" subtitle="rpi5:nic-os · feat/perm" />
      <StatusStrip state="run" text="amarre is working…" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <UserBubble>
          add a bottom-sheet permission gate. allow / deny / always.
        </UserBubble>

        <Text style={[styles.prose, { color: t.ink }]}>
          Reading the extension API and the existing
          <CodeText>ui.alert</CodeText>
          path. I&apos;ll replace it with a bottom-sheet UI and persist the &ldquo;always&rdquo; choice in the session config.
        </Text>

        <ToolRow icon="file" label="Read" path="src/extensions/perm.ts" state="ok" meta="148 lines" />
        <ToolRow icon="folder" label="Grep" path="ui.alert" state="ok" meta="3 hits" />

        <Text style={[styles.prose, { color: t.ink }]}>Plan:</Text>
        <View style={{ paddingLeft: 18, gap: 4 }}>
          <Bullet>Replace <CodeText>gate()</CodeText> with a bottom-sheet</Bullet>
          <Bullet>Add <CodeText>always</CodeText> persistence per-host</Bullet>
          <Bullet>Wire up tests for deny, allow, allow-always</Bullet>
        </View>

        <ToolCardLive />

        <View style={styles.streamingRow}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: t.ink3 }}>writing</Text>
          <View style={[styles.streamBar, { backgroundColor: t.line, borderRadius: 7 }]} />
        </View>
      </ScrollView>

      <Composer mode="code" working />
    </AmPhone>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row' }}>
      <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: t.ink, lineHeight: 22 }}>
        •
      </Text>
      <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 14, color: t.ink, lineHeight: 22 }}>
        {children}
      </Text>
    </View>
  );
}

function ToolCardLive() {
  const t = useTheme();
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
        <StatusDot state="run" />
        <Icon name="edit" size={14} color={t.ink2} />
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: t.ink }}>Edit</Text>
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontFamily: fonts.mono, fontSize: 11, color: t.ink3 }}>
          src/extensions/perm.ts
        </Text>
        <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: t.ok }}>+12 −3</Text>
      </View>
      <View style={[styles.codeBlock, { backgroundColor: t.codeBg }]}>
        <CodeLine sigil="-" t={t.ink2}>{'  return ui.alert(req.title);'}</CodeLine>
        <CodeLine sigil="+" t={t.ink}>{'  const choice = await ui.bottomSheet({'}</CodeLine>
        <CodeLine sigil="+" t={t.ink}>{'    title: req.title,'}</CodeLine>
        <CodeLine sigil="+" t={t.ink}>{'    body:  req.summary,'}</CodeLine>
        <CodeLine sigil="+" t={t.ink}>{"    actions: ['Allow', 'Deny', 'Always'],"}</CodeLine>
        <CodeLine sigil="+" t={t.ink}>{'  });'}</CodeLine>
      </View>
    </View>
  );
}

function CodeLine({ sigil, t: color, children }: { sigil: '+' | '-'; t: string; children: string }) {
  return (
    <Text style={{ fontFamily: fonts.mono, fontSize: 11, color, lineHeight: 17 }}>
      <Text style={{ color: sigil === '+' ? '#00b977' : '#ef5d5d', fontFamily: fonts.monoSemiBold }}>
        {sigil}
      </Text>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    gap: 18,
  },
  prose: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 22,
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
  streamingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streamBar: {
    width: 80,
    height: 14,
  },
});
