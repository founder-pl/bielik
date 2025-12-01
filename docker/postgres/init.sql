-- Bielik MVP - Schemat bazy danych
-- PostgreSQL 16 + pgvector

-- Rozszerzenia
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- dla full-text search
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABELA: documents - dokumenty prawne
-- ============================================
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    source TEXT,                    -- np. 'Dz.U. 2022 poz. 1463'
    category TEXT NOT NULL,         -- ksef, b2b, zus, vat, prawo_pracy
    content TEXT NOT NULL,
    url TEXT,                       -- link do źródła
    embedding vector(4096),         -- embedding całego dokumentu (opcjonalnie)
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TABELA: chunks - fragmenty dokumentów
-- ============================================
CREATE TABLE chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(4096),         -- Bielik embeddings
    tokens INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TABELA: conversations - historia rozmów
-- ============================================
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module TEXT NOT NULL DEFAULT 'default',
    title TEXT,
    messages JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- INDEKSY
-- ============================================

-- Indeks wektorowy dla szybkiego similarity search
CREATE INDEX idx_chunks_embedding ON chunks 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Indeksy dla filtrowania
CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_source ON documents(source);
CREATE INDEX idx_chunks_document_id ON chunks(document_id);
CREATE INDEX idx_conversations_module ON conversations(module);

-- Indeks GIN dla full-text search (po polsku)
CREATE INDEX idx_chunks_content_gin ON chunks USING gin(to_tsvector('simple', content));

-- ============================================
-- FUNKCJE POMOCNICZE
-- ============================================

-- Funkcja do wyszukiwania podobnych chunków
CREATE OR REPLACE FUNCTION search_similar_chunks(
    query_embedding vector(4096),
    category_filter TEXT DEFAULT NULL,
    limit_count INTEGER DEFAULT 5
)
RETURNS TABLE (
    chunk_id INTEGER,
    document_id INTEGER,
    content TEXT,
    title TEXT,
    source TEXT,
    category TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id as chunk_id,
        c.document_id,
        c.content,
        d.title,
        d.source,
        d.category,
        1 - (c.embedding <=> query_embedding) as similarity
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE (category_filter IS NULL OR d.category = category_filter)
    ORDER BY c.embedding <=> query_embedding
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Funkcja do hybrydowego wyszukiwania (vector + full-text)
CREATE OR REPLACE FUNCTION hybrid_search(
    query_text TEXT,
    query_embedding vector(4096),
    category_filter TEXT DEFAULT NULL,
    limit_count INTEGER DEFAULT 5,
    vector_weight FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    chunk_id INTEGER,
    content TEXT,
    title TEXT,
    source TEXT,
    score FLOAT
) AS $$
BEGIN
    RETURN QUERY
    WITH vector_results AS (
        SELECT 
            c.id,
            c.content,
            d.title,
            d.source,
            1 - (c.embedding <=> query_embedding) as vector_score
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        WHERE (category_filter IS NULL OR d.category = category_filter)
        ORDER BY c.embedding <=> query_embedding
        LIMIT limit_count * 2
    ),
    text_results AS (
        SELECT 
            c.id,
            c.content,
            d.title,
            d.source,
            ts_rank(to_tsvector('simple', c.content), plainto_tsquery('simple', query_text)) as text_score
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        WHERE (category_filter IS NULL OR d.category = category_filter)
          AND to_tsvector('simple', c.content) @@ plainto_tsquery('simple', query_text)
        LIMIT limit_count * 2
    )
    SELECT DISTINCT ON (COALESCE(v.id, t.id))
        COALESCE(v.id, t.id) as chunk_id,
        COALESCE(v.content, t.content) as content,
        COALESCE(v.title, t.title) as title,
        COALESCE(v.source, t.source) as source,
        (COALESCE(v.vector_score, 0) * vector_weight + 
         COALESCE(t.text_score, 0) * (1 - vector_weight)) as score
    FROM vector_results v
    FULL OUTER JOIN text_results t ON v.id = t.id
    ORDER BY COALESCE(v.id, t.id), score DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- DANE POCZĄTKOWE - podstawowa baza wiedzy
-- ============================================

-- KSeF
INSERT INTO documents (title, source, category, content) VALUES
('Terminy wdrożenia KSeF 2026', 'Ustawa KSeF', 'ksef', 
'HARMONOGRAM WDROŻENIA KSeF:

1 LUTEGO 2026:
- WYSTAWIANIE faktur w KSeF: obowiązkowe dla firm z obrotem powyżej 200 mln zł rocznie
- ODBIERANIE faktur z KSeF: obowiązkowe dla WSZYSTKICH podatników VAT

1 KWIETNIA 2026:
- WYSTAWIANIE faktur w KSeF: obowiązkowe dla WSZYSTKICH podatników VAT

OKRES PRZEJŚCIOWY (do 31.12.2026):
- Brak kar za błędy techniczne w fakturach KSeF
- Możliwość wystawiania faktur w trybie offline z późniejszym przesłaniem do KSeF (do 24h)

OD 1 STYCZNIA 2027:
- Pełne sankcje za nieprzestrzeganie przepisów KSeF
- Kara może wynieść do 100% kwoty VAT na fakturze wystawionej poza systemem

WYŁĄCZENIA z obowiązku KSeF:
- Podatnicy zwolnieni podmiotowo z VAT (obrót do 200 tys. zł) - do końca 2026
- Faktury B2C dla konsumentów - mogą być wystawiane poza KSeF
- Bilety komunikacyjne, paragony fiskalne - wyłączone z KSeF'),

('Wymagania techniczne KSeF', 'MF', 'ksef',
'WYMAGANIA TECHNICZNE DO KORZYSTANIA Z KSeF:

1. AUTORYZACJA:
- Profil Zaufany (ePUAP)
- Kwalifikowany podpis elektroniczny
- Pieczęć elektroniczna (dla firm)
- Token KSeF (generowany w systemie)

2. FORMAT FAKTUR:
- Struktura XML zgodna ze schematem FA(3)
- Kodowanie UTF-8
- Obowiązkowe pola: NIP, data, numer, kwoty, stawki VAT

3. INTEGRACJA:
- API REST (dokumentacja na ksef.podatki.gov.pl)
- Certyfikaty SSL/TLS
- Limit 1000 faktur na godzinę (dla pojedynczego NIP)

4. TRYB AWARYJNY:
- Faktura offline ważna 24h
- Wymaga późniejszego przesłania do KSeF
- Numer nadawany przez system po przesłaniu

5. PRZECHOWYWANIE:
- Faktury w KSeF przechowywane 10 lat
- Dostęp przez API lub panel www'),

('Kary za nieprzestrzeganie KSeF', 'MF', 'ksef',
'SANKCJE ZA NIEPRZESTRZEGANIE PRZEPISÓW KSeF (od 2027):

1. FAKTURA POZA KSeF:
- Kara do 100% kwoty VAT na fakturze
- Lub do 100% kwoty podatku naliczonego (dla nabywcy)

2. BŁĘDY W FAKTURZE:
- Obowiązek korekty w ciągu 7 dni
- Brak automatycznych kar w okresie przejściowym (2026)

3. BRAK ODBIORU FAKTURY:
- Faktura uznana za doręczoną po 14 dniach od wystawienia w KSeF
- Brak możliwości powoływania się na niewiedzę

4. AWARIA SYSTEMU:
- W przypadku awarii KSeF > 24h - możliwość wystawiania faktur poza systemem
- Minister Finansów ogłasza awarię oficjalnie

UWAGA: W okresie przejściowym (2026) kary są zawieszone dla błędów technicznych.');

-- B2B vs Etat
INSERT INTO documents (title, source, category, content) VALUES
('Art. 22 Kodeksu pracy - stosunek pracy', 'Kodeks pracy', 'b2b',
'Art. 22 KODEKSU PRACY - DEFINICJA STOSUNKU PRACY:

§ 1. Przez nawiązanie stosunku pracy pracownik zobowiązuje się do wykonywania pracy określonego rodzaju na rzecz pracodawcy i pod jego kierownictwem oraz w miejscu i czasie wyznaczonym przez pracodawcę, a pracodawca - do zatrudniania pracownika za wynagrodzeniem.

§ 1¹. Zatrudnienie w warunkach określonych w § 1 jest zatrudnieniem na podstawie stosunku pracy, bez względu na nazwę zawartej przez strony umowy.

§ 1². Nie jest dopuszczalne zastąpienie umowy o pracę umową cywilnoprawną przy zachowaniu warunków wykonywania pracy, określonych w § 1.

KLUCZOWE CECHY STOSUNKU PRACY:
1. Podporządkowanie - wykonywanie poleceń pracodawcy
2. Określone miejsce pracy - wyznaczone przez pracodawcę
3. Określony czas pracy - godziny ustalone przez pracodawcę
4. Osobiste świadczenie - pracownik nie może wysłać zastępcy
5. Wynagrodzenie - stałe, niezależne od wyniku
6. Ryzyko pracodawcy - pracownik nie ponosi ryzyka gospodarczego'),

('Kryteria pozornego samozatrudnienia PIP 2026', 'PIP', 'b2b',
'KRYTERIA OCENY POZORNEGO SAMOZATRUDNIENIA - REFORMA PIP 2026:

Od 1 stycznia 2026 inspektor PIP będzie mógł DECYZJĄ ADMINISTRACYJNĄ (bez wyroku sądu) przekształcić umowę B2B w stosunek pracy.

8 KRYTERIÓW WERYFIKACJI:

1. PODPORZĄDKOWANIE
- Czy otrzymujesz polecenia służbowe JAK wykonać pracę?
- Czy musisz raportować postępy przełożonemu?
- Ryzyko: WYSOKIE jeśli tak

2. MIEJSCE PRACY
- Czy MUSISZ pracować w biurze/siedzibie klienta?
- Czy masz przydzielone stanowisko?
- Ryzyko: WYSOKIE jeśli stałe miejsce narzucone

3. CZAS PRACY
- Czy masz stałe godziny (np. 9-17)?
- Czy musisz być dostępny w określonych godzinach?
- Ryzyko: WYSOKIE jeśli narzucony grafik

4. WYŁĄCZNOŚĆ
- Czy pracujesz tylko dla JEDNEGO klienta?
- Czy umowa zabrania innych zleceń?
- Ryzyko: WYSOKIE jeśli 100% przychodu od jednego klienta > 12 miesięcy

5. BRAK RYZYKA GOSPODARCZEGO
- Czy dostajesz stałe wynagrodzenie niezależnie od wyników?
- Czy klient dostarcza wszystkie narzędzia?
- Ryzyko: WYSOKIE jeśli brak ryzyka

6. ZAKAZ KONKURENCJI
- Czy masz zakaz pracy dla konkurencji?
- Czy po zakończeniu umowy obowiązuje karencja?
- Ryzyko: ŚREDNIE (zależy od branży)

7. NARZĘDZIA PRACY
- Czy używasz WYŁĄCZNIE sprzętu klienta?
- Czy masz własne narzędzia, oprogramowanie?
- Ryzyko: WYSOKIE jeśli 100% od klienta

8. SUBSTYTUCJA
- Czy MOŻESZ wysłać kogoś innego do wykonania pracy?
- Czy umowa pozwala na podwykonawstwo?
- Ryzyko: WYSOKIE jeśli brak takiej możliwości

KONSEKWENCJE PRZEKWALIFIKOWANIA:
- Wyrównanie składek ZUS wstecz (do 5 lat)
- Wyrównanie urlopu, nadgodzin
- Grzywna dla pracodawcy do 30 000 zł
- Szacowany koszt: od 50 000 do 360 000 zł za 1 osobę'),

('Jak zabezpieczyć umowę B2B', 'Prawnik', 'b2b',
'JAK ZABEZPIECZYĆ UMOWĘ B2B PRZED PRZEKWALIFIKOWANIEM:

DOKUMENTACJA DO PRZYGOTOWANIA:

1. UMOWA B2B - kluczowe zapisy:
✓ Brak określonych godzin pracy
✓ Możliwość pracy zdalnej lub dowolnego miejsca
✓ Prawo do podwykonawstwa (substytucji)
✓ Rozliczenie za efekt, nie za czas
✓ Brak podporządkowania służbowego

2. FAKTUROWANIE:
✓ Różne kwoty na fakturach (nie stałe co miesiąc)
✓ Fakturowanie za konkretne projekty/etapy
✓ Własna numeracja faktur

3. DZIAŁALNOŚĆ:
✓ Własna strona www / portfolio
✓ Więcej niż 1 klient (nawet drobne zlecenia)
✓ Własny sprzęt, oprogramowanie (faktury)
✓ Ubezpieczenie OC działalności

4. KOMUNIKACJA:
✓ Korespondencja jako "współpraca", nie "praca"
✓ Brak określenia "przełożony", "urlop"
✓ Umowa o współpracę, nie "zatrudnienie"

CZERWONE FLAGI - do natychmiastowej zmiany:
✗ Stałe godziny pracy (9-17)
✗ Obowiązkowe biuro
✗ Podpisywanie listy obecności
✗ Urlop "za zgodą"
✗ Służbowa karta dostępu, email firmowy jako jedyny');

-- ZUS i składki
INSERT INTO documents (title, source, category, content) VALUES
('Składki ZUS 2025 dla przedsiębiorców', 'ZUS', 'zus',
'SKŁADKI ZUS 2025 DLA PRZEDSIĘBIORCÓW (JDG):

═══════════════════════════════════════
PEŁNY ZUS (standardowy):
═══════════════════════════════════════
• Emerytalna:     812,23 zł
• Rentowa:        332,90 zł  
• Chorobowa:      101,94 zł (dobrowolna)
• Wypadkowa:      ~69,49 zł (1.67%)
• Fundusz Pracy:  101,94 zł
─────────────────────────────────────
RAZEM społeczne:  ~1 418 zł
+ składka zdrowotna (osobno)

═══════════════════════════════════════
PREFERENCYJNY ZUS (pierwsze 6 miesięcy):
═══════════════════════════════════════
• Brak składek społecznych
• Tylko składka zdrowotna

═══════════════════════════════════════
MAŁY ZUS+ (dla przychodów < 120 tys./rok):
═══════════════════════════════════════
• Składki proporcjonalne do przychodu
• Podstawa = 30% minimalnego wynagrodzenia × współczynnik
• Trzeba złożyć ZUS DRA cz. II

═══════════════════════════════════════
SKŁADKA ZDROWOTNA 2025:
═══════════════════════════════════════

RYCZAŁT od przychodów ewidencjonowanych:
• Do 60 000 zł przychodu:     461,66 zł
• 60 001 - 300 000 zł:        769,43 zł
• Powyżej 300 000 zł:       1 384,97 zł

PODATEK LINIOWY (19%):
• 4,9% od dochodu
• Minimum: 314,96 zł

SKALA PODATKOWA (12%/32%):
• 9% od dochodu
• Minimum: 314,96 zł

═══════════════════════════════════════
WAŻNE TERMINY:
═══════════════════════════════════════
• ZUS DRA do 20. dnia miesiąca
• Roczne rozliczenie zdrowotnej: do 20 maja
• Korekta nadpłaty: automatyczna lub wniosek'),

('Składka zdrowotna 2026 - zmiany', 'MF', 'zus',
'ZMIANY W SKŁADCE ZDROWOTNEJ OD 2026:

NOWY MODEL (trzecia reforma w 4 lata):

═══════════════════════════════════════
SKALA PODATKOWA I LINIOWY:
═══════════════════════════════════════
• Dochód do 1,5× przeciętne wynagrodzenie:
  → Składka STAŁA: 9% od 75% minimalnego wynagrodzenia
  → Około 315 zł miesięcznie

• Dochód powyżej progu:
  → Składka stała + 4,9% od nadwyżki

═══════════════════════════════════════
RYCZAŁT:
═══════════════════════════════════════
• Przychód do 3× przeciętne wynagrodzenie:
  → Składka STAŁA (jak wyżej)

• Przychód powyżej progu:
  → Składka stała + 3,5% od nadwyżki

═══════════════════════════════════════
KLUCZOWA ZMIANA:
═══════════════════════════════════════
⚠️ LIKWIDACJA możliwości odliczania składki zdrowotnej
   od podatku dla liniowców, ryczałtowców, kartowiczów!

Dotychczasowy limit odliczenia: 12 900 zł/rok
= realne zwiększenie obciążeń dla wielu przedsiębiorców

═══════════════════════════════════════
WEJŚCIE W ŻYCIE: 1 stycznia 2026
═══════════════════════════════════════');

-- VAT
INSERT INTO documents (title, source, category, content) VALUES
('JPK_VAT - struktura i terminy', 'MF', 'vat',
'JPK_VAT (JPK_V7M / JPK_V7K) - PRZEWODNIK:

═══════════════════════════════════════
CO TO JEST JPK_VAT?
═══════════════════════════════════════
Jednolity Plik Kontrolny zawierający:
• Ewidencję sprzedaży VAT
• Ewidencję zakupów VAT
• Deklarację VAT-7

═══════════════════════════════════════
TERMINY SKŁADANIA:
═══════════════════════════════════════
• JPK_V7M (miesięczny): do 25. dnia następnego miesiąca
• JPK_V7K (kwartalny): do 25. dnia po kwartale

Przykład: VAT za styczeń 2025 → do 25 lutego 2025

═══════════════════════════════════════
OBOWIĄZKOWE OZNACZENIA GTU:
═══════════════════════════════════════
GTU_01 - alkohol
GTU_02 - paliwa
GTU_03 - oleje opałowe
GTU_04 - wyroby tytoniowe
GTU_05 - odpady
GTU_06 - elektronika
GTU_07 - pojazdy
GTU_08 - metale szlachetne
GTU_09 - leki
GTU_10 - budynki
GTU_11 - gaz cieplarniany
GTU_12 - usługi niematerialne
GTU_13 - usługi transportowe

═══════════════════════════════════════
NAJCZĘSTSZE BŁĘDY:
═══════════════════════════════════════
1. Błędny NIP kontrahenta
2. Nieprawidłowa data faktury
3. Brak oznaczenia GTU
4. Błędna stawka VAT
5. Niespójność sum kontrolnych

KARA: 500 zł za każdy błąd (po wezwaniu)

═══════════════════════════════════════
KOREKTA JPK:
═══════════════════════════════════════
• Termin: 14 dni od wezwania US
• Oznaczenie: JPK z numerem korekty (1, 2, 3...)
• Brak kary jeśli korekta przed kontrolą'),

('VAT OSS - sprzedaż do UE', 'MF', 'vat',
'VAT OSS (ONE STOP SHOP) - SPRZEDAŻ B2C DO UE:

═══════════════════════════════════════
KIEDY STOSOWAĆ VAT OSS?
═══════════════════════════════════════
• Sprzedaż towarów B2C do konsumentów w innych krajach UE
• Usługi elektroniczne, telekomunikacyjne, nadawcze dla konsumentów UE
• WNTD (wewnątrzwspólnotowa sprzedaż towarów na odległość)

═══════════════════════════════════════
PRÓG REJESTRACJI:
═══════════════════════════════════════
• 10 000 EUR łącznej sprzedaży B2C do innych krajów UE w roku
• Poniżej progu: VAT polski
• Powyżej progu: VAT kraju nabywcy LUB rejestracja VAT OSS

═══════════════════════════════════════
STAWKI VAT W UE (przykłady):
═══════════════════════════════════════
🇩🇪 Niemcy:     19%
🇫🇷 Francja:    20%
🇮🇹 Włochy:     22%
🇪🇸 Hiszpania:  21%
🇳🇱 Holandia:   21%
🇭🇺 Węgry:      27% (najwyższa w UE)
🇱🇺 Luksemburg: 17% (najniższa)

═══════════════════════════════════════
DEKLARACJA VAT OSS:
═══════════════════════════════════════
• Formularz: VIU-DO
• Częstotliwość: KWARTALNA
• Termin: do końca miesiąca po kwartale
  (np. Q1 → do 30 kwietnia)
• UWAGA: Termin NIE przesuwa się na weekend!
• Waluta: EUR
• Płatność: na konto NBP w EUR

═══════════════════════════════════════
OGRANICZENIA VAT OSS:
═══════════════════════════════════════
• Nie można odliczyć VAT naliczonego przez OSS
• Tylko sprzedaż B2C (nie B2B!)
• Ewidencja przez 10 lat
• Bramka czynna 24/7 - zawsze można złożyć');

COMMIT;
