/**
 * Advisor 控制器（pure reducer + 类型）— 不依赖 React，可独立单测
 * 灵犀演示 · Phase 1 · T-1.2
 */
import type {
  AdvisorQuestion,
  AnswerRecord,
  ScenarioId,
} from './types';
import { computeProgress, ProgressInfo } from './progress';
import {
  getScenarioTemplate,
  renderQuestionFromTemplate,
} from './questions';
import {
  autocompleteForAnswers,
  annotateQuestionsWithKB,
} from './kb_linker';

export interface AdvisorControllerState {
  scenario?: ScenarioId;
  currentQ?: AdvisorQuestion;
  history: AnswerRecord[];
  progress: ProgressInfo;
  loading: boolean;
  error?: string;
  kbHint?: string;
}

export type AdvisorAction =
  | { type: 'pickScenario'; id: ScenarioId }
  | { type: 'answer'; value: string | string[] }
  | { type: 'startOver' }
  | { type: 'setLoading'; loading: boolean }
  | { type: 'setError'; error?: string };

export const initialAdvisorState: AdvisorControllerState = {
  history: [],
  progress: computeProgress(0, 1),
  loading: false,
};

export function advisorReducer(
  state: AdvisorControllerState,
  action: AdvisorAction
): AdvisorControllerState {
  switch (action.type) {
    case 'pickScenario': {
      const tmpl = getScenarioTemplate(action.id);
      if (!tmpl) return state;
      const firstQ = renderQuestionFromTemplate(tmpl.questions[0]);
      return {
        scenario: action.id,
        currentQ: firstQ,
        history: [],
        progress: computeProgress(0, tmpl.questions.length),
        loading: false,
        error: undefined,
        kbHint: undefined,
      };
    }

    case 'answer': {
      if (!state.scenario || !state.currentQ) return state;
      const tmpl = getScenarioTemplate(state.scenario);
      if (!tmpl) return state;
      const record: AnswerRecord = {
        question_id: state.currentQ.question_id,
        value: action.value,
        mode: state.currentQ.input_mode,
        at_iso: new Date().toISOString(),
      };
      const newHistory = [...state.history, record];
      const currentTmpl = tmpl.questions.find(q => q.text === state.currentQ!.text);
      const idx = currentTmpl ? tmpl.questions.indexOf(currentTmpl) : 0;
      const next = tmpl.questions[idx + 1];
      if (!next) {
        return {
          ...state,
          history: newHistory,
          currentQ: undefined,
          progress: computeProgress(newHistory.length, tmpl.questions.length),
          kbHint: undefined,
        };
      }
      const answeredMap: Record<string, string | string[]> = {};
      for (const r of newHistory) answeredMap[r.question_id] = r.value;
      const linked = autocompleteForAnswers(state.scenario, answeredMap);
      const candidate = renderQuestionFromTemplate(next, linked);
      const annotated = annotateQuestionsWithKB([candidate], linked)[0];
      return {
        ...state,
        currentQ: annotated,
        history: newHistory,
        progress: computeProgress(newHistory.length, tmpl.questions.length),
        kbHint: linked.size > 0 ? `已根据你的答案补全 ${linked.size} 个 AI 推荐选项` : undefined,
      };
    }

    case 'startOver':
      return {
        history: [],
        progress: computeProgress(0, 1),
        loading: false,
      };

    case 'setLoading':
      return { ...state, loading: action.loading };

    case 'setError':
      return { ...state, error: action.error };

    default:
      return state;
  }
}
