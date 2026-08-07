import type { UiFormatters, UiStrings } from "../ui-strings";

/** Server-only, because these are functions. See UiFormatters. */
export const FORMAT_ZH_CN: UiFormatters = {
  // 个 is the measure word; a template with a bare number slot would drop it.
  aboutWords: (band) => `· 约 ${band} 个词`,
  aimingFor: (sentenceWords, newWordPercent) =>
    `目标是每句约 ${sentenceWords} 个词，其中 ${newWordPercent}% 是生词`,
};

/**
 * The interface in Simplified Chinese. A translation of EN in
 * src/lib/ui-strings.ts.
 *
 * Kept plain and spoken rather than formal - this is an app talking to its
 * user, not a notice. Measure words are the usual trap in interpolated strings
 * (个 for items, 秒 for seconds), which is why those are functions.
 */
export const UI_ZH_CN: UiStrings = {
  uiLanguageNote: "Simplified Chinese",

  retakeLevel: "重新测试我的水平",

  whatToRead: "你想读点什么？",
  topicLabel: "你想读关于什么的内容？",
  orStartFrom: "或者从这些开始：",
  formatStory: "故事",
  formatArticle: "文章",
  formatConversation: "对话",
  lengthShort: "短",
  lengthMedium: "中",
  lengthLong: "长",
  writeIt: "开始生成",
  writing: "正在写…",
  writingNote:
    "先写出来，再按你的水平检查一遍，把太难的地方重写。通常需要 20 到 40 秒。",

  everythingRead: "你读过的全部内容",

  listen: "听",
  preparing: "准备中…",
  play: "播放",
  pause: "暂停",
  finishedReading: "我读完了",
  didYouFollow: "你看懂了吗？",
  howDidThatFeel: "读起来感觉怎么样？",
  tooEasy: "太简单",
  justRight: "刚刚好",
  tooHard: "太难",
  mispitched: "难度不合适？",
  selectMore: "多选一点：",
  justOneWord: "只选一个词",
  lookingUp: "查询中…",
  close: "关闭",
  writeAnother: "再写一篇",
  seeResult: "看看结果",

  somethingWentWrong: "出错了。",
  couldNotLoadAudio: "无法加载音频。",
  couldNotSave: "无法保存。",
  couldNotAdjust: "无法调整水平。",
  generationFailed: "生成失败。",
  lookupFailed: "查不到这个词。",
};
