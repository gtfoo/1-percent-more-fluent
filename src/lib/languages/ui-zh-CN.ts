import type { UiFormatters, UiStrings } from "../ui-strings";

/** Server-only, because these are functions. See UiFormatters. */
export const FORMAT_ZH_CN: UiFormatters = {
  // 个 is the measure word; a template with a bare number slot would drop it.
  aboutWords: (band) => `· 约 ${band} 个词`,
  aimingFor: (sentenceWords, newWordPercent) =>
    `目标是每句约 ${sentenceWords} 个词，其中 ${newWordPercent}% 是生词`,
  // 篇 is the measure word for a piece of writing.
  metInPieces: (n) => `这个词你在 ${n} 篇里都查过`,
  passkeyOn: (date, synced) =>
    `${synced ? "已同步的密钥" : "只在这台设备上"} · ${date} 添加`,
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

  signIn: "登录",
  signOut: "退出登录",
  signInWhy:
    "只是为了把你的水平和读过的内容带到别的设备上。不登录也能用，这个浏览器一样会记住你。",
  emailAddress: "you@example.com",
  emailMeALink: "把登录链接发到我邮箱",
  linkExpires: "不用密码。链接只能用一次，15 分钟后失效。",
  noSignInHere: "这台服务器还没有配置登录。",
  checkYourEmail: "去邮箱看一下",
  checkYourEmailNote: "登录链接已经发出。只能用一次，15 分钟后失效。",
  checkYourEmailSpam:
    "没收到？看看垃圾邮件，再确认一下地址有没有写错。我们不能告诉你某个邮箱有没有注册过，否则谁都能用这个页面来试。",
  tryAnotherAddress: "换一个邮箱地址",

  passkeyNav: "通行密钥",
  passkeyHeading: "不用邮箱登录",
  passkeyRemove: "删除",
  passkeySignIn: "用通行密钥登录",
  passkeyAdd: "在这台设备上添加通行密钥",
  passkeyAdded: "已添加。下次在这台设备上不用邮箱也能登录。",
  passkeyWorking: "等你的设备确认…",
  passkeyWhy:
    "通行密钥用指纹或面容登录，不用等邮件里的链接。它只存在这台设备上。",
  orDivider: "或者",

  yourWords: "你查过的词",
  yourWordsNote: "你读的时候点过的词都在这里。反复出现的，就是最值得记住的。",
  noWordsYet: "这里还是空的。",
  noWordsYetNote: "读的时候点一下不认识的词，它就会出现在这里，意思也已经存好了。",
  exportWords: "导出到 Anki",
  removeWord: "删除",

  listen: "听",
  preparing: "准备中…",
  play: "播放",
  pause: "暂停",
  finishedReading: "我读完了",
  didYouFollow: "你看懂了吗？",
  howYouDid: "答得怎么样",
  correctAnswer: "正确答案",
  yourAnswer: "你选的",
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
