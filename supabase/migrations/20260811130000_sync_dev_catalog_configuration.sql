-- Synchronise non-business configuration from DEV to release environments.
-- Source: DEV project xiqhaiyieisgemqopxfw, exported 2026-08-11.
-- This migration intentionally excludes users, orders, products, designs,
-- inventory units, QR codes and feature-flag state.

-- Categories are keyed by slug so each environment may keep its own UUIDs.
INSERT INTO public.categories (name, slug, icon_url, sort_order)
VALUES
  ('Natura', 'natura', NULL, 10),
  ('Architektura', 'architektura', 'https://bpxxycpeyocrwpaxnfvh.supabase.co/storage/v1/object/public/postcard-photos/categories/architektura-1784144956289.png', 20),
  ('Sztuka', 'sztuka', NULL, 30),
  ('Wydarzenia', 'wydarzenia', NULL, 40),
  ('Postacie', 'postacie', NULL, 50)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    icon_url = EXCLUDED.icon_url,
    sort_order = EXCLUDED.sort_order;

INSERT INTO public.gamification_config (id, points_per_unit, points_per_country, points_per_registration)
VALUES (1, 10, 50, 100)
ON CONFLICT (id) DO UPDATE
SET points_per_unit = EXCLUDED.points_per_unit,
    points_per_country = EXCLUDED.points_per_country,
    points_per_registration = EXCLUDED.points_per_registration;

-- Move existing named tiers out of the unique min_points range first. This
-- makes the migration safe against the older four-tier configuration.
UPDATE public.gamification_tiers
SET min_points = 1000000 + min_points
WHERE min_points IN (0, 500, 1500, 3000, 7500)
  AND name NOT IN ('Zwiadowca', 'Odkrywca', 'Ambasador', 'Misjonarz Kultury', 'Legenda Podróżówki');

UPDATE public.gamification_tiers AS tier
SET min_points = 1000000 + desired.min_points
FROM (
  VALUES
    ('Zwiadowca', 0),
    ('Odkrywca', 500),
    ('Ambasador', 1500),
    ('Misjonarz Kultury', 3000),
    ('Legenda Podróżówki', 7500)
) AS desired(name, min_points)
WHERE tier.name = desired.name;

INSERT INTO public.gamification_tiers (name, min_points)
VALUES
  ('Zwiadowca', 0),
  ('Odkrywca', 500),
  ('Ambasador', 1500),
  ('Misjonarz Kultury', 3000),
  ('Legenda Podróżówki', 7500)
ON CONFLICT (name) DO UPDATE SET min_points = EXCLUDED.min_points;

UPDATE public.gamification_tiers AS tier
SET min_points = desired.min_points
FROM (
  VALUES
    ('Zwiadowca', 0),
    ('Odkrywca', 500),
    ('Ambasador', 1500),
    ('Misjonarz Kultury', 3000),
    ('Legenda Podróżówki', 7500)
) AS desired(name, min_points)
WHERE tier.name = desired.name;

-- Language variants are matched by country ISO2, never by a DEV UUID.
INSERT INTO public.card_language_templates (
  country_id, language_code, language_name, front_thank_you_text, back_qr_label
)
SELECT country.id, variant.language_code, variant.language_name,
       variant.front_thank_you_text, variant.back_qr_label
FROM public.countries AS country
JOIN (
  VALUES
    ('AE', 'ar', 'Arabski', 'شكرًا لكونك جزءًا من رحلتي', 'امسح رمز الاستجابة السريعة هذا وتابع رحلاتي'),
    ('AU', 'en-au', 'Angielski (Australia)', 'THANK YOU FOR BEING PART OF MY JOURNEY', 'Scan this QR code and follow my travels'),
    ('CA', 'en', 'Angielski', 'THANK YOU FOR BEING PART OF MY JOURNEY', 'Scan this QR code and follow my travels'),
    ('CA', 'fr', 'Francuski', 'MERCI DE FAIRE PARTIE DE MON VOYAGE', 'Scanne ce code QR et suis mes voyages'),
    ('CN', 'zh', 'Chiński', '感谢你成为我旅程的一部分', '扫描此二维码，关注我的旅程'),
    ('CZ', 'cs', 'Czeski', 'DĚKUJI, ŽE JSI SOUČÁSTÍ MÉ CESTY', 'Naskenuj tento QR kód a sleduj mé cesty'),
    ('DE', 'de', 'Niemiecki', 'DANKE, DASS DU TEIL MEINER REISE BIST', 'Scanne diesen QR-Code und begleite meine Reisen'),
    ('ES', 'ca', 'Kataloński', 'GRÀCIES PER FORMAR PART DEL MEU VIATGE', 'Escaneja aquest codi QR i segueix els meus viatges'),
    ('ES', 'es', 'Hiszpański', 'GRACIAS POR SER PARTE DE MI VIAJE', 'Escanea este código QR y sigue mis viajes'),
    ('ES', 'eu', 'Baskijski', 'ESKERRIK ASKO NIRE BIDAIAREN PARTE IZATEAGATIK', 'Eskaneatu QR kode hau eta jarraitu nire bidaiak'),
    ('ES', 'gl', 'Galicyjski', 'GRAZAS POR FORMAR PARTE DA MIÑA VIAXE', 'Escanea este código QR e segue as miñas viaxes'),
    ('ES', 'oc', 'Araneński', 'MERCÉS PER ÈSTER PART DETH MÈU VIATGE', 'Escanège aguest còdi QR e seguís es mèus viatges'),
    ('FR', 'fr', 'Francuski', 'MERCI DE FAIRE PARTIE DE MON VOYAGE', 'Scanne ce code QR et suis mes voyages'),
    ('GB', 'en', 'Angielski', 'THANK YOU FOR BEING PART OF MY JOURNEY', 'Scan this QR code and follow my travels'),
    ('GR', 'el', 'Grecki', 'ΕΥΧΑΡΙΣΤΩ ΠΟΥ ΕΙΣΑΙ ΜΕΡΟΣ ΤΟΥ ΤΑΞΙΔΙΟΥ ΜΟΥ', 'Σκάναρε αυτόν τον κωδικό QR και ακολούθησε τα ταξίδια μου'),
    ('HR', 'hr', 'Chorwacki', 'HVALA ŠTO SI DIO MOG PUTOVANJA', 'Skeniraj ovaj QR kod i prati moja putovanja'),
    ('ID', 'id', 'Indonezyjski', 'TERIMA KASIH SUDAH MENJADI BAGIAN DARI PERJALANANKU', 'Pindai kode QR ini dan ikuti perjalanan saya'),
    ('IT', 'it', 'Włoski', 'GRAZIE PER FAR PARTE DEL MIO VIAGGIO', 'Scansiona questo codice QR e segui i miei viaggi'),
    ('JP', 'ja', 'Japoński', '私の旅の一部になってくれてありがとう', 'このQRコードをスキャンして、私の旅を追ってください'),
    ('MX', 'es', 'Hiszpański', 'GRACIAS POR SER PARTE DE MI VIAJE', 'Escanea este código QR y sigue mis viajes'),
    ('PF', 'fr', 'Francuski', 'MERCI DE FAIRE PARTIE DE MON VOYAGE', 'Scanne ce code QR et suis mes voyages'),
    ('TH', 'th', 'Tajski', 'ขอบคุณที่เป็นส่วนหนึ่งของการเดินทางของฉัน', 'สแกนคิวอาร์โค้ดนี้และติดตามการเดินทางของฉัน'),
    ('TR', 'tr', 'Turecki', 'YOLCULUĞUMUN BİR PARÇASI OLDUĞUN İÇİN TEŞEKKÜR EDERİM', 'Bu QR kodunu tara ve yolculuklarımı takip et'),
    ('US', 'en', 'Angielski', 'THANK YOU FOR BEING PART OF MY JOURNEY', 'Scan this QR code and follow my travels')
) AS variant(iso2, language_code, language_name, front_thank_you_text, back_qr_label)
  ON country.iso2 = variant.iso2
ON CONFLICT (country_id, language_code) DO UPDATE
SET language_name = EXCLUDED.language_name,
    front_thank_you_text = EXCLUDED.front_thank_you_text,
    back_qr_label = EXCLUDED.back_qr_label;
