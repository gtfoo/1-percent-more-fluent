import type { UiFormatters, UiStrings } from "../ui-strings";

/** Server-only, because these are functions. See UiFormatters. */
export const FORMAT_ID: UiFormatters = {
  aboutWords: (band) => `· sekitar ${band} kata`,
  aimingFor: (sentenceWords, newWordPercent) =>
    `Menargetkan kalimat sekitar ${sentenceWords} kata dengan ${newWordPercent}% kosakata baru`,
  metInPieces: (n) => `Kata ini kamu cari di ${n} bacaan berbeda`,
  grownBy: (words, percent) => `${words} kata lebih banyak daripada waktu kamu mulai — naik ${percent}%.`,
  shrunkBy: (words, percent) =>
    `${words} kata lebih sedikit daripada tebakan tes, ${percent}% di bawahnya. Tes itu menebak dari daftar kata; angka ini diukur dari yang benar-benar kamu baca.`,
  acrossPieces: (n) => `dari ${n} bacaan yang kamu selesaikan`,
  coveredCells: (filled, total) => `${filled} dari ${total} kotak`,
  otherPieces: (n) => `Ditambah ${n} bacaan yang tidak masuk ke bidang mana pun di atas.`,
  unlabelledPieces: (n) =>
    `${n} bacaan lama ditulis sebelum aplikasi mulai menandai bidang, jadi tidak ikut di kisi ini.`,
  daysReadOf: (days, of) => `Kamu membaca ${days} dari ${of} hari terakhir`,
  longestRunDays: (n) => `Rentetan terpanjang: ${n} hari`,
  readOnDay: (date, events) => `${date} — ${events} hal`,
  lookedUpShare: (percent) => `kamu mencari ${percent}% katanya`,
  passkeyOn: (date, synced) =>
    `${synced ? "Kunci tersinkron" : "Hanya di perangkat ini"} · ditambahkan ${date}`,
};

/**
 * The interface in Indonesian. A translation of EN in src/lib/ui-strings.ts.
 *
 * Informal register throughout - `kamu` rather than `Anda`, and no `-lah`
 * softeners. The English original talks to the reader like a person rather than
 * a notice, and `Anda` would make the Indonesian read like a bank letter while
 * the English reads like a friend. Same reasoning as the Chinese file's plain
 * spoken tone.
 *
 * Prefixed verbs are given in full (`Mendengarkan`, not `Dengar`) where the word
 * stands alone as a label, because the bare root reads as a command.
 */
export const UI_ID: UiStrings = {
  uiLanguageNote: "Indonesian",

  retakeLevel: "Ukur ulang levelku",

  whatToRead: "Kamu ingin baca apa?",
  topicLabel: "Kamu ingin baca tentang apa?",
  orStartFrom: "Atau mulai dari salah satu ini:",
  formatStory: "Cerita",
  formatArticle: "Artikel",
  formatConversation: "Percakapan",
  lengthShort: "Pendek",
  lengthMedium: "Sedang",
  lengthLong: "Panjang",
  writeIt: "Tulis",
  writing: "Sedang menulis…",
  writingNote:
    "Ditulis dulu, lalu diperiksa terhadap levelmu dan bagian yang terlalu sulit ditulis ulang. Biasanya 20–40 detik.",

  everythingRead: "Semua yang sudah kamu baca",

  signIn: "Masuk",
  signOut: "Keluar",
  signInWhy:
    "Hanya untuk membawa level dan bacaanmu ke perangkat lain. Semuanya tetap jalan tanpa akun — peramban ini mengingatmu juga.",
  emailAddress: "kamu@contoh.com",
  emailMeALink: "Kirimi aku tautan masuk",
  linkExpires: "Tanpa kata sandi. Tautannya sekali pakai dan hangus dalam 15 menit.",
  noSignInHere: "Fitur masuk belum disiapkan di server ini.",
  checkYourEmail: "Cek emailmu",
  checkYourEmailNote:
    "Tautan masuk sedang dikirim. Sekali pakai dan hangus dalam 15 menit.",
  checkYourEmailSpam:
    "Belum ada yang masuk? Cek folder spam, dan pastikan alamatnya benar. Kami tidak bisa memberitahu apakah sebuah alamat sudah terdaftar, karena halaman ini lalu bisa dipakai siapa saja untuk mencari tahu.",
  tryAnotherAddress: "Coba alamat lain",

  passkeyNav: "Kunci sandi",
  passkeyHeading: "Masuk tanpa email",
  passkeyRemove: "Hapus",
  passkeySignIn: "Pakai kunci sandi",
  passkeyAdd: "Tambahkan kunci sandi di perangkat ini",
  passkeyAdded: "Sudah ditambahkan. Lain kali perangkat ini memasukkanmu tanpa email.",
  passkeyWorking: "Menunggu perangkatmu…",
  passkeyWhy:
    "Kunci sandi memasukkanmu dengan sidik jari atau wajah, bukan tautan lewat email. Kunci itu tersimpan di perangkat ini.",
  orDivider: "atau",

  yourWords: "Kata yang kamu cari",
  yourWordsNote:
    "Semua kata yang kamu ketuk saat membaca. Yang muncul berulang kali itulah yang paling layak dihafal.",
  noWordsYet: "Masih kosong di sini.",
  noWordsYetNote:
    "Ketuk sebuah kata saat membaca, dan kata itu muncul di sini lengkap dengan artinya.",
  exportWords: "Ekspor ke Anki",
  removeWord: "Hapus",

  listen: "Dengarkan",
  preparing: "Menyiapkan…",
  play: "Putar",
  pause: "Jeda",
  finishedReading: "Aku sudah selesai membaca",
  didYouFollow: "Kamu paham isinya?",
  howYouDid: "Hasilnya",
  correctAnswer: "Jawaban benar",
  yourAnswer: "Kamu pilih ini",
  howDidThatFeel: "Bagaimana rasanya?",
  tooEasy: "Terlalu mudah",
  justRight: "Pas",
  tooHard: "Terlalu sulit",
  mispitched: "Levelnya meleset?",
  selectMore: "Pilih lebih banyak:",
  justOneWord: "satu kata saja",
  lookingUp: "Sedang mencari…",
  close: "Tutup",
  writeAnother: "Tuliskan satu lagi",
  seeResult: "Lihat hasilnya",

  saveMyLevel: "Simpan dan sesuaikan levelku",
  savingLevel: "Menyimpan…",
  nudgedUp: "Naik sedikit",
  nudgedDown: "Turun sedikit",
  levelHeld: "Level tetap",
  lookedUpPercent: "Kamu mencari {percent}% dari katanya",
  belowSweetSpot:
    "— cukup jauh di bawah titik pasnya, jadi bacaan berikutnya akan lebih menantang.",
  aboveSweetSpot: "— di atas titik pasnya, jadi bacaan berikutnya akan lebih ringan.",
  atSweetSpot: "— pas di titik yang dituju.",
  levelWord: "Level",
  readSomethingElse: "Baca yang lain",
  seeProgress: "Lihat sejauh apa kamu melangkah",

  progressNav: "Perkembanganmu",
  progressHeading: "Sejauh apa kamu sudah melangkah",
  wordsYouCanRead: "Kata yang bisa kamu baca",
  whenYouStarted: "Waktu kamu mulai",
  rightNow: "Sekarang",
  levelHeading: "Levelmu, bacaan demi bacaan",
  levelNote:
    "Level bergerak setiap kali kamu menyelesaikan satu bacaan. Bisa turun, bisa naik — itu aplikasinya yang membetulkan tebakannya tentang kamu, bukan kamu yang mundur.",
  levelFromCheck: "Tempat tes level menaruhmu",
  legendSession: "setelah bacaan yang kamu selesaikan",
  legendAdjusted: "kamu sendiri yang menyetel levelnya",
  legendReplaced: "kamu mengulang tes level",
  breadthHeading: "Apa saja yang sudah kamu baca",
  breadthNote:
    "Satu kotak untuk tiap jenis tulisan di tiap bidang. Ini bukan target, hanya gambaran apa yang sudah kamu jelajahi.",
  breadthStarted: "Dimulai, belum selesai",
  habitHeading: "Hari-hari kamu membaca",
  habitNote:
    "Satu hari dihitung kalau kamu menyelesaikan bacaan, mencari arti kata, atau meminta bacaan baru. Hari dihitung tengah malam ke tengah malam, UTC.",
  legendMade: "minta bacaan baru",
  legendLooked: "mencari arti kata",
  legendFinished: "menyelesaikan bacaan",
  noProgressYet: "Belum ada yang bisa ditampilkan.",
  noProgressYetNote:
    "Selesaikan satu bacaan dan halaman ini akan terisi: levelmu dari waktu ke waktu, apa saja yang kamu baca, dan hari-hari kamu datang.",

  somethingWentWrong: "Ada yang tidak beres.",
  couldNotLoadAudio: "Audio tidak bisa dimuat.",
  couldNotSave: "Tidak bisa disimpan.",
  couldNotAdjust: "Level tidak bisa disesuaikan.",
  generationFailed: "Gagal membuat teks.",
  lookupFailed: "Kata itu tidak ketemu.",
};
