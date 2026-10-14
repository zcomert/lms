/**
 * Türkçe yorumlar için saygısız ifade denetimi.
 *
 * Kelime listesine dayalıdır; büyük/küçük harf, Türkçe karakter (ş→s, ı→i…), leet yazımı (4→a, 0→o…),
 * harf tekrarı ("salaaak"), harflerin arasına boşluk/nokta koyma ("s.a.l.a.k"), kelimeyi parçalara
 * bölme ("geri zekalı") ve uzun hakaretlerde tek harflik yazım hatası ("gerizkalı") gibi kaçamakları
 * normalleştirerek yakalar. Masum kelimelerin içinde geçen eşleşmeleri ("hesap", "ama") yakalamamak
 * için metnin tamamında değil, kelime bazında karşılaştırır.
 */

/** Bu köklerle başlayan her kelime reddedilir (çekim ekleri dahil: "salaksın", "aptallar"…). */
const PREFIX_TERMS = [
  // Zekâ/kişilik aşağılamaları
  'salak', 'aptal', 'gerizekal', 'gerizakal', 'beyinsiz', 'zekasiz', 'kafasiz', 'ahmak', 'dangalak',
  'embesil', 'mankafa', 'malkafa', 'malherif', 'gerzek', 'denyo', 'angut', 'keriz', 'budala', 'hoduk',
  'dallama', 'andaval', 'lavuk', 'sapik', 'manyak', 'cahil', 'zibidi', 'ebleh', 'avanak', 'sersem',
  // Ahlak/onur aşağılamaları
  'serefsiz', 'namussuz', 'terbiyesiz', 'edepsiz', 'ahlaksiz', 'haysiyetsiz', 'karaktersiz', 'vicdansiz',
  'yuzsuz', 'arsiz', 'pislik', 'rezil', 'soysuz', 'adiherif',
  // Hayvan benzetmeleri
  'hayvanoglu', 'esoglu', 'esekoglu', 'itoglu', 'kopekoglu', 'domuzoglu',
  // Küfür ve argo
  'orospu', 'orosbu', 'kahpe', 'ibne', 'pust', 'yavsak', 'pezevenk', 'kaltak', 'surtuk', 'gavat',
  'kevase', 'siktir', 'sikeyim', 'sikerim', 'yarak', 'dalyarak', 'tasak', 'amina', 'amcik', 'gotveren',
  'gotlek', 'gotun', 'kodumun', 'anani', 'ananin', 'bacini',
];

/**
 * Yalnızca tam kelime olarak reddedilir. Kısa ya da başka kelimelerin başında geçebilen ifadeler
 * buradadır ("mal" → "malzeme", "esek" → "eşekarısı", "defol" → "defolu" yanlış pozitif vermesin diye).
 *
 * Not: Türkçe karakterler sadeleştirildiği için masum kelimelerle çakışan biçimler bilerek listede yok:
 * "sikis" (sıkış), "siktim" (sıktım), "oc" (öç), "alcak" (alçak basınç), "mali" (mali müşavir),
 * "it"/"lan" (IT, LAN), "kes" (kes-yapıştır).
 */
const EXACT_TERMS = [
  'mal', 'malsin', 'malsiniz', 'malmisin', 'malmisiniz',
  'amk', 'aq', 'mk', 'sg', 'pic', 'picler', 'picsin', 'esek', 'esekler', 'eseksin', 'ulan',
  'okuz', 'okuzsun', 'hayvansin', 'hayvansiniz', 'delisin', 'delisiniz', 'hiyarsin', 'itsin',
  'kopeksin', 'domuzsun', 'ayisin', 'adisin', 'alcaksin', 'alcaksiniz', 'psikopat', 'psikopatsin',
  'defol', 'defolun', 'defolsun', 'gerzeksin', 'salaksin',
];

/**
 * Parçalara bölünerek ("geri zekalı", "şeref siz") ya da tek harf hatayla ("gerizkalı", "serefsz")
 * yazılabilen uzun hakaretler. Fiil kökleri bilerek yok: "sorarım"/"sokarım", "silerim"/"sikerim"
 * gibi masum kelimeler tek harf farkla eşleşirdi.
 */
const SPLITTABLE_TERMS = [
  'gerizekal', 'beyinsiz', 'serefsiz', 'namussuz', 'terbiyesiz', 'edepsiz', 'ahlaksiz', 'haysiyetsiz',
  'karaktersiz', 'vicdansiz', 'dangalak', 'mankafa', 'pezevenk', 'orospu', 'hayvanoglu', 'esekoglu',
  'kopekoglu', 'domuzoglu',
];

/** Tek harf hatası toleransı yalnızca bu uzunluktaki köklere uygulanır. */
const MIN_FUZZY_LENGTH = 7;
/** Kaç ardışık kelimenin birleştirilerek denetleneceği ("ge ri zekalı" → 3). */
const MAX_JOINED_WORDS = 3;
/**
 * "-siz" ile bölünmüş hakaretlerde son parça bunlardan biriyse birleştirme yapılmaz:
 * "Beyin sizin en önemli organınız" → "beyinsizin" olarak yakalanmasın.
 */
const PRONOUN_TAILS = new Set(['sizin', 'sizi', 'size', 'sizce', 'sizde', 'sizden', 'sizinle']);

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' };

/** Ardışık tekrarlanan harfleri teke indirir: "salaaak" → "salak", "namussuz" → "namusuz". */
function collapseRepeats(word: string): string {
  return word.replace(/(.)\1+/g, '$1');
}

/** Türkçe karakterleri ve aksanları sadeleştirir: "Şerefsiz" → "serefsiz". */
function simplify(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Metni karşılaştırılabilir kelimelere ayırır. */
export function normalizeWords(text: string): string[] {
  const lowered = simplify(text).replace(/[013457@$!]/g, (ch) => LEET[ch]);
  const tokens = lowered.split(/[^a-z]+/).filter(Boolean);

  // "s a l a k" / "s.a.l.a.k" gibi tek harflik parçaları birleştir.
  const words: string[] = [];
  let run = '';
  for (const token of tokens) {
    if (token.length === 1) {
      run += token;
      continue;
    }
    if (run) words.push(run);
    run = '';
    words.push(token);
  }
  if (run) words.push(run);
  return words.map(collapseRepeats);
}

const prepare = (term: string) => collapseRepeats(simplify(term));
const PREFIXES = PREFIX_TERMS.map(prepare);
const EXACT = new Set(EXACT_TERMS.map(prepare));
const SPLITTABLE = SPLITTABLE_TERMS.map(prepare);

/** İki metin arasında en fazla bir harf ekleme/silme/değiştirme farkı varsa true. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Metin, bölünebilir bir hakaretle ya da onun tek harf hatalı yazımıyla başlıyorsa true.
 * Hatalı yazımda ilk iki ve son harfin tutması şartı, "terbiyesi" → "terbiyesiz" gibi
 * masum kelimelerin yakalanmasını önler.
 */
function startsWithSplittable(text: string): boolean {
  return SPLITTABLE.some((term) => {
    if (text.startsWith(term)) return true;
    if (term.length < MIN_FUZZY_LENGTH) return false;
    for (let len = term.length - 1; len <= term.length + 1 && len <= text.length; len++) {
      const head = text.slice(0, len);
      if (head.slice(0, 2) === term.slice(0, 2) && head[head.length - 1] === term[term.length - 1] && withinOneEdit(head, term)) {
        return true;
      }
    }
    return false;
  });
}

function isOffensive(word: string): boolean {
  return EXACT.has(word) || PREFIXES.some((prefix) => word.startsWith(prefix)) || startsWithSplittable(word);
}

/** Metin saygısız bir ifade içeriyorsa true döner. */
export function containsOffensiveLanguage(text: string): boolean {
  const words = normalizeWords(text);
  for (let i = 0; i < words.length; i++) {
    if (isOffensive(words[i])) return true;
    // "geri zekalı", "şeref siz", "ge ri zekalı" gibi parçalara bölünmüş ifadeler.
    let joined = words[i];
    for (let k = 1; k < MAX_JOINED_WORDS && i + k < words.length; k++) {
      if (PRONOUN_TAILS.has(words[i + k])) break;
      joined += words[i + k];
      if (startsWithSplittable(joined)) return true;
    }
  }
  return false;
}
