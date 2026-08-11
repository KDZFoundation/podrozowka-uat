-- Correct the two reusable messages used by the postcard creator.
-- Existing dictionary records are updated by language code, so new designs
-- inherit the intended meaning on the front and next to the QR code.

WITH translations(language_code, front_thank_you_text, back_qr_label) AS (
  VALUES
    ('pl', 'DZIĘKUJĘ, ŻE JESTEŚ CZĘŚCIĄ MOJEJ PODRÓŻY', 'Zeskanuj ten kod QR i śledź moje podróże'),
    ('en', 'THANK YOU FOR BEING PART OF MY JOURNEY', 'Scan this QR code and follow my travels'),
    ('en-au', 'THANK YOU FOR BEING PART OF MY JOURNEY', 'Scan this QR code and follow my travels'),
    ('de', 'DANKE, DASS DU TEIL MEINER REISE BIST', 'Scanne diesen QR-Code und begleite meine Reisen'),
    ('fr', 'MERCI DE FAIRE PARTIE DE MON VOYAGE', 'Scanne ce code QR et suis mes voyages'),
    ('es', 'GRACIAS POR SER PARTE DE MI VIAJE', 'Escanea este código QR y sigue mis viajes'),
    ('it', 'GRAZIE PER FAR PARTE DEL MIO VIAGGIO', 'Scansiona questo codice QR e segui i miei viaggi'),
    ('uk', 'ДЯКУЮ, ЩО ТИ Є ЧАСТИНОЮ МОЄЇ ПОДОРОЖІ', 'Скануй цей QR-код і стеж за моїми подорожами'),
    ('cs', 'DĚKUJI, ŽE JSI SOUČÁSTÍ MÉ CESTY', 'Naskenuj tento QR kód a sleduj mé cesty'),
    ('hr', 'HVALA ŠTO SI DIO MOG PUTOVANJA', 'Skeniraj ovaj QR kod i prati moja putovanja'),
    ('el', 'ΕΥΧΑΡΙΣΤΩ ΠΟΥ ΕΙΣΑΙ ΜΕΡΟΣ ΤΟΥ ΤΑΞΙΔΙΟΥ ΜΟΥ', 'Σκάναρε αυτόν τον κωδικό QR και ακολούθησε τα ταξίδια μου'),
    ('hu', 'KÖSZÖNÖM, HOGY RÉSZE VAGY AZ UTAZÁSOMNAK', 'Szkenneld be ezt a QR-kódot, és kövesd az utazásaimat'),
    ('tr', 'YOLCULUĞUMUN BİR PARÇASI OLDUĞUN İÇİN TEŞEKKÜR EDERİM', 'Bu QR kodunu tara ve yolculuklarımı takip et'),
    ('th', 'ขอบคุณที่เป็นส่วนหนึ่งของการเดินทางของฉัน', 'สแกนคิวอาร์โค้ดนี้และติดตามการเดินทางของฉัน'),
    ('zh', '感谢你成为我旅程的一部分', '扫描此二维码，关注我的旅程'),
    ('ja', '私の旅の一部になってくれてありがとう', 'このQRコードをスキャンして、私の旅を追ってください'),
    ('ar', 'شكرًا لكونك جزءًا من رحلتي', 'امسح رمز الاستجابة السريعة هذا وتابع رحلاتي'),
    ('pt', 'OBRIGADO POR FAZERES PARTE DA MINHA VIAGEM', 'Digitaliza este código QR e acompanha as minhas viagens'),
    ('nl', 'BEDANKT DAT JE DEEL UITMAAKT VAN MIJN REIS', 'Scan deze QR-code en volg mijn reizen'),
    ('sv', 'TACK FÖR ATT DU ÄR EN DEL AV MIN RESA', 'Skanna den här QR-koden och följ mina resor'),
    ('no', 'TAKK FOR AT DU ER EN DEL AV REISEN MIN', 'Skann denne QR-koden og følg reisene mine'),
    ('da', 'TAK FORDI DU ER EN DEL AF MIN REJSE', 'Scan denne QR-kode og følg mine rejser'),
    ('fi', 'KIITOS, ETTÄ OLET OSA MATKAANI', 'Skannaa tämä QR-koodi ja seuraa matkojani'),
    ('ro', 'ÎȚI MULȚUMESC CĂ FACI PARTE DIN CĂLĂTORIA MEA', 'Scanează acest cod QR și urmărește-mi călătoriile'),
    ('sk', 'ĎAKUJEM, ŽE SI SÚČASŤOU MOJEJ CESTY', 'Naskenuj tento QR kód a sleduj moje cesty'),
    ('sl', 'HVALA, KER SI DEL MOJEGA POTOVANJA', 'Skeniraj to QR-kodo in spremljaj moja potovanja'),
    ('bg', 'БЛАГОДАРЯ, ЧЕ СИ ЧАСТ ОТ МОЕТО ПЪТУВАНЕ', 'Сканирай този QR код и следвай моите пътувания'),
    ('lt', 'AČIŪ, KAD ESI MANO KELIONĖS DALIS', 'Nuskaityk šį QR kodą ir sek mano keliones'),
    ('lv', 'PALDIES, KA ESI DAĻA NO MANA CEĻOJUMA', 'Skenē šo QR kodu un seko maniem ceļojumiem'),
    ('et', 'AITÄH, ET OLED OSA MINU TEEKONNAST', 'Skanni see QR-kood ja jälgi minu reise'),
    ('vi', 'CẢM ƠN BẠN ĐÃ LÀ MỘT PHẦN TRONG HÀNH TRÌNH CỦA TÔI', 'Quét mã QR này và theo dõi những chuyến đi của tôi'),
    ('hi', 'मेरी यात्रा का हिस्सा बनने के लिए धन्यवाद', 'इस QR कोड को स्कैन करें और मेरी यात्राओं का अनुसरण करें'),
    ('id', 'TERIMA KASIH SUDAH MENJADI BAGIAN DARI PERJALANANKU', 'Pindai kode QR ini dan ikuti perjalanan saya')
)
UPDATE public.card_language_templates AS template
SET
  front_thank_you_text = translations.front_thank_you_text,
  back_qr_label = translations.back_qr_label
FROM translations
WHERE template.language_code = translations.language_code;

-- Spain has several co-official languages. Seed the dictionary so travelers
-- can choose one as an optional second language on the front of a postcard.
INSERT INTO public.card_language_templates (
  country_id, language_code, language_name, front_thank_you_text, back_qr_label
)
SELECT
  countries.id,
  translations.language_code,
  translations.language_name,
  translations.front_thank_you_text,
  translations.back_qr_label
FROM public.countries AS countries
CROSS JOIN (
  VALUES
    ('es', 'Hiszpański', 'GRACIAS POR SER PARTE DE MI VIAJE', 'Escanea este código QR y sigue mis viajes'),
    ('ca', 'Kataloński', 'GRÀCIES PER FORMAR PART DEL MEU VIATGE', 'Escaneja aquest codi QR i segueix els meus viatges'),
    ('gl', 'Galicyjski', 'GRAZAS POR FORMAR PARTE DA MIÑA VIAXE', 'Escanea este código QR e segue as miñas viaxes'),
    ('eu', 'Baskijski', 'ESKERRIK ASKO NIRE BIDAIAREN PARTE IZATEAGATIK', 'Eskaneatu QR kode hau eta jarraitu nire bidaiak'),
    ('oc', 'Araneński', 'MERCÉS PER ÈSTER PART DETH MÈU VIATGE', 'Escanège aguest còdi QR e seguís es mèus viatges')
) AS translations(language_code, language_name, front_thank_you_text, back_qr_label)
WHERE countries.iso2 = 'ES'
ON CONFLICT (country_id, language_code) DO UPDATE
SET
  language_name = EXCLUDED.language_name,
  front_thank_you_text = EXCLUDED.front_thank_you_text,
  back_qr_label = EXCLUDED.back_qr_label;
