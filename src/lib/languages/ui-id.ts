import type { UiFormatters, UiStrings } from "../ui-strings";

/** Server-only, because these are functions. See UiFormatters. */
export const FORMAT_ID: UiFormatters = {
  aboutWords: (band) => `· sekitar ${band} kata`,
  aimingFor: (sentenceWords, newWordPercent) =>
    `Menargetkan kalimat sekitar ${sentenceWords} kata dengan ${newWordPercent}% kosakata baru`,
  metInPieces: (n) => `Kata ini kamu cari di ${n} bacaan berbeda`,
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

  somethingWentWrong: "Ada yang tidak beres.",
  couldNotLoadAudio: "Audio tidak bisa dimuat.",
  couldNotSave: "Tidak bisa disimpan.",
  couldNotAdjust: "Level tidak bisa disesuaikan.",
  generationFailed: "Gagal membuat teks.",
  lookupFailed: "Kata itu tidak ketemu.",
};
