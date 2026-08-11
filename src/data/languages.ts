export interface LanguageOption {
  code: string;
  name_pl: string;
  name_native: string;
  default_front_thank_you?: string;
  default_back_qr_label?: string;
}

export const WORLD_LANGUAGES: LanguageOption[] = [
  { code: "pl", name_pl: "Polski", name_native: "Polski", default_front_thank_you: "DZIĘKUJĘ, ŻE JESTEŚ CZĘŚCIĄ MOJEJ PODRÓŻY", default_back_qr_label: "Zeskanuj ten kod QR i śledź moje podróże" },
  { code: "en", name_pl: "Angielski", name_native: "English", default_front_thank_you: "THANK YOU FOR BEING PART OF MY JOURNEY", default_back_qr_label: "Scan this QR code and follow my travels" },
  { code: "en-au", name_pl: "Angielski (Australia)", name_native: "English (Australia)", default_front_thank_you: "THANK YOU FOR BEING PART OF MY JOURNEY", default_back_qr_label: "Scan this QR code and follow my travels" },
  { code: "de", name_pl: "Niemiecki", name_native: "Deutsch", default_front_thank_you: "DANKE, DASS DU TEIL MEINER REISE BIST", default_back_qr_label: "Scanne diesen QR-Code und begleite meine Reisen" },
  { code: "fr", name_pl: "Francuski", name_native: "Français", default_front_thank_you: "MERCI DE FAIRE PARTIE DE MON VOYAGE", default_back_qr_label: "Scanne ce code QR et suis mes voyages" },
  { code: "es", name_pl: "Hiszpański", name_native: "Español", default_front_thank_you: "GRACIAS POR SER PARTE DE MI VIAJE", default_back_qr_label: "Escanea este código QR y sigue mis viajes" },
  { code: "ca", name_pl: "Kataloński", name_native: "Català", default_front_thank_you: "GRÀCIES PER FORMAR PART DEL MEU VIATGE", default_back_qr_label: "Escaneja aquest codi QR i segueix els meus viatges" },
  { code: "gl", name_pl: "Galicyjski", name_native: "Galego", default_front_thank_you: "GRAZAS POR FORMAR PARTE DA MIÑA VIAXE", default_back_qr_label: "Escanea este código QR e segue as miñas viaxes" },
  { code: "eu", name_pl: "Baskijski", name_native: "Euskara", default_front_thank_you: "ESKERRIK ASKO NIRE BIDAIAREN PARTE IZATEAGATIK", default_back_qr_label: "Eskaneatu QR kode hau eta jarraitu nire bidaiak" },
  { code: "oc", name_pl: "Araneński", name_native: "Aranés", default_front_thank_you: "MERCÉS PER ÈSTER PART DETH MÈU VIATGE", default_back_qr_label: "Escanège aguest còdi QR e seguís es mèus viatges" },
  { code: "it", name_pl: "Włoski", name_native: "Italiano", default_front_thank_you: "GRAZIE PER FAR PARTE DEL MIO VIAGGIO", default_back_qr_label: "Scansiona questo codice QR e segui i miei viaggi" },
  { code: "uk", name_pl: "Ukraiński", name_native: "Українська", default_front_thank_you: "ДЯКУЮ, ЩО ТИ Є ЧАСТИНОЮ МОЄЇ ПОДОРОЖІ", default_back_qr_label: "Скануй цей QR-код і стеж за моїми подорожами" },
  { code: "cs", name_pl: "Czeski", name_native: "Čeština", default_front_thank_you: "DĚKUJI, ŽE JSI SOUČÁSTÍ MÉ CESTY", default_back_qr_label: "Naskenuj tento QR kód a sleduj mé cesty" },
  { code: "hr", name_pl: "Chorwacki", name_native: "Hrvatski", default_front_thank_you: "HVALA ŠTO SI DIO MOG PUTOVANJA", default_back_qr_label: "Skeniraj ovaj QR kod i prati moja putovanja" },
  { code: "el", name_pl: "Grecki", name_native: "Ελληνικά", default_front_thank_you: "ΕΥΧΑΡΙΣΤΩ ΠΟΥ ΕΙΣΑΙ ΜΕΡΟΣ ΤΟΥ ΤΑΞΙΔΙΟΥ ΜΟΥ", default_back_qr_label: "Σκάναρε αυτόν τον κωδικό QR και ακολούθησε τα ταξίδια μου" },
  { code: "hu", name_pl: "Węgierski", name_native: "Magyar", default_front_thank_you: "KÖSZÖNÖM, HOGY RÉSZE VAGY AZ UTAZÁSOMNAK", default_back_qr_label: "Szkenneld be ezt a QR-kódot, és kövesd az utazásaimat" },
  { code: "tr", name_pl: "Turecki", name_native: "Türkçe", default_front_thank_you: "YOLCULUĞUMUN BİR PARÇASI OLDUĞUN İÇİN TEŞEKKÜR EDERİM", default_back_qr_label: "Bu QR kodunu tara ve yolculuklarımı takip et" },
  { code: "th", name_pl: "Tajski", name_native: "ไทย", default_front_thank_you: "ขอบคุณที่เป็นส่วนหนึ่งของการเดินทางของฉัน", default_back_qr_label: "สแกนคิวอาร์โค้ดนี้และติดตามการเดินทางของฉัน" },
  { code: "zh", name_pl: "Chiński", name_native: "中文", default_front_thank_you: "感谢你成为我旅程的一部分", default_back_qr_label: "扫描此二维码，关注我的旅程" },
  { code: "ja", name_pl: "Japoński", name_native: "日本語", default_front_thank_you: "私の旅の一部になってくれてありがとう", default_back_qr_label: "このQRコードをスキャンして、私の旅を追ってください" },
  { code: "ar", name_pl: "Arabski", name_native: "العربية", default_front_thank_you: "شكرًا لكونك جزءًا من رحلتي", default_back_qr_label: "امسح رمز الاستجابة السريعة هذا وتابع رحلاتي" },
  { code: "pt", name_pl: "Portugalski", name_native: "Português", default_front_thank_you: "OBRIGADO POR FAZERES PARTE DA MINHA VIAGEM", default_back_qr_label: "Digitaliza este código QR e acompanha as minhas viagens" },
  { code: "nl", name_pl: "Holenderski", name_native: "Nederlands", default_front_thank_you: "BEDANKT DAT JE DEEL UITMAAKT VAN MIJN REIS", default_back_qr_label: "Scan deze QR-code en volg mijn reizen" },
  { code: "sv", name_pl: "Szwedzki", name_native: "Svenska", default_front_thank_you: "TACK FÖR ATT DU ÄR EN DEL AV MIN RESA", default_back_qr_label: "Skanna den här QR-koden och följ mina resor" },
  { code: "no", name_pl: "Norweski", name_native: "Norsk", default_front_thank_you: "TAKK FOR AT DU ER EN DEL AV REISEN MIN", default_back_qr_label: "Skann denne QR-koden og følg reisene mine" },
  { code: "da", name_pl: "Duński", name_native: "Dansk", default_front_thank_you: "TAK FORDI DU ER EN DEL AF MIN REJSE", default_back_qr_label: "Scan denne QR-kode og følg mine rejser" },
  { code: "fi", name_pl: "Fiński", name_native: "Suomi", default_front_thank_you: "KIITOS, ETTÄ OLET OSA MATKAANI", default_back_qr_label: "Skannaa tämä QR-koodi ja seuraa matkojani" },
  { code: "ro", name_pl: "Rumuński", name_native: "Română", default_front_thank_you: "ÎȚI MULȚUMESC CĂ FACI PARTE DIN CĂLĂTORIA MEA", default_back_qr_label: "Scanează acest cod QR și urmărește-mi călătoriile" },
  { code: "sk", name_pl: "Słowacki", name_native: "Slovenčina", default_front_thank_you: "ĎAKUJEM, ŽE SI SÚČASŤOU MOJEJ CESTY", default_back_qr_label: "Naskenuj tento QR kód a sleduj moje cesty" },
  { code: "sl", name_pl: "Słoweński", name_native: "Slovenščina", default_front_thank_you: "HVALA, KER SI DEL MOJEGA POTOVANJA", default_back_qr_label: "Skeniraj to QR-kodo in spremljaj moja potovanja" },
  { code: "bg", name_pl: "Bułgarski", name_native: "Български", default_front_thank_you: "БЛАГОДАРЯ, ЧЕ СИ ЧАСТ ОТ МОЕТО ПЪТУВАНЕ", default_back_qr_label: "Сканирай този QR код и следвай моите пътувания" },
  { code: "lt", name_pl: "Litewski", name_native: "Lietuvių", default_front_thank_you: "AČIŪ, KAD ESI MANO KELIONĖS DALIS", default_back_qr_label: "Nuskaityk šį QR kodą ir sek mano keliones" },
  { code: "lv", name_pl: "Łotewski", name_native: "Latviešu", default_front_thank_you: "PALDIES, KA ESI DAĻA NO MANA CEĻOJUMA", default_back_qr_label: "Skenē šo QR kodu un seko maniem ceļojumiem" },
  { code: "et", name_pl: "Estoński", name_native: "Eesti", default_front_thank_you: "AITÄH, ET OLED OSA MINU TEEKONNAST", default_back_qr_label: "Skanni see QR-kood ja jälgi minu reise" },
  { code: "vi", name_pl: "Wietnamski", name_native: "Tiếng Việt", default_front_thank_you: "CẢM ƠN BẠN ĐÃ LÀ MỘT PHẦN TRONG HÀNH TRÌNH CỦA TÔI", default_back_qr_label: "Quét mã QR này và theo dõi những chuyến đi của tôi" },
  { code: "hi", name_pl: "Hinduski", name_native: "हिन्दी", default_front_thank_you: "मेरी यात्रा का हिस्सा बनने के लिए धन्यवाद", default_back_qr_label: "इस QR कोड को स्कैन करें और मेरी यात्राओं का अनुसरण करें" },
  { code: "id", name_pl: "Indonezyjski", name_native: "Bahasa Indonesia", default_front_thank_you: "TERIMA KASIH SUDAH MENJADI BAGIAN DARI PERJALANANKU", default_back_qr_label: "Pindai kode QR ini dan ikuti perjalanan saya" },
];
