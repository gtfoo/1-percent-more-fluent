import type { UiFormatters, UiStrings } from "../ui-strings";

/** Server-only, because these are functions. See UiFormatters. */
export const FORMAT_ZH_CN: UiFormatters = {
  aimingFor: (sentenceWords, newWordPercent) =>
    `目标是每句约 ${sentenceWords} 个词，其中 ${newWordPercent}% 是生词`,
  // 篇 is the measure word for a piece of writing.
  metInPieces: (n) => `这个词你在 ${n} 篇里都查过`,
  // 篇 for pieces, 天 for days - a bare number slot would drop every one of them.
  upFrom: (band) => `从 ${band} 升上来，`,
  downFrom: (band) =>
    `从 ${band} 降下来 —— 当初那是照词表估的，现在这个是照你真正读过的算的 ——`,
  acrossPieces: (n) => `来自你读完的 ${n} 篇`,
  coveredCells: (filled, total) => `${total} 格里填了 ${filled} 格`,
  otherPieces: (n) => `另外还有 ${n} 篇，不属于上面任何一个话题。`,
  unlabelledPieces: (n) => `还有 ${n} 篇是在应用开始标话题之前写的，所以没放进格子里。`,
  daysReadOf: (days, of) => `最近 ${of} 天里，你读了 ${days} 天`,
  longestRunDays: (n) => `最长连续 ${n} 天`,
  readOnDay: (date, events) => `${date} — ${events} 次`,
  lookedUpShare: (percent) => `你查了其中 ${percent}% 的词`,
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

  saveMyLevel: "保存并调整我的等级",
  savingLevel: "保存中…",
  nudgedUp: "往上调了一点",
  nudgedDown: "往下调了一点",
  levelHeld: "等级不变",
  lookedUpPercent: "你查了 {percent}% 的词",
  belowSweetSpot: "——明显低于合适的区间，下一篇会更有挑战。",
  aboveSweetSpot: "——高于合适的区间，下一篇会放松一些。",
  atSweetSpot: "——正好在合适的区间。",
  levelWord: "等级",
  readSomethingElse: "读点别的",
  seeProgress: "看看你走了多远",

  progressNav: "你的进步",
  progressHeading: "你走了多远",
  yourLevel: "你的水平",
  whenYouStarted: "刚开始的时候",
  rightNow: "现在",
  levelHeading: "你的水平，一篇一篇看",
  levelNote:
    "每读完一篇，水平都会动一次。会往上，也会往下——那是这个应用在修正它对你的估计，不是你退步了。",
  levelFromCheck: "水平测试把你放在这里",
  legendSession: "读完一篇之后",
  legendAdjusted: "你自己调了水平",
  legendReplaced: "你重新测了一次",
  breadthHeading: "你都读过些什么",
  breadthNote: "每个话题、每种体裁各一格。这不是任务，只是你读过的范围。",
  breadthStarted: "开了头，没读完",
  habitHeading: "你读书的日子",
  habitNote:
    "只要读完一篇、查过一个词，或者让它写一篇新的，这一天就算数。一天按你所在时区从零点算到零点。",
  legendMade: "让它写了一篇",
  legendLooked: "查过词",
  legendFinished: "读完了一篇",
  noProgressYet: "还没有什么可看的。",
  noProgressYetNote: "读完一篇，这里就会有内容：你的水平变化、读过的话题，还有你来过的日子。",

  somethingWentWrong: "出错了。",
  couldNotLoadAudio: "无法加载音频。",
  couldNotSave: "无法保存。",
  couldNotAdjust: "无法调整水平。",
  generationFailed: "生成失败。",
  lookupFailed: "查不到这个词。",
};
