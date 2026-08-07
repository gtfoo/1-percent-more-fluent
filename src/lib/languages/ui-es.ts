import type { UiFormatters, UiStrings } from "../ui-strings";

/** Server-only, because these are functions. See UiFormatters. */
export const FORMAT_ES: UiFormatters = {
  aboutWords: (band) => `· unas ${band} palabras`,
  // Word order moves - Spanish puts the percentage phrase differently - which is
  // exactly why these are functions rather than templates with numbered slots.
  aimingFor: (sentenceWords, newWordPercent) =>
    `Busca frases de unas ${sentenceWords} palabras y un ${newWordPercent}% de vocabulario nuevo`,
  metInPieces: (n) => `Has necesitado esta palabra en ${n} textos distintos`,
};

/** The interface in Spanish. A translation of EN in src/lib/ui-strings.ts. */
export const UI_ES: UiStrings = {
  uiLanguageNote: "Spanish",

  retakeLevel: "Volver a medir mi nivel",

  whatToRead: "¿Qué te apetece leer?",
  topicLabel: "¿Sobre qué quieres leer?",
  orStartFrom: "O empieza por una de estas:",
  formatStory: "Relato",
  formatArticle: "Artículo",
  formatConversation: "Conversación",
  lengthShort: "Corto",
  lengthMedium: "Medio",
  lengthLong: "Largo",
  writeIt: "Escríbelo",
  writing: "Escribiendo…",
  writingNote:
    "Lo escribe, lo compara con tu nivel y reescribe lo que resulte demasiado difícil. Suele tardar entre 20 y 40 segundos.",

  everythingRead: "Todo lo que has leído",

  signIn: "Iniciar sesión",
  signOut: "Cerrar sesión",
  signInWhy:
    "Solo sirve para llevar tu nivel y tus lecturas a otro dispositivo. Todo funciona sin cuenta: este navegador te recuerda igualmente.",
  emailAddress: "tu@ejemplo.com",
  emailMeALink: "Enviarme un enlace de acceso",
  linkExpires: "Sin contraseña. El enlace sirve una vez y caduca en 15 minutos.",
  noSignInHere: "El inicio de sesión aún no está configurado en este servidor.",
  checkYourEmail: "Revisa tu correo",
  checkYourEmailNote:
    "El enlace de acceso va en camino. Sirve una vez y caduca en 15 minutos.",
  checkYourEmailSpam:
    "¿No llega nada? Mira en spam y comprueba que la dirección era correcta. No podemos decirte si una dirección está registrada: cualquiera podría usar esta página para averiguarlo.",
  tryAnotherAddress: "Probar con otra dirección",

  passkeySignIn: "Usar una clave de acceso",
  passkeyAdd: "Añadir una clave de acceso a este dispositivo",
  passkeyAdded: "Añadida. La próxima vez entrarás sin correo.",
  passkeyWorking: "Esperando a tu dispositivo…",
  passkeyWhy:
    "Una clave de acceso te identifica con tu huella o tu cara en lugar de un enlace por correo. Se queda en este dispositivo.",
  orDivider: "o",

  yourWords: "Palabras que buscaste",
  yourWordsNote:
    "Cada palabra que tocaste mientras leías. Las que se repiten son las que vale la pena aprender.",
  noWordsYet: "Aquí todavía no hay nada.",
  noWordsYetNote:
    "Toca una palabra mientras lees y aparecerá aquí, con su significado ya guardado.",
  exportWords: "Exportar para Anki",
  removeWord: "Quitar",

  listen: "Escuchar",
  preparing: "Preparando…",
  play: "Reproducir",
  pause: "Pausa",
  finishedReading: "He terminado de leer",
  didYouFollow: "¿Lo entendiste?",
  howDidThatFeel: "¿Qué tal te resultó?",
  tooEasy: "Muy fácil",
  justRight: "En su punto",
  tooHard: "Muy difícil",
  mispitched: "¿Mal ajustado?",
  selectMore: "Ampliar:",
  justOneWord: "solo una palabra",
  lookingUp: "Buscando…",
  close: "Cerrar",
  writeAnother: "Escríbeme otro",
  seeResult: "Ver qué tal fue",

  somethingWentWrong: "Algo salió mal.",
  couldNotLoadAudio: "No se pudo cargar el audio.",
  couldNotSave: "No se pudo guardar.",
  couldNotAdjust: "No se pudo ajustar el nivel.",
  generationFailed: "No se pudo generar el texto.",
  lookupFailed: "No se pudo buscar esa palabra.",
};
