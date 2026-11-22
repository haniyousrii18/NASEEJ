/**
 * A person's name in the other script: Arabic ↔ Latin.
 *
 * Names are transliterated, never translated: "هاني" is "Hani", not a word that means the same thing. Common names come
 * from a small list with their usual spelling; anything else is spelled letter by letter, which is readable but not always
 * the spelling the person uses, so the settings page shows the result and lets them correct it before saving.
 * Pure and synchronous: no network, no model, no AI.
 */

const ARABIC_LETTER = /[ء-يٱ-ۓ]/;
const LATIN_LETTER = /[A-Za-z]/;

export const hasArabic = (s: string): boolean => ARABIC_LETTER.test(s);
export const hasLatin = (s: string): boolean => LATIN_LETTER.test(s);

/** Strips diacritics and tatweel and folds the letter variants people type interchangeably. */
export function normalizeArabic(s: string): string {
  return s
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

// ------------------------------------------------------------------------------------------------ common names
// [Arabic, usual English spelling, other spellings people use]. The Arabic is matched after normalizeArabic.

const NAMES: Array<[string, string, ...string[]]> = [
  ['محمد', 'Mohamed', 'Mohammed', 'Muhammad', 'Mohammad', 'Muhammed', 'Mohamad'],
  ['أحمد', 'Ahmed', 'Ahmad'],
  ['محمود', 'Mahmoud', 'Mahmood', 'Mahmud'],
  ['مصطفى', 'Mostafa', 'Mustafa', 'Moustafa'],
  ['علي', 'Ali'],
  ['عمر', 'Omar', 'Umar'],
  ['عثمان', 'Othman', 'Osman', 'Uthman'],
  ['حسن', 'Hassan', 'Hasan'],
  ['حسين', 'Hussein', 'Hussain', 'Hossein', 'Husain'],
  ['إبراهيم', 'Ibrahim', 'Ebrahim'],
  ['إسماعيل', 'Ismail', 'Esmail'],
  ['يوسف', 'Youssef', 'Yousef', 'Yusuf', 'Yousif', 'Joseph'],
  ['يسري', 'Yousry', 'Yousri', 'Yusri', 'Yosry', 'Yosri'],
  ['هاني', 'Hani', 'Hany'],
  ['خالد', 'Khaled', 'Khalid'],
  ['سعيد', 'Saeed', 'Said', 'Saed'],
  ['سعد', 'Saad'],
  ['سعود', 'Saud', 'Saoud'],
  ['فهد', 'Fahad', 'Fahd'],
  ['فيصل', 'Faisal', 'Faysal'],
  ['سلمان', 'Salman'],
  ['سليمان', 'Suleiman', 'Sulaiman', 'Soliman', 'Sulayman'],
  ['سلطان', 'Sultan'],
  ['ناصر', 'Nasser', 'Naser'],
  ['منصور', 'Mansour', 'Mansoor'],
  ['طارق', 'Tarek', 'Tariq', 'Tarik'],
  ['طه', 'Taha'],
  ['ياسر', 'Yasser', 'Yaser'],
  ['ياسين', 'Yassin', 'Yasin', 'Yaseen'],
  ['أمين', 'Amin', 'Ameen'],
  ['أيمن', 'Ayman'],
  ['أسامة', 'Osama', 'Usama'],
  ['حمزة', 'Hamza', 'Hamzah'],
  ['حامد', 'Hamed', 'Hamid'],
  ['حمدي', 'Hamdy', 'Hamdi'],
  ['مجدي', 'Magdy', 'Magdi', 'Majdi'],
  ['رامي', 'Ramy', 'Rami'],
  ['سامي', 'Samy', 'Sami'],
  ['شادي', 'Shady', 'Shadi'],
  ['فادي', 'Fady', 'Fadi'],
  ['هادي', 'Hady', 'Hadi'],
  ['مهدي', 'Mahdy', 'Mahdi'],
  ['عادل', 'Adel', 'Adil'],
  ['عاطف', 'Atef', 'Atif'],
  ['عماد', 'Emad', 'Imad'],
  ['عصام', 'Essam', 'Issam'],
  ['هشام', 'Hesham', 'Hisham'],
  ['وائل', 'Wael'],
  ['وليد', 'Waleed', 'Walid'],
  ['جمال', 'Gamal', 'Jamal'],
  ['كمال', 'Kamal'],
  ['جلال', 'Galal', 'Jalal'],
  ['بلال', 'Belal', 'Bilal'],
  ['شريف', 'Sherif', 'Sharif'],
  ['أشرف', 'Ashraf'],
  ['ممدوح', 'Mamdouh'],
  ['مدحت', 'Medhat'],
  ['رفعت', 'Refaat', 'Rifaat'],
  ['عزت', 'Ezzat', 'Izzat'],
  ['نبيل', 'Nabil', 'Nabeel'],
  ['جميل', 'Gamil', 'Jamil', 'Jameel'],
  ['كريم', 'Karim', 'Kareem'],
  ['رحيم', 'Rahim', 'Raheem'],
  ['حكيم', 'Hakim', 'Hakeem'],
  ['زياد', 'Ziad', 'Ziyad'],
  ['مراد', 'Morad', 'Murad', 'Mourad'],
  ['سامح', 'Sameh'],
  ['صلاح', 'Salah'],
  ['فلاح', 'Falah'],
  ['رضا', 'Reda', 'Ridha', 'Rida'],
  ['مازن', 'Mazen'],
  ['ماجد', 'Maged', 'Majed', 'Majid'],
  ['راشد', 'Rashed', 'Rashid'],
  ['رشيد', 'Rashid', 'Rasheed'],
  ['مالك', 'Malek', 'Malik'],
  ['أنس', 'Anas'],
  ['إياد', 'Eyad', 'Iyad'],
  ['زكريا', 'Zakaria', 'Zakariya'],
  ['يحيى', 'Yahya', 'Yehia'],
  ['موسى', 'Mousa', 'Musa', 'Moussa'],
  ['عيسى', 'Eissa', 'Isa', 'Issa'],
  ['نوح', 'Nouh', 'Nuh'],
  ['آدم', 'Adam'],
  ['بكر', 'Bakr', 'Bakir'],
  ['جابر', 'Gaber', 'Jaber'],
  ['شاكر', 'Shaker', 'Shakir'],
  ['صابر', 'Saber', 'Sabir'],
  ['ثامر', 'Thamer', 'Thamir'],
  ['تامر', 'Tamer'],
  ['عامر', 'Amer', 'Amir'],
  ['أمير', 'Amir', 'Ameer'],
  ['نادر', 'Nader'],
  ['بدر', 'Badr', 'Bader'],
  ['نور', 'Nour', 'Noor', 'Nur'],
  ['فاطمة', 'Fatma', 'Fatima', 'Fatimah'],
  ['عائشة', 'Aisha', 'Aysha', 'Aicha'],
  ['خديجة', 'Khadija', 'Khadijah'],
  ['مريم', 'Mariam', 'Maryam', 'Mariem'],
  ['زينب', 'Zeinab', 'Zainab', 'Zaynab'],
  ['سارة', 'Sara', 'Sarah'],
  ['هدى', 'Hoda', 'Huda'],
  ['منى', 'Mona', 'Muna'],
  ['نهى', 'Noha', 'Nuha'],
  ['ليلى', 'Laila', 'Layla', 'Leila'],
  ['سلمى', 'Salma'],
  ['رنا', 'Rana'],
  ['دينا', 'Dina'],
  ['ريم', 'Reem', 'Rim'],
  ['هند', 'Hend', 'Hind'],
  ['أمل', 'Amal'],
  ['أسماء', 'Asmaa', 'Asma'],
  ['أميرة', 'Amira', 'Ameera'],
  ['أميمة', 'Omaima', 'Umaima'],
  ['ياسمين', 'Yasmin', 'Yasmine', 'Yasmeen'],
  ['نادين', 'Nadine'],
  ['ندى', 'Nada'],
  ['هبة', 'Heba', 'Hiba'],
  ['إيمان', 'Eman', 'Iman'],
  ['رحاب', 'Rehab'],
  ['شيماء', 'Shaimaa', 'Shaima'],
  ['دعاء', 'Doaa', 'Duaa'],
  ['إسراء', 'Esraa', 'Israa'],
  ['آلاء', 'Alaa'],
  ['علا', 'Ola', 'Ula'],
  ['لينا', 'Lina', 'Leena'],
  ['جنا', 'Jana'],
  ['حلا', 'Hala'],
  ['هالة', 'Hala'],
  ['نجلاء', 'Naglaa', 'Najla'],
  ['سعاد', 'Soad', 'Suad'],
  ['وفاء', 'Wafaa', 'Wafa'],
  ['رشا', 'Rasha'],
  ['غادة', 'Ghada'],
  ['نسرين', 'Nesreen', 'Nisreen'],
  ['جيهان', 'Gihan', 'Jihan'],
  ['منار', 'Manar'],
  ['أبو', 'Abu', 'Abou'],
  ['بن', 'bin', 'ben'],
  ['بنت', 'bint'],
  ['عبدالله', 'Abdullah', 'Abdallah', 'Abdulla'],
  ['عبدالرحمن', 'Abdelrahman', 'Abdulrahman', 'Abdelrahman', 'Abdel Rahman', 'Abdul Rahman', 'Abdurrahman'],
  ['عبدالعزيز', 'Abdelaziz', 'Abdulaziz', 'Abdel Aziz', 'Abdul Aziz'],
  ['عبدالرحيم', 'Abdelrahim', 'Abdulrahim'],
  ['عبدالكريم', 'Abdelkarim', 'Abdulkarim'],
  ['عبدالحميد', 'Abdelhamid', 'Abdulhamid'],
  ['عبدالمجيد', 'Abdelmagid', 'Abdulmajeed'],
  ['عبدالفتاح', 'Abdelfattah', 'Abdulfattah'],
  ['عبدالحليم', 'Abdelhalim', 'Abdulhalim'],
  ['عبدالسلام', 'Abdelsalam', 'Abdulsalam'],
  ['عبدالناصر', 'Abdelnasser', 'Abdulnasser'],
  ['عبدالقادر', 'Abdelkader', 'Abdulqader'],
  ['عبدالملك', 'Abdelmalek', 'Abdulmalik'],
  ['عبدالإله', 'Abdulelah', 'Abdelilah'],
  ['المنصور', 'Al-Mansoor', 'Al Mansoor', 'Almansoor'],
  ['الله', 'Allah'],
  ['منة', 'Menna', 'Mennah'],
  ['سالم', 'Salem', 'Salim'],
  ['سمير', 'Samir', 'Sameer'],
  ['سميرة', 'Samira', 'Sameera'],
  ['طلعت', 'Talaat', 'Talat'],
  ['رحاب', 'Rehab'],
  ['ريهام', 'Reham', 'Riham'],
  ['نورهان', 'Nourhan'],
  ['شهد', 'Shahd'],
  ['مروة', 'Marwa', 'Marwah'],
  ['مروان', 'Marwan'],
  ['عمرو', 'Amr', 'Amro'],
  ['حازم', 'Hazem', 'Hazim'],
  ['باسم', 'Bassem', 'Basim'],
  ['وجدي', 'Wagdy', 'Wajdi'],
  ['سيد', 'Sayed', 'Sayyid'],
  ['السيد', 'El-Sayed', 'Elsayed', 'Al-Sayed'],
];

const AR_TO_EN = new Map<string, string>();
const EN_TO_AR = new Map<string, string>();
for (const [ar, ...spellings] of NAMES) {
  const key = normalizeArabic(ar);
  if (!AR_TO_EN.has(key)) AR_TO_EN.set(key, spellings[0]);
  for (const s of spellings) {
    const k = s.toLowerCase().replace(/[\s-]+/g, '');
    if (!EN_TO_AR.has(k)) EN_TO_AR.set(k, ar);
  }
}

const capitalize = (w: string) => (w ? w[0].toUpperCase() + w.slice(1) : w);

// ------------------------------------------------------------------------------------------------ Arabic → Latin

const CONSONANT: Record<string, string> = {
  ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: 'h', خ: 'kh', د: 'd', ذ: 'th', ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's', ض: 'd',
  ط: 't', ظ: 'z', غ: 'gh', ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', پ: 'p', چ: 'ch', گ: 'g', ڤ: 'v',
};

/** One Arabic word spelled in Latin letters, letter by letter, with the short vowels Arabic leaves unwritten guessed simply. */
function spellArabicWord(word: string): string {
  const letters = Array.from(word);
  let out = '';
  let prevConsonant = false;
  letters.forEach((ch, i) => {
    const last = i === letters.length - 1;
    if (ch === 'ا') {
      out += 'a';
      prevConsonant = false;
    } else if (ch === 'و') {
      if (i === 0) out += 'w';
      else out += prevConsonant || last ? 'ou' : 'w';
      prevConsonant = i === 0;
    } else if (ch === 'ي') {
      if (i === 0) {
        out += 'y';
        prevConsonant = true;
      } else {
        out += last ? 'i' : prevConsonant ? 'ee' : 'y';
        prevConsonant = false;
      }
    } else if (ch === 'ع') {
      // ع carries an "a" sound in most names: "طلعت" Talat, "سعدون" Sadoun.
      if (letters[i + 1] !== 'ا' && letters[i - 1] !== 'ا') out += 'a';
      prevConsonant = false;
    } else if (ch === 'ء' || ch === 'ئ' || ch === 'ؤ') {
      prevConsonant = false;
    } else if (ch === 'ه' && last && i > 0) {
      out += 'a'; // ة, folded to ه, at the end of a name
      prevConsonant = false;
    } else if (CONSONANT[ch]) {
      // Arabic does not write short vowels; a name that opens with two consonants almost always has an "a" between them.
      if (prevConsonant && i === 1) out += 'a';
      out += CONSONANT[ch];
      prevConsonant = true;
    }
  });
  return capitalize(out.replace(/(.)\1{2,}/g, '$1$1'));
}

function arabicWordToLatin(word: string): string {
  const w = normalizeArabic(word);
  const known = AR_TO_EN.get(w);
  if (known) return known;
  if (w.startsWith('عبدال') && w.length > 5) return `Abdel${spellArabicWord(w.slice(5)).toLowerCase()}`;
  if (w.startsWith('ال') && w.length > 3) {
    const rest = AR_TO_EN.get(w.slice(2)) ?? spellArabicWord(w.slice(2));
    return `Al-${rest}`;
  }
  return spellArabicWord(w);
}

export function arabicToLatin(name: string): string {
  const words = normalizeArabic(name).trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    // "عبد الرحمن" written as two words is one name.
    if (words[i] === 'عبد' && words[i + 1]) {
      out.push(arabicWordToLatin(`عبد${words[i + 1]}`));
      i++;
      continue;
    }
    out.push(hasArabic(words[i]) ? arabicWordToLatin(words[i]) : words[i]);
  }
  return out.join(' ');
}

// ------------------------------------------------------------------------------------------------ Latin → Arabic

const DIGRAPH: Array<[string, string]> = [
  ['kh', 'خ'], ['sh', 'ش'], ['gh', 'غ'], ['th', 'ث'], ['dh', 'ذ'], ['ch', 'تش'], ['ph', 'ف'],
  ['ou', 'و'], ['oo', 'و'], ['ee', 'ي'], ['ei', 'ي'], ['ie', 'ي'], ['ai', 'اي'], ['ay', 'اي'], ['aa', 'ا'],
];
const SINGLE: Record<string, string> = {
  b: 'ب', c: 'ك', d: 'د', f: 'ف', g: 'ج', h: 'ه', j: 'ج', k: 'ك', l: 'ل', m: 'م', n: 'ن', p: 'ب', q: 'ق', r: 'ر',
  s: 'س', t: 'ت', v: 'ف', w: 'و', x: 'كس', z: 'ز', a: 'ا', i: 'ي', o: 'و', u: 'و', e: 'ي', y: 'ي',
};
const VOWEL_START: Record<string, string> = { a: 'أ', e: 'إ', i: 'إ', o: 'أو', u: 'أو' };

function spellLatinWord(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  let out = '';
  let i = 0;
  while (i < w.length) {
    const rest = w.slice(i);
    if (i === 0 && VOWEL_START[w[0]] && !DIGRAPH.some(([d]) => rest.startsWith(d) && d !== 'aa' && d !== 'ai' && d !== 'ay')) {
      out += VOWEL_START[w[0]];
      i++;
      continue;
    }
    const di = DIGRAPH.find(([d]) => rest.startsWith(d));
    if (di) {
      out += i === 0 && /^[aeiou]/.test(di[0]) ? `ا${di[1]}`.replace(/^اا/, 'آ') : di[1];
      i += 2;
      continue;
    }
    const ch = w[i];
    const last = i === w.length - 1;
    if (ch === 'e' && last && i > 0) {
      i++; // a silent final "e", as in "Nadine"
      continue;
    }
    if (ch === 'h' && i > 0 && /[aeiou]/.test(w[i - 1]) && !/[aeiou]/.test(w[i + 1] ?? '') && !last) {
      // a silent "h" after a vowel, as in "John"
    } else if (ch === 'e' && i > 0 && !last && /[^aeiou]/.test(w[i - 1]) && !/[aeiou]/.test(w.slice(0, i))) out += 'ي';
    else if (ch === 'c' && /[eiy]/.test(w[i + 1] ?? '')) out += 'س';
    else if (ch === 'a' && last) out += 'ا';
    else if (ch === 'a' && !last && i > 0 && /[^aeiou]/.test(w[i - 1]) && /[^aeiou]/.test(w[i + 1])) out += i === w.length - 2 ? 'ا' : '';
    else if (ch === 'e' && i > 0 && !last) out += '';
    else out += SINGLE[ch] ?? '';
    i++;
  }
  // A letter typed twice ("Hassan") is written once.
  return out.replace(/([^\sاوي])\1+/g, '$1');
}

function latinWordToArabic(word: string): string {
  const key = word.toLowerCase().replace(/-/g, '');
  const known = EN_TO_AR.get(key);
  if (known) return known;
  const al = /^(al|el)-?(.+)$/i.exec(word);
  if (al && al[2].length > 2) {
    const k = al[2].toLowerCase();
    return `ال${EN_TO_AR.get(k) ?? spellLatinWord(al[2])}`;
  }
  if (/^abd(el|ul|al)?.{3,}$/i.test(word)) {
    const rest = word.replace(/^abd(el|ul|al)?/i, '');
    return `عبد${rest.toLowerCase().startsWith('al') ? '' : 'ال'}${EN_TO_AR.get(rest.toLowerCase()) ?? spellLatinWord(rest)}`;
  }
  return spellLatinWord(word);
}

export function latinToArabic(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    // "Abdel Rahman" / "Abdul Aziz" written as two words is one name.
    if (/^abd(el|ul|al)?$/i.test(words[i]) && words[i + 1]) {
      const joined = EN_TO_AR.get(`${words[i]}${words[i + 1]}`.toLowerCase());
      if (joined) {
        out.push(joined);
        i++;
        continue;
      }
    }
    out.push(hasLatin(words[i]) ? latinWordToArabic(words[i]) : words[i]);
  }
  return out.join(' ');
}

// ------------------------------------------------------------------------------------------------ both names

/**
 * Both versions of a name from what the person typed. A side they gave is kept as typed; a missing side, or a side typed
 * in the wrong script (an Arabic name in the English field), is written from the other.
 */
export function completeName(input: { ar?: string | null; en?: string | null }): { ar: string; en: string } {
  const ar = (input.ar ?? '').trim().replace(/\s+/g, ' ');
  const en = (input.en ?? '').trim().replace(/\s+/g, ' ');
  const arOk = !!ar && hasArabic(ar) && !hasLatin(ar);
  const enOk = !!en && hasLatin(en) && !hasArabic(en);
  if (arOk && enOk) return { ar, en };
  if (arOk) return { ar, en: arabicToLatin(ar) };
  if (enOk) return { ar: latinToArabic(en), en };
  // Neither side is in its own script: work from whichever has the letters we can read.
  const source = ar || en;
  if (hasArabic(source)) return { ar: source, en: arabicToLatin(source) };
  if (hasLatin(source)) return { ar: latinToArabic(source), en: source };
  return { ar: source, en: source };
}
