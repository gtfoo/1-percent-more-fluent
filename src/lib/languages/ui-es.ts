import type { UiFormatters, UiStrings } from "../ui-strings";

/** Server-only, because these are functions. See UiFormatters. */
export const FORMAT_ES: UiFormatters = {
  aboutWords: (band) => `· unas ${band} palabras`,
  // Word order moves - Spanish puts the percentage phrase differently - which is
  // exactly why these are functions rather than templates with numbered slots.
  aimingFor: (sentenceWords, newWordPercent) =>
    `Busca frases de unas ${sentenceWords} palabras y un ${newWordPercent}% de vocabulario nuevo`,
  metInPieces: (n) => `Has necesitado esta palabra en ${n} textos distintos`,
  grownBy: (words, percent) => `${words} palabras más que al empezar — un ${percent}% más.`,
  shrunkBy: (words, percent) =>
    `${words} menos de las que calculó la prueba, un ${percent}% por debajo. La prueba era una estimación a partir de una lista; esto se mide con lo que has leído de verdad.`,
  acrossPieces: (n) => `en ${n} textos que terminaste`,
  coveredCells: (filled, total) => `${filled} de ${total} cuadros`,
  otherPieces: (n) => `Y ${n} textos que no encajaban en ninguno de estos temas.`,
  unlabelledPieces: (n) =>
    `${n} textos anteriores se escribieron antes de que la app etiquetara temas, así que no están en la cuadrícula.`,
  daysReadOf: (days, of) => `Leíste ${days} de los últimos ${of} días`,
  longestRunDays: (n) => `Racha más larga: ${n} días`,
  readOnDay: (date, events) => `${date} — ${events} cosas`,
  lookedUpShare: (percent) => `buscaste el ${percent}% de las palabras`,
  passkeyOn: (date, synced) =>
    `${synced ? "Clave sincronizada" : "Solo en este dispositivo"} · añadida el ${date}`,
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

  passkeyNav: "Claves de acceso",
  passkeyHeading: "Entrar sin correo",
  passkeyRemove: "Quitar",
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
  howYouDid: "Cómo te fue",
  correctAnswer: "Respuesta correcta",
  yourAnswer: "Elegiste esta",
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

  saveMyLevel: "Guardar y ajustar mi nivel",
  savingLevel: "Guardando…",
  nudgedUp: "Un poco más arriba",
  nudgedDown: "Un poco más abajo",
  levelHeld: "El nivel se queda igual",
  lookedUpPercent: "Buscaste el {percent}% de las palabras",
  belowSweetSpot:
    "— bastante por debajo del punto justo, así que el próximo texto te exigirá más.",
  aboveSweetSpot: "— por encima del punto justo, así que el próximo texto aflojará.",
  atSweetSpot: "— justo en el punto que buscamos.",
  levelWord: "Nivel",
  readSomethingElse: "Leer otra cosa",
  seeProgress: "Ver cuánto has avanzado",

  progressNav: "Tu progreso",
  progressHeading: "Cuánto has avanzado",
  wordsYouCanRead: "Palabras que puedes leer",
  whenYouStarted: "Cuando empezaste",
  rightNow: "Ahora mismo",
  levelHeading: "Tu nivel, texto a texto",
  levelNote:
    "El nivel se mueve cada vez que terminas un texto. Baja tanto como sube: es la app corrigiendo lo que suponía de ti, no tú retrocediendo.",
  levelFromCheck: "Donde te situó la prueba de nivel",
  legendSession: "tras un texto que terminaste",
  legendAdjusted: "ajustaste el nivel tú mismo",
  legendReplaced: "repetiste la prueba de nivel",
  breadthHeading: "Sobre qué has leído",
  breadthNote:
    "Un cuadro por cada tipo de texto en cada tema. No es una meta: es un retrato de lo que has recorrido.",
  breadthStarted: "Empezado, sin terminar",
  habitHeading: "Días que leíste",
  habitNote:
    "Cuenta el día si terminaste un texto, buscaste una palabra o pediste algo nuevo. Los días van de medianoche a medianoche, en UTC.",
  legendMade: "pediste algo",
  legendLooked: "buscaste una palabra",
  legendFinished: "terminaste un texto",
  noProgressYet: "Todavía no hay nada que mostrar.",
  noProgressYetNote:
    "Termina un texto y esto se llena: tu nivel con el tiempo, sobre qué has leído y los días que apareciste.",

  somethingWentWrong: "Algo salió mal.",
  couldNotLoadAudio: "No se pudo cargar el audio.",
  couldNotSave: "No se pudo guardar.",
  couldNotAdjust: "No se pudo ajustar el nivel.",
  generationFailed: "No se pudo generar el texto.",
  lookupFailed: "No se pudo buscar esa palabra.",
};
