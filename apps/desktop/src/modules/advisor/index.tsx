/**
 * Advisor 模块 UI 主组件
 * 灵犀演示 · Phase 1 · T-1.2
 *
 * PRD §3.2 实现：
 *   - 顾问式交互（每轮 1 题）
 *   - 三模输入：选项点击（卡片/单选/多选）+ 语音 + 文字
 *   - 实时关联知识库补全（kb_linked 选项 AI 角标）
 *   - 进度条
 *   - AI 响应延迟 ≤ 3s
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '../../theme';

import type {
  AdvisorQuestion,
  AnswerRecord,
  InputMode,
  ScenarioId,
} from './types';
import {
  SCENARIO_TEMPLATES,
  getScenarioTemplate,
  listScenarios,
  renderQuestionFromTemplate,
} from './questions';
import {
  autocompleteForAnswers,
  annotateQuestionsWithKB,
} from './kb_linker';
import { AIClient, getDefaultAIClient } from './ai_client';
import { transcribe, VoiceInputOptions } from './voice_input';

// Re-export pure modules for downstream / tests
export { computeProgress } from './progress';
export type { ProgressInfo } from './progress';
export {
  advisorReducer,
  initialAdvisorState,
} from './controller';
export type {
  AdvisorControllerState,
  AdvisorAction,
} from './controller';
export { SCENARIO_TEMPLATES, listScenarios, renderQuestionFromTemplate, uuidV4 } from './questions';
export type {
  ScenarioTemplate,
  QuestionTemplate,
} from './questions';
export { searchKB, autocompleteForAnswers, annotateQuestionsWithKB } from './kb_linker';
export { AIClient, getDefaultAIClient, setDefaultAIClient, runLatencyProbe } from './ai_client';
export type { LatencyProbeReport } from './ai_client';
export { transcribe, runAccuracyTest, resetMockIndex } from './voice_input';
export type { AccuracyReport } from './voice_input';

// ---- 控制器 hook ----

export interface AdvisorControllerActions {
  pickScenario: (id: ScenarioId) => void;
  answer: (value: string | string[]) => void;
  startOver: () => void;
  answerVoice: () => Promise<void>;
  answerText: (text: string) => void;
}

import type { AdvisorControllerState } from './controller';

export function useAdvisorController(
  client: AIClient = getDefaultAIClient()
): [AdvisorControllerState, AdvisorControllerActions] {
  const [state, setState] = useState<AdvisorControllerState>(initialAdvisorState);

  const pickScenario = useCallback((id: ScenarioId) => {
    setState(s => advisorReducer(s, { type: 'pickScenario', id }));
  }, []);

  const answer = useCallback((value: string | string[]) => {
    setState(s => advisorReducer(s, { type: 'answer', value }));
  }, []);

  const startOver = useCallback(() => {
    setState(s => advisorReducer(s, { type: 'startOver' }));
  }, []);

  const answerVoice = useCallback(async () => {
    setState(s => advisorReducer(s, { type: 'setLoading', loading: true }));
    try {
      const r = await transcribe(null, { preferWhisper: false });
      if (r.transcript) {
        answer(r.transcript);
      }
      setState(s => advisorReducer(s, { type: 'setLoading', loading: false }));
    } catch (e) {
      setState(s =>
        advisorReducer(s, {
          type: 'setError',
          error: e instanceof Error ? e.message : String(e),
        })
      );
    }
  }, [answer]);

  const answerText = useCallback((text: string) => {
    if (!text.trim()) return;
    answer(text.trim());
  }, [answer]);

  return [state, { pickScenario, answer, startOver, answerVoice, answerText }];
}

// ---- UI ----

export interface AdvisorViewProps {
  client?: AIClient;
  voiceOptions?: VoiceInputOptions;
}

export const AdvisorView: React.FC<AdvisorViewProps> = ({ client }) => {
  const { theme } = useTheme();
  const [state, actions] = useAdvisorController(client);

  // 阶段 0：场景选择
  if (!state.scenario) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.title, { color: theme.colors.text }]}>选择你想制作的内容</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          AI 顾问会基于你的选择给出 3-5 个引导问题，每题都带选项可点。
        </Text>
        <ScrollView contentContainerStyle={styles.scenarioList}>
          {listScenarios().map(s => (
            <Pressable
              key={s.id}
              onPress={() => actions.pickScenario(s.id)}
              style={({ pressed }) => [
                styles.scenarioCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[styles.scenarioLabel, { color: theme.colors.text }]}>{s.label}</Text>
              <Text style={[styles.scenarioDesc, { color: theme.colors.textMuted }]}>
                {s.description}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (state.currentQ) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <ProgressBar
          percent={state.progress.percent}
          current={state.progress.current}
          total={state.progress.total}
        />
        {state.kbHint ? (
          <View style={[styles.kbHint, { backgroundColor: theme.colors.surfaceMuted }]}>
            <Text style={[styles.kbHintText, { color: theme.colors.accent }]}>
              💡 {state.kbHint}
            </Text>
          </View>
        ) : null}
        <QuestionCard question={state.currentQ} onAnswer={actions.answer} />
        <InputModeSwitcher
          mode={state.currentQ.input_mode}
          onVoice={actions.answerVoice}
          onText={actions.answerText}
          loading={state.loading}
        />
        <View style={styles.historyRow}>
          <Pressable onPress={actions.startOver}>
            <Text style={[styles.linkText, { color: theme.colors.primary }]}>← 重新开始</Text>
          </Pressable>
        </View>
        {state.error ? (
          <Text style={[styles.errorText, { color: theme.colors.danger }]}>{state.error}</Text>
        ) : null}
      </View>
    );
  }

  // 完成态
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>✓ 需求收集完成</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
        已收集 {state.history.length} 项关键信息
      </Text>
      <ScrollView style={styles.summaryList}>
        {state.history.map((h, i) => (
          <View
            key={i}
            style={[
              styles.summaryRow,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Text style={[styles.summaryMode, { color: theme.colors.textSubtle }]}>{h.mode}</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
              {Array.isArray(h.value) ? h.value.join('、') : h.value}
            </Text>
          </View>
        ))}
      </ScrollView>
      <Pressable
        onPress={actions.startOver}
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: theme.colors.primary, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Text style={styles.primaryBtnText}>开始新一轮</Text>
      </Pressable>
    </View>
  );
};

// ---- 子组件 ----

const ProgressBar: React.FC<{ percent: number; current: number; total: number }> = ({
  percent, current, total,
}) => {
  const { theme } = useTheme();
  return (
    <View style={styles.progressWrap}>
      <View style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceMuted }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: theme.colors.primary, width: `${percent}%` },
          ]}
        />
      </View>
      <Text style={[styles.progressText, { color: theme.colors.textMuted }]}>
        第 {current} / {total} 题 · {percent}%
      </Text>
    </View>
  );
};

const QuestionCard: React.FC<{
  question: AdvisorQuestion;
  onAnswer: (v: string | string[]) => void;
}> = ({ question, onAnswer }) => {
  const { theme } = useTheme();
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (question.input_mode === 'select') {
    return (
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{question.text}</Text>
        {question.options.map(opt => (
          <Pressable
            key={opt.value}
            onPress={() => onAnswer(opt.value)}
            style={({ pressed }) => [
              styles.optionBtn,
              {
                backgroundColor: theme.colors.background,
                borderColor: opt.kb_linked ? theme.colors.accent : theme.colors.border,
                borderWidth: opt.kb_linked ? 2 : 1,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={[styles.optionLabel, { color: theme.colors.text }]}>{opt.label}</Text>
            {opt.kb_linked ? (
              <Text style={[styles.aiTag, { color: theme.colors.accent }]}>AI 推荐</Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    );
  }

  if (question.input_mode === 'select_multi') {
    const toggle = (v: string) => {
      const next = new Set(selected);
      if (next.has(v)) next.delete(v); else next.add(v);
      setSelected(next);
    };
    return (
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{question.text}</Text>
        <Text style={[styles.hint, { color: theme.colors.textSubtle }]}>（可多选）</Text>
        {question.options.map(opt => {
          const isOn = selected.has(opt.value);
          return (
            <Pressable
              key={opt.value}
              onPress={() => toggle(opt.value)}
              style={({ pressed }) => [
                styles.optionBtn,
                {
                  backgroundColor: isOn ? theme.colors.primary : theme.colors.background,
                  borderColor: opt.kb_linked ? theme.colors.accent : theme.colors.border,
                  borderWidth: opt.kb_linked || isOn ? 2 : 1,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.optionLabel,
                  { color: isOn ? '#FFFFFF' : theme.colors.text },
                ]}
              >
                {opt.label}
              </Text>
              {opt.kb_linked && !isOn ? (
                <Text style={[styles.aiTag, { color: theme.colors.accent }]}>AI 推荐</Text>
              ) : null}
            </Pressable>
          );
        })}
        <Pressable
          disabled={selected.size === 0}
          onPress={() => onAnswer(Array.from(selected))}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: selected.size === 0 ? theme.colors.borderStrong : theme.colors.primary,
              opacity: pressed ? 0.8 : 1,
              marginTop: 12,
            },
          ]}
        >
          <Text style={styles.primaryBtnText}>确认 ({selected.size})</Text>
        </Pressable>
      </View>
    );
  }

  if (question.input_mode === 'text') {
    return (
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{question.text}</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="请输入..."
          placeholderTextColor={theme.colors.textSubtle}
          style={[
            styles.textInput,
            {
              borderColor: theme.colors.border,
              color: theme.colors.text,
              backgroundColor: theme.colors.background,
            },
          ]}
        />
        <Pressable
          onPress={() => { onAnswer(text); setText(''); }}
          disabled={!text.trim()}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: !text.trim() ? theme.colors.borderStrong : theme.colors.primary,
              opacity: pressed ? 0.8 : 1,
              marginTop: 8,
            },
          ]}
        >
          <Text style={styles.primaryBtnText}>提交</Text>
        </Pressable>
      </View>
    );
  }

  // voice mode
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{question.text}</Text>
      <Text style={[styles.hint, { color: theme.colors.textSubtle }]}>
        （用语音回答 — macOS 优先 Whisper 本地）
      </Text>
    </View>
  );
};

const InputModeSwitcher: React.FC<{
  mode: InputMode;
  onVoice: () => void;
  onText: (text: string) => void;
  loading: boolean;
}> = ({ mode, onVoice, loading }) => {
  const { theme } = useTheme();
  if (mode !== 'voice' && mode !== 'text') return null;
  return (
    <View style={styles.modeSwitcher}>
      <Text style={[styles.modeLabel, { color: theme.colors.textSubtle }]}>
        {mode === 'voice' ? '🎙️ 语音模式（点下方按钮开始录音）' : '⌨️ 文字模式'}
      </Text>
      {mode === 'voice' ? (
        <Pressable
          onPress={onVoice}
          disabled={loading}
          style={({ pressed }) => [
            styles.voiceBtn,
            {
              backgroundColor: loading ? theme.colors.borderStrong : theme.colors.accent,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          {loading ? <ActivityIndicator color="#FFFFFF" /> : (
            <Text style={styles.voiceBtnText}>🎤 开始录音</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 14, lineHeight: 20 },
  scenarioList: { gap: 10, paddingVertical: 12 },
  scenarioCard: { padding: 16, borderRadius: 10, borderWidth: 1, gap: 4 },
  scenarioLabel: { fontSize: 16, fontWeight: '600' },
  scenarioDesc: { fontSize: 13 },
  progressWrap: { gap: 6 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%' },
  progressText: { fontSize: 12, textAlign: 'right' },
  kbHint: { padding: 8, borderRadius: 6 },
  kbHintText: { fontSize: 12 },
  card: { padding: 16, borderRadius: 10, borderWidth: 1, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12 },
  optionBtn: {
    padding: 12, borderRadius: 8, borderWidth: 1,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  optionLabel: { fontSize: 14 },
  aiTag: { fontSize: 11, fontWeight: '600' },
  textInput: { padding: 10, borderRadius: 6, borderWidth: 1, fontSize: 14 },
  modeSwitcher: { gap: 6 },
  modeLabel: { fontSize: 12 },
  voiceBtn: { padding: 14, borderRadius: 8, alignItems: 'center' },
  voiceBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  historyRow: { paddingTop: 8 },
  linkText: { fontSize: 13 },
  errorText: { fontSize: 12 },
  summaryList: { flex: 1 },
  summaryRow: {
    padding: 12, borderRadius: 8, borderWidth: 1,
    flexDirection: 'row', gap: 10, marginBottom: 8,
  },
  summaryMode: { fontSize: 11, width: 80 },
  summaryValue: { fontSize: 14, flex: 1 },
  primaryBtn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});

export default AdvisorView;
