export interface LanguageOption {
  code: string;
  name_pl: string;
  name_native: string;
  default_front_thank_you?: string;
  default_back_qr_label?: string;
}

export const WORLD_LANGUAGES: LanguageOption[] = [
  { code: "pl", name_pl: "Polski", name_native: "Polski", default_front_thank_you: "DZIĘKUJĘ ŻE JESTEŚ Z NAMI!", default_back_qr_label: "Podziękuj autorowi za pocztówkę" },
  { code: "en", name_pl: "Angielski", name_native: "English", default_front_thank_you: "THANK YOU FOR BEING WITH US!", default_back_qr_label: "Thank the author for the postcard" },
  { code: "de", name_pl: "Niemiecki", name_native: "Deutsch", default_front_thank_you: "DANKE, DASS DU BEI UNS BIST!", default_back_qr_label: "Danke dem Autor für die Postkarte" },
  { code: "fr", name_pl: "Francuski", name_native: "Français", default_front_thank_you: "MERCI D'ÊTRE AVEC NOUS !", default_back_qr_label: "Remerciez l'auteur pour la carte postale" },
  { code: "es", name_pl: "Hiszpański", name_native: "Español", default_front_thank_you: "¡GRACIAS POR ESTAR CON NOSOTROS!", default_back_qr_label: "Agradece al autor por la tarjeta postal" },
  { code: "it", name_pl: "Włoski", name_native: "Italiano", default_front_thank_you: "GRAZIE DI ESSERE CON NOI!", default_back_qr_label: "Ringrazia l'autore per la cartolina" },
  { code: "uk", name_pl: "Ukraiński", name_native: "Українська", default_front_thank_you: "ДЯКУЄМО, ЩO ВИ З НАМИ!", default_back_qr_label: "Подякуйте автору за листівку" },
  { code: "cs", name_pl: "Czeski", name_native: "Čeština", default_front_thank_you: "DĚKUJEME, ŽE JSTE S NÁMI!", default_back_qr_label: "Poděkujte autorovi za pohlednici" },
  { code: "hr", name_pl: "Chorwacki", name_native: "Hrvatski", default_front_thank_you: "HVALA VAM ŠTO STE S NAMA!", default_back_qr_label: "Zahvalite autoru na razglednici" },
  { code: "el", name_pl: "Grecki", name_native: "Ελληνικά", default_front_thank_you: "ΕΥΧΑΡΙΣΤΟΥΜΕ ΠΟΥ ΕΙΣΤΕ ΜΑΖΙ ΜΑΣ!", default_back_qr_label: "Ευχαριστήστε τον συγγραφέα για την κάρτα" },
  { code: "hu", name_pl: "Węgierski", name_native: "Magyar", default_front_thank_you: "KÖSZÖNJÜK, HOGY VELÜNK VAN!", default_back_qr_label: "Köszönje meg a szerzőnek a képeslapot" },
  { code: "tr", name_pl: "Turecki", name_native: "Türkçe", default_front_thank_you: "BİZİMLE OLDUĞUNUZ İÇİN TEŞEKKÜRLER!", default_back_qr_label: "Yazara kartpostal için teşekkür edin" },
  { code: "th", name_pl: "Tajski", name_native: "ไทย", default_front_thank_you: "ขอบคุณที่อยู่กับเรา!", default_back_qr_label: "ขอบคุณผู้เขียนสำหรับโปสการ์ด" },
  { code: "zh", name_pl: "Chiński", name_native: "中文", default_front_thank_you: "感谢您与我们同在！", default_back_qr_label: "感谢作者发来的明信片" },
  { code: "ja", name_pl: "Japoński", name_native: "日本語", default_front_thank_you: "ご一緒いただきありがとうございます！", default_back_qr_label: "明信片の作者に感謝を伝えましょう" },
  { code: "ar", name_pl: "Arabski", name_native: "العربية", default_front_thank_you: "شكراً لكونك معنا!", default_back_qr_label: "اشكر المؤلف على البطاقة البريدية" },
  { code: "pt", name_pl: "Portugalski", name_native: "Português", default_front_thank_you: "OBRIGADO POR ESTAR CONNOSCO!", default_back_qr_label: "Agradeça ao autor pelo postal" },
  { code: "nl", name_pl: "Holenderski", name_native: "Nederlands", default_front_thank_you: "BEDANKT OM BIJ ONS TE ZIJN!", default_back_qr_label: "Bedank de auteur voor de briefkaart" },
  { code: "sv", name_pl: "Szwedzki", name_native: "Svenska", default_front_thank_you: "TACK FÖR ATT DU ÄR MED OSS!", default_back_qr_label: "Tacka författaren för vykortet" },
  { code: "no", name_pl: "Norweski", name_native: "Norsk", default_front_thank_you: "TAKK FOR AT DU ER MED OSS!", default_back_qr_label: "Takk forfatteren for postkortet" },
  { code: "da", name_pl: "Duński", name_native: "Dansk", default_front_thank_you: "TAK FORDI DU ER HOS OS!", default_back_qr_label: "Tak forfatteren for postkortet" },
  { code: "fi", name_pl: "Fiński", name_native: "Suomi", default_front_thank_you: "KIITOS KUN OLET KANSSAMME!", default_back_qr_label: "Kiitä tekijää kortista" },
  { code: "ro", name_pl: "Rumuński", name_native: "Română", default_front_thank_you: "VĂ MULȚUMIM CĂ SUNTEȚI CU NOI!", default_back_qr_label: "Mulțumiți autorului pentru cartea poștală" },
  { code: "sk", name_pl: "Słowacki", name_native: "Slovenčina", default_front_thank_you: "ĎAKUJEME, ŽE STE S NAMI!", default_back_qr_label: "Poďakujte autorovi za pohľadnicu" },
  { code: "sl", name_pl: "Słoweński", name_native: "Slovenščina", default_front_thank_you: "HVALA, KER STE Z NAMI!", default_back_qr_label: "Zahvalite se avtorju za razglednico" },
  { code: "bg", name_pl: "Bułgarski", name_native: "Български", default_front_thank_you: "БЛАГОДАРИМ ВИ, ЧЕ СТЕ С НАС!", default_back_qr_label: "Благодарете на автора за картичката" },
  { code: "lt", name_pl: "Litewski", name_native: "Lietuvių", default_front_thank_you: "AČIŪ, KAD ESATE SU MUMIS!", default_back_qr_label: "Padėkokite autoriui už atviruką" },
  { code: "lv", name_pl: "Łotewski", name_native: "Latviešu", default_front_thank_you: "PALDIES, KA ESAT KOPĀ AR MUMS!", default_back_qr_label: "Pateicieties autoram par pastkarti" },
  { code: "et", name_pl: "Estoński", name_native: "Eesti", default_front_thank_you: "AITÄH, ET OLED MEIGA!", default_back_qr_label: "Tänage autorit postkaardi eest" },
  { code: "vi", name_pl: "Wietnamski", name_native: "Tiếng Việt", default_front_thank_you: "CẢM ƠN BẠN ĐÃ ĐỒNG HÀNH CÙNG CHÚNG TÔI!", default_back_qr_label: "Cảm ơn tác giả vì bưu thiếp" },
  { code: "hi", name_pl: "Hinduski", name_native: "हिन्दी", default_front_thank_you: "हमारे साथ होने के लिए धन्यवाद!", default_back_qr_label: "पोस्टकार्ड के लिए लेखक को धन्यवाद दें" },
];
