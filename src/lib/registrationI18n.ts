export type RegistrationCopy = {
  locale: string;
  registration: string;
  qrRecognized: string;
  heading: string;
  from: string;
  yourName: string;
  namePlaceholder: string;
  shortMessage: string;
  messagePlaceholder: string;
  receivedCountry: string;
  chooseCountry: string;
  email: string;
  contactConsent: string;
  shareLocation: string;
  gettingLocation: string;
  locationAdded: string;
  register: string;
  registering: string;
  nameRequired: string;
  nameTooLong: string;
  messageTooLong: string;
  emailInvalid: string;
  locationUnsupported: string;
  locationFailed: string;
  genericErrorTitle: string;
  genericErrorText: string;
  missingQrCode: string;
  postcardNotFound: string;
  loadFailed: string;
  errorTitle: string;
  backHome: string;
  pageTitle: string;
  pageDescription: string;
  registeredTitle: string;
  registeredText: string;
  alreadyRegisteredTitle: string;
  alreadyRegisteredText: string;
  sentBy: string;
  learnMore: string;
  footer: string;
};

const translations: Record<string, RegistrationCopy> = {
  pl: {
    locale: "pl-PL", registration: "Rejestracja kartki", qrRecognized: "Kod QR rozpoznany", heading: "Masz Podróżówkę!", from: "Od:",
    yourName: "Twoje imię *", namePlaceholder: "Jak masz na imię?", shortMessage: "Krótka wiadomość (opcjonalnie)", messagePlaceholder: "Napisz coś do Podróżnika...",
    receivedCountry: "Kraj otrzymania kartki", chooseCountry: "Wybierz kraj...", email: "Email (opcjonalnie)",
    contactConsent: "Wyrażam zgodę na kontakt ze strony Podróżnika, który wysłał tę kartkę", shareLocation: "Udostępnij swoją lokalizację (opcjonalnie)",
    gettingLocation: "Pobieranie lokalizacji...", locationAdded: "Lokalizacja dodana!", register: "Zarejestruj kartkę", registering: "Rejestrowanie...",
    nameRequired: "Podaj swoje imię", nameTooLong: "Maksymalnie 100 znaków", messageTooLong: "Maksymalnie 500 znaków", emailInvalid: "Podaj prawidłowy adres email",
    locationUnsupported: "Twoja przeglądarka nie obsługuje geolokalizacji", locationFailed: "Nie udało się pobrać lokalizacji",
    genericErrorTitle: "Wystąpił błąd", genericErrorText: "Spróbuj ponownie", missingQrCode: "Brak kodu QR", postcardNotFound: "Nie znaleziono kartki", loadFailed: "Wystąpił błąd podczas ładowania", errorTitle: "Nie znaleziono kartki", backHome: "Wróć na stronę główną", pageTitle: "Zarejestruj Podróżówkę", pageDescription: "Otrzymałeś Podróżówkę? Zeskanuj kod QR i zarejestruj, kiedy i gdzie dostałeś pocztówkę z Polski.",
    registeredTitle: "Dziękujemy! 🎉", registeredText: "Twoja Podróżówka z", alreadyRegisteredTitle: "Kartka już zarejestrowana", alreadyRegisteredText: "Ta Podróżówka została zarejestrowana przez",
    sentBy: "Wysłana przez:", learnMore: "Dowiedz się więcej o Podróżówce", footer: "Kartki z Polski dla świata",
  },
  en: {
    locale: "en", registration: "Postcard registration", qrRecognized: "QR code recognised", heading: "You have a Podróżówka!", from: "From:",
    yourName: "Your name *", namePlaceholder: "What is your name?", shortMessage: "A short message (optional)", messagePlaceholder: "Write something to the traveller...",
    receivedCountry: "Country where you received the postcard", chooseCountry: "Choose a country...", email: "Email (optional)",
    contactConsent: "I agree to be contacted by the traveller who sent this postcard", shareLocation: "Share your location (optional)",
    gettingLocation: "Getting location...", locationAdded: "Location added!", register: "Register postcard", registering: "Registering...",
    nameRequired: "Please enter your name", nameTooLong: "Maximum 100 characters", messageTooLong: "Maximum 500 characters", emailInvalid: "Enter a valid email address",
    locationUnsupported: "Your browser does not support geolocation", locationFailed: "Unable to get your location",
    genericErrorTitle: "Something went wrong", genericErrorText: "Please try again", missingQrCode: "Missing QR code", postcardNotFound: "Postcard not found", loadFailed: "An error occurred while loading", errorTitle: "Postcard not found", backHome: "Back to the homepage", pageTitle: "Register your Podróżówka", pageDescription: "Did you receive a Podróżówka? Scan the QR code and register where and when you received this postcard from Poland.",
    registeredTitle: "Thank you! 🎉", registeredText: "Your Podróżówka from", alreadyRegisteredTitle: "Postcard already registered", alreadyRegisteredText: "This Podróżówka was registered by",
    sentBy: "Sent by:", learnMore: "Learn more about Podróżówka", footer: "Postcards from Poland for the world",
  },
  de: {
    locale: "de-DE", registration: "Postkartenregistrierung", qrRecognized: "QR-Code erkannt", heading: "Du hast eine Podróżówka!", from: "Von:",
    yourName: "Dein Name *", namePlaceholder: "Wie heißt du?", shortMessage: "Kurze Nachricht (optional)", messagePlaceholder: "Schreibe dem Reisenden etwas...",
    receivedCountry: "Land, in dem du die Karte erhalten hast", chooseCountry: "Land auswählen...", email: "E-Mail (optional)",
    contactConsent: "Ich stimme zu, vom Reisenden kontaktiert zu werden, der diese Karte gesendet hat", shareLocation: "Standort teilen (optional)",
    gettingLocation: "Standort wird ermittelt...", locationAdded: "Standort hinzugefügt!", register: "Postkarte registrieren", registering: "Wird registriert...",
    nameRequired: "Bitte gib deinen Namen ein", nameTooLong: "Maximal 100 Zeichen", messageTooLong: "Maximal 500 Zeichen", emailInvalid: "Bitte gib eine gültige E-Mail-Adresse ein",
    locationUnsupported: "Dein Browser unterstützt keine Standortfreigabe", locationFailed: "Standort konnte nicht ermittelt werden",
    genericErrorTitle: "Es ist ein Fehler aufgetreten", genericErrorText: "Bitte versuche es erneut", missingQrCode: "QR-Code fehlt", postcardNotFound: "Postkarte nicht gefunden", loadFailed: "Beim Laden ist ein Fehler aufgetreten", errorTitle: "Postkarte nicht gefunden", backHome: "Zur Startseite", pageTitle: "Podróżówka registrieren", pageDescription: "Du hast eine Podróżówka erhalten? Scanne den QR-Code und registriere, wann und wo du diese Karte aus Polen erhalten hast.",
    registeredTitle: "Vielen Dank! 🎉", registeredText: "Deine Podróżówka aus", alreadyRegisteredTitle: "Postkarte bereits registriert", alreadyRegisteredText: "Diese Podróżówka wurde registriert von",
    sentBy: "Gesendet von:", learnMore: "Mehr über Podróżówka erfahren", footer: "Postkarten aus Polen für die Welt",
  },
  fr: {
    locale: "fr-FR", registration: "Enregistrement de la carte", qrRecognized: "Code QR reconnu", heading: "Vous avez une Podróżówka !", from: "De :",
    yourName: "Votre prénom *", namePlaceholder: "Comment vous appelez-vous ?", shortMessage: "Court message (facultatif)", messagePlaceholder: "Écrivez un message au voyageur...",
    receivedCountry: "Pays où vous avez reçu la carte", chooseCountry: "Choisissez un pays...", email: "E-mail (facultatif)",
    contactConsent: "J'accepte d'être contacté(e) par le voyageur qui a envoyé cette carte", shareLocation: "Partager votre position (facultatif)",
    gettingLocation: "Localisation en cours...", locationAdded: "Localisation ajoutée !", register: "Enregistrer la carte", registering: "Enregistrement...",
    nameRequired: "Indiquez votre prénom", nameTooLong: "100 caractères maximum", messageTooLong: "500 caractères maximum", emailInvalid: "Indiquez une adresse e-mail valide",
    locationUnsupported: "Votre navigateur ne prend pas en charge la géolocalisation", locationFailed: "Impossible d'obtenir votre position",
    genericErrorTitle: "Une erreur s'est produite", genericErrorText: "Veuillez réessayer", missingQrCode: "Code QR manquant", postcardNotFound: "Carte introuvable", loadFailed: "Une erreur s'est produite pendant le chargement", errorTitle: "Carte introuvable", backHome: "Retour à l'accueil", pageTitle: "Enregistrer votre Podróżówka", pageDescription: "Vous avez reçu une Podróżówka ? Scannez le code QR et indiquez où et quand vous avez reçu cette carte de Pologne.",
    registeredTitle: "Merci ! 🎉", registeredText: "Votre Podróżówka de", alreadyRegisteredTitle: "Carte déjà enregistrée", alreadyRegisteredText: "Cette Podróżówka a été enregistrée par",
    sentBy: "Envoyée par :", learnMore: "En savoir plus sur Podróżówka", footer: "Des cartes de Pologne pour le monde",
  },
  ja: {
    locale: "ja-JP", registration: "ポストカード登録", qrRecognized: "QRコードを認識しました", heading: "Podróżówka を受け取りました！", from: "送信者：",
    yourName: "お名前 *", namePlaceholder: "お名前を入力してください", shortMessage: "短いメッセージ（任意）", messagePlaceholder: "旅人へメッセージを書いてください…",
    receivedCountry: "ポストカードを受け取った国", chooseCountry: "国を選択してください…", email: "メールアドレス（任意）",
    contactConsent: "このポストカードを送った旅人からの連絡に同意します", shareLocation: "位置情報を共有する（任意）",
    gettingLocation: "位置情報を取得しています…", locationAdded: "位置情報を追加しました！", register: "ポストカードを登録", registering: "登録しています…",
    nameRequired: "お名前を入力してください", nameTooLong: "100文字以内で入力してください", messageTooLong: "500文字以内で入力してください", emailInvalid: "有効なメールアドレスを入力してください",
    locationUnsupported: "このブラウザは位置情報に対応していません", locationFailed: "位置情報を取得できませんでした",
    genericErrorTitle: "エラーが発生しました", genericErrorText: "もう一度お試しください", missingQrCode: "QRコードがありません", postcardNotFound: "ポストカードが見つかりません", loadFailed: "読み込み中にエラーが発生しました", errorTitle: "ポストカードが見つかりません", backHome: "トップページに戻る", pageTitle: "Podróżówka を登録", pageDescription: "Podróżówka を受け取りましたか？QRコードを読み取り、ポーランドからのポストカードをいつどこで受け取ったか登録してください。",
    registeredTitle: "ありがとうございます！🎉", registeredText: "次の Podróżówka を登録しました：", alreadyRegisteredTitle: "このポストカードは登録済みです", alreadyRegisteredText: "この Podróżówka を登録した人：",
    sentBy: "送信者：", learnMore: "Podróżówka について詳しく見る", footer: "ポーランドから世界へポストカードを",
  },
  es: {
    locale: "es-ES", registration: "Registro de la postal", qrRecognized: "Código QR reconocido", heading: "¡Tienes una Podróżówka!", from: "De:",
    yourName: "Tu nombre *", namePlaceholder: "¿Cómo te llamas?", shortMessage: "Mensaje breve (opcional)", messagePlaceholder: "Escribe algo para la persona viajera…",
    receivedCountry: "País donde recibiste la postal", chooseCountry: "Elige un país…", email: "Correo electrónico (opcional)",
    contactConsent: "Acepto que la persona viajera que envió esta postal se ponga en contacto conmigo", shareLocation: "Comparte tu ubicación (opcional)",
    gettingLocation: "Obteniendo la ubicación…", locationAdded: "¡Ubicación añadida!", register: "Registrar la postal", registering: "Registrando…",
    nameRequired: "Escribe tu nombre", nameTooLong: "Máximo 100 caracteres", messageTooLong: "Máximo 500 caracteres", emailInvalid: "Escribe una dirección de correo válida",
    locationUnsupported: "Tu navegador no admite la geolocalización", locationFailed: "No se pudo obtener tu ubicación",
    genericErrorTitle: "Se produjo un error", genericErrorText: "Inténtalo de nuevo", missingQrCode: "Falta el código QR", postcardNotFound: "No se encontró la postal", loadFailed: "Se produjo un error al cargar", errorTitle: "No se encontró la postal", backHome: "Volver a la página principal", pageTitle: "Registra tu Podróżówka", pageDescription: "¿Has recibido una Podróżówka? Escanea el código QR y registra cuándo y dónde recibiste esta postal de Polonia.",
    registeredTitle: "¡Gracias! 🎉", registeredText: "Tu Podróżówka de", alreadyRegisteredTitle: "La postal ya está registrada", alreadyRegisteredText: "Esta Podróżówka fue registrada por",
    sentBy: "Enviada por:", learnMore: "Conoce más sobre Podróżówka", footer: "Postales de Polonia para el mundo",
  },
  cs: {
    locale: "cs-CZ", registration: "Registrace pohlednice", qrRecognized: "QR kód rozpoznán", heading: "Máš Podróżówku!", from: "Od:",
    yourName: "Tvé jméno *", namePlaceholder: "Jak se jmenuješ?", shortMessage: "Krátká zpráva (volitelné)", messagePlaceholder: "Napiš něco cestovateli…",
    receivedCountry: "Země, kde jsi pohlednici obdržel(a)", chooseCountry: "Vyber zemi…", email: "E-mail (volitelné)",
    contactConsent: "Souhlasím s kontaktem od cestovatele, který tuto pohlednici poslal", shareLocation: "Sdílet polohu (volitelné)",
    gettingLocation: "Získávám polohu…", locationAdded: "Poloha přidána!", register: "Zaregistrovat pohlednici", registering: "Registruji…",
    nameRequired: "Zadej své jméno", nameTooLong: "Maximálně 100 znaků", messageTooLong: "Maximálně 500 znaků", emailInvalid: "Zadej platnou e-mailovou adresu",
    locationUnsupported: "Tvůj prohlížeč nepodporuje geolokaci", locationFailed: "Nepodařilo se získat polohu",
    genericErrorTitle: "Něco se pokazilo", genericErrorText: "Zkus to prosím znovu", missingQrCode: "Chybí QR kód", postcardNotFound: "Pohlednice nebyla nalezena", loadFailed: "Při načítání došlo k chybě", errorTitle: "Pohlednice nebyla nalezena", backHome: "Zpět na hlavní stránku", pageTitle: "Zaregistruj svou Podróżówku", pageDescription: "Dostal(a) jsi Podróżówku? Naskenuj QR kód a zaregistruj, kdy a kde jsi tuto pohlednici z Polska obdržel(a).",
    registeredTitle: "Děkujeme! 🎉", registeredText: "Tvoje Podróżówka z", alreadyRegisteredTitle: "Pohlednice už je zaregistrovaná", alreadyRegisteredText: "Tuto Podróżówku zaregistroval(a)",
    sentBy: "Poslal(a):", learnMore: "Poznej Podróżówku", footer: "Pohlednice z Polska pro svět",
  },
};

export function getRegistrationCopy(languageCode?: string | null): RegistrationCopy {
  const normalizedLanguage = languageCode?.trim().toLowerCase().split(/[-_]/)[0];
  return translations[normalizedLanguage || ""] || translations.en;
}

export function getLocalizedCountryName(iso2: string | null | undefined, fallback: string, locale: string): string {
  if (!iso2 || iso2.length !== 2 || typeof Intl.DisplayNames !== "function") return fallback;
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(iso2.toUpperCase()) || fallback;
  } catch {
    return fallback;
  }
}
