import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '../design/atoms/Icon';
import { ModePill } from '../design/atoms/ModePill';
import { StatusDot } from '../design/atoms/StatusDot';
import { AmPhone } from '../design/phone/AmPhone';
import { useStreamingTimeline } from '../design/animations/useStreamingTimeline';
import { useTheme } from '../design/theme/useTheme';
import { fonts } from '../design/tokens/typography';
import { radii } from '../design/tokens/radii';
import { Composer } from './_parts/Composer';
import { UserBubble } from './_parts/Inline';
import { SubHeaderBack } from './_parts/SubHeaderBack';
import {
  StreamCaret,
  StreamCode,
  StreamCodeLine,
  StreamToken,
  StreamToolRow,
  TIMELINE,
  useFadeIn,
  useStatusSwap,
} from './_parts/streaming';

// screen-streaming.jsx port.
// 14s loop. One shared progress value (0 → 14000 ms) drives every
// animated piece via interpolate ranges anchored to TIMELINE.

const PARA_1_TOKENS: { kind: 'word'; text: string }[] | { kind: 'code'; text: string }[] = (
  [
    'Looking', 'at', 'the', 'gate', 'and', 'the', 'session', 'config',
    '—', 'the', 'cleanest', 'spot', 'is', 'in',
    { code: 'permGate.ts' },
    'where', 'we', 'already', 'persist', 'the', 'last', 'choice.',
  ] as const
).map((t) =>
  typeof t === 'string' ? ({ kind: 'word', text: t } as const) : ({ kind: 'code', text: t.code } as const),
) as never;

const PARA_2_TOKENS: { kind: 'word'; text: string }[] | { kind: 'code'; text: string }[] = (
  [
    'Adding', 'a', 'third', 'choice', '—',
    { code: 'always' },
    '—', 'that', 'writes', 'to', 'the', 'host', 'config', 'and', 'short-circuits', 'future', 'prompts.',
  ] as const
).map((t) =>
  typeof t === 'string' ? ({ kind: 'word', text: t } as const) : ({ kind: 'code', text: t.code } as const),
) as never;

type Token = { kind: 'word' | 'code'; text: string };

const CODE_LINES: { sigil: ' ' | '+' | '-'; text: string }[] = [
  { sigil: ' ', text: '  if (always) {' },
  { sigil: '+', text: '    await persistAlways(host);' },
  { sigil: '+', text: '    return Choice.AllowAlways;' },
  { sigil: ' ', text: '  }' },
  { sigil: '-', text: '  return ui.alert(req.title);' },
  { sigil: '+', text: '  return await ui.bottomSheet({' },
  { sigil: '+', text: "    actions: ['Allow','Deny','Always']" },
  { sigil: '+', text: '  });' },
];

export function Streaming() {
  const t = useTheme();
  const progress = useStreamingTimeline();

  // Per-token start times: tokens stream evenly between para start/end.
  const para1Tokens = PARA_1_TOKENS as unknown as Token[];
  const para2Tokens = PARA_2_TOKENS as unknown as Token[];

  const para1Span = TIMELINE.para1End - TIMELINE.para1Start;
  const para2Span = TIMELINE.para2End - TIMELINE.para2Start;

  // Code lines stagger across [codeStart, codeEnd]; each line takes ~1.6× the gap
  // so reveals overlap a touch (less robotic).
  const codeStep = (TIMELINE.codeEnd - TIMELINE.codeStart) / CODE_LINES.length;
  const codeDur = Math.round(codeStep * 1.6);

  // Fade-in styles for the secondary blocks.
  const para2Fade = useFadeIn(progress, TIMELINE.para2Start - 200);
  const editFade = useFadeIn(progress, TIMELINE.codeStart - 300);
  const doneFade = useFadeIn(progress, TIMELINE.doneStart);
  const editStat = useFadeIn(progress, TIMELINE.doneStart);
  const status = useStatusSwap(progress, TIMELINE.doneStart);

  return (
    <AmPhone>
      <SubHeaderBack title="Permission gate UX" subtitle="rpi5:nic-os · feat/perm" />

      <View style={styles.statusStrip}>
        <View style={{ width: 8, height: 8 }}>
          <Animated.View style={[StyleSheet.absoluteFillObject, status.working]}>
            <StatusDot state="run" />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFillObject, status.done]}>
            <StatusDot state="ok" />
          </Animated.View>
        </View>
        <View style={{ height: 18, justifyContent: 'center' }}>
          <Animated.Text
            style={[
              { fontFamily: fonts.sans, fontSize: 12, color: t.ink2, position: 'absolute' },
              status.working,
            ]}>
            amarre is working…
          </Animated.Text>
          <Animated.Text
            style={[
              { fontFamily: fonts.sans, fontSize: 12, color: t.ink2, position: 'absolute' },
              status.done,
            ]}>
            done · 4.2s
          </Animated.Text>
        </View>
        <View style={{ flex: 1 }} />
        <ModePill mode="code" />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <UserBubble>
          add an `always` flag to the perm gate so people don&apos;t get re-asked
        </UserBubble>

        {/* paragraph 1 */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' }}>
          {para1Tokens.map((tok, i) => {
            const startMs = TIMELINE.para1Start + (i / para1Tokens.length) * para1Span;
            return (
              <StreamToken key={i} progress={progress} startMs={startMs}>
                {tok.kind === 'code' ? <StreamCode>{tok.text}</StreamCode> : tok.text}
              </StreamToken>
            );
          })}
          <StreamCaret
            progress={progress}
            visibleStart={TIMELINE.para1Start}
            visibleEnd={TIMELINE.para1End + 200}
          />
        </View>

        <StreamToolRow
          progress={progress}
          startMs={TIMELINE.toolReadStart}
          okAtMs={TIMELINE.toolReadOk}
          icon="file"
          label="Read"
          path="src/extensions/perm.ts"
          meta="148 lines"
        />
        <StreamToolRow
          progress={progress}
          startMs={TIMELINE.toolGrepStart}
          okAtMs={TIMELINE.toolGrepOk}
          icon="folder"
          label="Grep"
          path="ui.alert"
          meta="3 hits"
        />

        {/* paragraph 2 */}
        <Animated.View
          style={[{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' }, para2Fade]}>
          {para2Tokens.map((tok, i) => {
            const startMs = TIMELINE.para2Start + (i / para2Tokens.length) * para2Span;
            return (
              <StreamToken key={i} progress={progress} startMs={startMs}>
                {tok.kind === 'code' ? <StreamCode>{tok.text}</StreamCode> : tok.text}
              </StreamToken>
            );
          })}
          <StreamCaret
            progress={progress}
            visibleStart={TIMELINE.para2Start}
            visibleEnd={TIMELINE.para2End + 200}
          />
        </Animated.View>

        {/* edit card */}
        <Animated.View
          style={[
            {
              backgroundColor: t.bgElev,
              borderColor: t.line,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radii.md,
              overflow: 'hidden',
            },
            editFade,
          ]}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderBottomColor: t.line,
              borderBottomWidth: StyleSheet.hairlineWidth,
            }}>
            <View style={{ width: 8, height: 8 }}>
              <Animated.View style={[StyleSheet.absoluteFillObject, status.working]}>
                <StatusDot state="run" />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFillObject, status.done]}>
                <StatusDot state="ok" />
              </Animated.View>
            </View>
            <Icon name="edit" size={14} color={t.ink2} />
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: t.ink }}>
              Edit
            </Text>
            <Text
              numberOfLines={1}
              style={{ flex: 1, fontFamily: fonts.mono, fontSize: 11, color: t.ink3 }}>
              src/extensions/permGate.ts
            </Text>
            <Animated.Text
              style={[{ fontFamily: fonts.mono, fontSize: 11, color: t.ok }, editStat]}>
              +12 −3
            </Animated.Text>
          </View>
          <View style={{ paddingVertical: 6 }}>
            {CODE_LINES.map((ln, i) => (
              <StreamCodeLine
                key={i}
                progress={progress}
                startMs={TIMELINE.codeStart + i * codeStep}
                durMs={codeDur}
                sigil={ln.sigil}
                text={ln.text}
              />
            ))}
          </View>
        </Animated.View>

        {/* done line */}
        <Animated.View
          style={[
            { flexDirection: 'row', alignItems: 'center', gap: 8 },
            doneFade,
          ]}>
          <Icon name="check" size={14} color={t.ok} />
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: t.ink2 }}>
            done — added <StreamCode>always</StreamCode> ·{' '}
            <Text style={{ fontFamily: fonts.mono, fontSize: 11 }}>+12 −3</Text>
          </Text>
        </Animated.View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <Composer mode="code" working />
    </AmPhone>
  );
}

const styles = StyleSheet.create({
  statusStrip: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    gap: 16,
  },
});
