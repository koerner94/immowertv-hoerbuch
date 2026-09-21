/* ImmoWertV Rechenwege - Ablauf
   Vier Lernsysteme stecken hier drin:
   1. verblassende Musterloesungen (Stufen 0 bis 4, rueckwaerts verblassend)
   2. Abrufen statt Nachlesen mit verteiltem Wiederholen (FSRS-5 Planer)
   3. gemischtes Ueben (Karten aus allen Ketten durcheinander, Verfahrenswahl)
   4. Selbst-Erklaeren und Haeppchen (ein Schritt je Bildschirm, Warum-Frage vor der Antwort)
*/

/* =============================================================== Werkzeug */
const $ = (s, w) => (w || document).querySelector(s);
const el = (tag, klasse, text) => {
  const n = document.createElement(tag);
  if (klasse) n.className = klasse;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
};
const heute = () => new Date().toISOString().slice(0, 10);
const tagePlus = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(0, Math.round(n)));
  return d.toISOString().slice(0, 10);
};
const mische = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function zahl(n, nk) {
  if (typeof n !== 'number' || !isFinite(n)) return String(n);
  return n.toLocaleString('de-DE', { minimumFractionDigits: nk, maximumFractionDigits: nk });
}
function fmt(wert, einheit) {
  if (wert === undefined || wert === null) return '?';
  switch (einheit) {
    case 'eur': return zahl(Math.round(wert), 0) + ' €';
    case 'eur_jahr': return zahl(Math.round(wert), 0) + ' €/Jahr';
    case 'eur_qm': return zahl(wert, wert % 1 ? 2 : 0) + ' €/m²';
    case 'eur_qm_monat': return zahl(wert, 2) + ' €/m²·Monat';
    case 'qm': return zahl(wert, 0) + ' m²';
    case 'jahre': return zahl(wert, 0) + ' Jahre';
    case 'prozent': return zahl(wert, 1) + ' %';
    case 'faktor': return zahl(wert, Math.abs(wert * 100 % 1) < 1e-9 ? 2 : (Math.abs(wert * 1000 % 1) < 1e-9 ? 3 : 4));
    default: return String(wert);
  }
}
function einheitKurz(e) {
  return { eur: '€', eur_jahr: '€ im Jahr', eur_qm: '€ je m²', eur_qm_monat: '€ je m² und Monat', qm: 'm²', jahre: 'Jahre', prozent: '%', faktor: 'Faktor' }[e] || '';
}
/* Ein Punkt ist im Deutschen Tausenderpunkt, in vielen Tastaturen aber das Komma.
   "1.500" kann 1500 oder 1,5 heissen. Deshalb werden alle sinnvollen Lesarten
   zurueckgegeben, und die Pruefung nimmt jede, die passt. */
function leseZahlen(s) {
  s = String(s).trim().replace(/[\s €%]/g, '');
  if (s === '') return [];
  const raus = [];
  if (s.indexOf(',') >= 0) {
    raus.push(parseFloat(s.replace(/\./g, '').replace(',', '.')));
  } else {
    raus.push(parseFloat(s.replace(/\./g, '')));
    if ((s.match(/\./g) || []).length === 1) raus.push(parseFloat(s));
  }
  return raus.filter(x => !isNaN(x));
}
const leseZahl = (s) => { const a = leseZahlen(s); return a.length ? a[0] : NaN; };
function toleranz(einheit, soll) {
  switch (einheit) {
    case 'eur': case 'eur_jahr': return Math.max(1, Math.abs(soll) * 0.005);
    case 'eur_qm': case 'eur_qm_monat': return Math.max(0.01, Math.abs(soll) * 0.005);
    case 'faktor': return 0.005;
    case 'prozent': return 0.05;
    default: return 0.5;
  }
}

/* =============================================================== Speicher */
const SCHLUESSEL = 'immowertv-rechenwege-v1';
let SP = { planer: {}, stufen: {}, laeufe: 0, letzterTag: null, serie: 0 };
function laden() {
  try { const r = localStorage.getItem(SCHLUESSEL); if (r) SP = Object.assign(SP, JSON.parse(r)); } catch (e) {}
}
function sichern() {
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify(SP)); } catch (e) {}
}
laden();

/* =============================================================== FSRS-5
   Freier Wiederholungsplaner. Formeln und Standardgewichte aus dem Wiki des
   Projekts open-spaced-repetition. Er schaetzt fuer jede Karte Stabilitaet und
   Schwierigkeit und legt den naechsten Termin so, dass du sie mit 90 Prozent
   Wahrscheinlichkeit noch weisst. Das spart gegenueber dem alten SM-2 rund
   20 bis 30 Prozent der Wiederholungen. */
const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
           1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const DECAY = -0.5, FACTOR = 19 / 81, ZIEL_R = 0.9;

const fsrsR = (t, s) => Math.pow(1 + FACTOR * t / s, DECAY);
const klemm = (x, a, b) => Math.min(b, Math.max(a, x));
const fsrsD0 = (g) => klemm(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);
function fsrsD(d, g) {
  const dd = -W[6] * (g - 3);
  const d1 = d + dd * (10 - d) / 9;
  return klemm(W[7] * fsrsD0(4) + (1 - W[7]) * d1, 1, 10);
}
function fsrsSErfolg(d, s, r, g) {
  const hart = g === 2 ? W[15] : 1, leicht = g === 4 ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hart * leicht);
}
function fsrsSVergessen(d, s, r) {
  const sf = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
  return Math.min(sf, s);
}
const fsrsAbstand = (s) => Math.max(1, s / FACTOR * (Math.pow(ZIEL_R, 1 / DECAY) - 1));

function planen(id, note) {
  const k = SP.planer[id];
  const jetzt = heute();
  let z;
  if (!k || !k.s) {
    z = { s: W[note - 1], d: fsrsD0(note), reps: 1, lapses: note === 1 ? 1 : 0 };
  } else {
    const tage = Math.max(0, (new Date(jetzt) - new Date(k.last || jetzt)) / 86400000);
    const r = fsrsR(tage, k.s);
    z = {
      s: note === 1 ? fsrsSVergessen(k.d, k.s, r) : fsrsSErfolg(k.d, k.s, r, note),
      d: fsrsD(k.d, note),
      reps: (k.reps || 0) + 1,
      lapses: (k.lapses || 0) + (note === 1 ? 1 : 0)
    };
  }
  z.s = klemm(z.s, 0.01, 36500);
  z.last = jetzt;
  z.due = note === 1 ? jetzt : tagePlus(fsrsAbstand(z.s));
  SP.planer[id] = z;
  sichern();
  return z;
}
const istFaellig = (id) => { const k = SP.planer[id]; return !k || !k.due || k.due <= heute(); };

/* =============================================================== Karten */
let KARTEN = [];
function bauKarten() {
  const k = [];
  KETTEN.forEach(kette => {
    kette.schritte.forEach((s, i) => {
      const t = kette.name;
      k.push({ id: kette.id + '|' + s.id + '|par', t, kette: kette.id, f: 'Welche Fundstelle regelt: ' + s.name + '?', a: s.paragraf });
      k.push({ id: kette.id + '|' + s.id + '|fml', t, kette: kette.id, f: (s.rechnen ? 'Woraus rechnest du ' : 'Was steckt hinter ') + s.name + '?', a: s.formel });
      const n = kette.schritte[i + 1];
      if (n) k.push({ id: kette.id + '|' + s.id + '|nxt', t, kette: kette.id, f: 'Kette ' + kette.name + ': Was kommt direkt nach ' + s.name + '?', a: n.name + '  —  ' + n.paragraf });
      if (s.stufe !== 'eingang') {
        const st = STUFEN.find(x => x.id === s.stufe);
        k.push({ id: kette.id + '|' + s.id + '|stf', t, kette: kette.id, f: 'In welchem Schritt des Paragrafen 6 Absatz 3 steckt ' + s.name + '?', a: st.kurz + ': ' + st.name });
      }
      if (s.falle) k.push({ id: kette.id + '|' + s.id + '|fal', t, kette: kette.id, f: 'Welcher Fehler lauert bei ' + s.name + '?', a: s.falle });
    });
  });
  const gesehen = {};
  KETTEN.forEach(kette => kette.schritte.forEach(s => {
    const b = MERKBILDER[s.pnr];
    if (!b || gesehen[s.pnr]) return;
    gesehen[s.pnr] = 1;
    k.push({ id: 'bild|' + s.pnr + '|a', t: 'Merkbilder', kette: 'bild', f: 'Welches Merkbild gehoert zu Paragraf ' + s.pnr + '?', a: b.wort + '  —  ' + b.szene });
    k.push({ id: 'bild|' + s.pnr + '|b', t: 'Merkbilder', kette: 'bild', f: 'Merkbild ' + b.wort + ': welcher Paragraf, und was regelt er?', a: 'Paragraf ' + s.pnr + '. ' + b.szene });
  }));
  EXTRA_KARTEN.forEach((x, i) => k.push({ id: 'extra|' + i, t: x.t, kette: 'extra', f: x.f, a: x.a }));
  VERFAHRENSFAELLE.forEach((x, i) => k.push({ id: 'wahl|' + i, t: 'Verfahrenswahl', kette: 'wahl', f: 'Welches Verfahren, und warum? ' + x.fall, a: x.verfahren + '. ' + x.grund }));
  KARTEN = k;
}

/* =============================================================== Zustand */
let ANSICHT = 'start';
let L = null;
let A = null;

function sollWerte(kette) {
  const w = {};
  kette.schritte.forEach(s => { w[s.id] = s.rechnen ? s.rechnen(w) : s.wert; });
  return w;
}
const stufeVon = (kid) => SP.stufen[kid] || 0;

const STUFENNAMEN = [
  { n: 'Vorgerechnet', b: 'Du siehst jeden Schritt mit Zahl und Erklaerung. Nur lesen und verstehen.' },
  { n: 'Letzter Schritt selbst', b: 'Alles vorgerechnet bis auf den Schluss. Der erste kleine Sprung.' },
  { n: 'Zweite Haelfte selbst', b: 'Die Stuetzen verschwinden von hinten nach vorn.' },
  { n: 'Alles selbst', b: 'Nur die Eingangsdaten stehen da. Du rechnest die ganze Kette.' },
  { n: 'Blind', b: 'Du musst vor jedem Schritt auch sagen, welcher Schritt jetzt dran ist.' }
];

/* =============================================================== Ansichten */
function zeige(ziel, arg) {
  ANSICHT = ziel;
  const b = $('#buehne');
  b.innerHTML = '';
  window.scrollTo(0, 0);
  document.querySelectorAll('#leiste button').forEach(x => x.classList.toggle('an', x.dataset.ziel === ziel));
  $('#zurueck').hidden = (ziel === 'start' || ziel === 'abfrage' || ziel === 'karte' || ziel === 'bilder');
  ({ start: vStart, wahl: vWahl, lauf: vLauf, ende: vEnde, abfrage: vAbfrage, karte: vKarte, uebersicht: vUebersicht, bilder: vBilder, hilfe: vHilfe })[ziel](b, arg);
  faelligZaehlen();
}
function kopf(titel, sub) { $('#kopftitel').textContent = titel; $('#kopfsub').textContent = sub || ''; }
function faelligZaehlen() {
  const n = KARTEN.filter(k => istFaellig(k.id)).length;
  $('#faellig').textContent = n > 999 ? '999' : (n || '');
}

/* ----------------------------------------------------------------- Start */
function vStart(b) {
  kopf('ImmoWertV Rechenwege', 'Rechnen, verstehen, behalten');
  const faellig = KARTEN.filter(k => istFaellig(k.id)).length;
  if (faellig) {
    const k = el('button', 'kachel');
    k.style.borderLeftColor = 'var(--gut)';
    k.appendChild(el('b', null, faellig + ' Karten sind heute dran'));
    k.appendChild(el('small', null, 'Abrufen statt Nachlesen. Fuenf Minuten reichen.'));
    k.onclick = () => zeige('abfrage');
    b.appendChild(k);
  }
  b.appendChild(el('h2', null, 'Rechenwege'));
  b.appendChild(el('p', 'hin', 'Waehle eine Kette. Ein Schritt je Bildschirm, mit Fundstelle, Merkbild und Erklaerung daneben.'));
  KETTEN.forEach(kt => {
    const st = stufeVon(kt.id);
    const k = el('button', 'kachel');
    k.style.borderLeftColor = kt.farbe;
    k.appendChild(el('b', null, kt.name));
    k.appendChild(el('small', null, kt.untertitel));
    const z = el('div', 'zeile2', kt.schritte.length + ' Schritte  ·  Stufe ' + st + ': ' + STUFENNAMEN[st].n);
    k.appendChild(z);
    k.onclick = () => zeige('wahl', kt.id);
    b.appendChild(k);
  });

  b.appendChild(el('h2', null, 'Wie das hier funktioniert'));
  const h = el('button', 'kachel');
  h.style.borderLeftColor = 'var(--leise)';
  h.appendChild(el('b', null, 'Die vier Lernsysteme dahinter'));
  h.appendChild(el('small', null, 'Warum die App so gebaut ist, und wie du sie am besten benutzt.'));
  h.onclick = () => zeige('hilfe');
  b.appendChild(h);

  const f = el('div', 'fuss');
  f.innerHTML = 'Fachliche Grundlage: amtlicher Text der ImmoWertV auf gesetze-im-internet.de. ' +
    'Die Merkbilder sind dieselben wie im <a href="../">ImmoWertV Merktrainer</a>. ' +
    'Zu jeder Kette gibt es eine Podcast-Folge mit denselben Bildern.';
  b.appendChild(f);
}

/* ------------------------------------------------------------------ Hilfe */
function vHilfe(b) {
  kopf('Wie das hier funktioniert', 'Die vier Systeme dahinter');
  const t = [
    ['Verblassende Musterloesungen', 'Stufe 0 rechnet dir alles vor. Stufe 1 laesst den letzten Schritt offen, Stufe 2 die hintere Haelfte, Stufe 3 alles, Stufe 4 verlangt zusaetzlich, dass du den naechsten Schritt selbst benennst. Die Stuetzen verschwinden von hinten nach vorn. Das ist der belegte Weg vom Zuschauen zum Koennen: Anfaenger lernen aus vorgerechneten Beispielen mehr als aus freiem Ueben, und wer zu frueh ganz allein rechnet, verbraucht seinen Kopf mit Suchen statt mit Verstehen.'],
    ['Abrufen statt Nachlesen', 'Die Abfrage zeigt dir eine Frage, du antwortest im Kopf, erst dann kommt die Loesung. Sich zu erinnern ist anstrengender als zu lesen, und genau deshalb bleibt es haengen. Zusammen mit dem verteilten Wiederholen sind das die beiden Techniken, die in den grossen Uebersichtsarbeiten als einzige die Bestnote bekommen.'],
    ['Verteiltes Wiederholen', 'Jede Karte bekommt ihren eigenen Termin. Der Planer schaetzt, wann du sie fast vergessen haettest, und legt die Wiederholung genau dorthin. Kurz vor dem Vergessen zu ueben bringt am meisten. Der Planer ist FSRS-5 und braucht dafuer rund ein Viertel weniger Wiederholungen als die aelteren Verfahren.'],
    ['Gemischt ueben', 'Die Karten kommen durcheinander, aus allen vier Ketten. Das fuehlt sich schwerer an als Block fuer Block, und genau das ist der Punkt: Nur so lernst du zu erkennen, welches Verfahren ueberhaupt dran ist. Dafuer gibt es zusaetzlich die Karten zur Verfahrenswahl.'],
    ['Selbst erklaeren', 'Nach jedem Schritt kommt die Frage, warum dieser Schritt an dieser Stelle steht. Sag die Antwort laut, bevor du sie aufklappst. Das Erklaeren in eigenen Worten ist einer der staerksten Einzeleffekte, die die Lernforschung kennt.'],
    ['Haeppchen', 'Ein Schritt je Bildschirm, nie mehr. Darueber der Rechenzettel mit allem, was schon steht, darunter das Band mit den drei Schritten des Paragrafen 6. Du weisst dadurch jederzeit, wo du bist.']
  ];
  t.forEach(([n, x]) => {
    const d = el('div', 'bildkarte');
    d.appendChild(el('div', 'wort', n));
    d.appendChild(el('p', null, x));
    b.appendChild(d);
  });
  b.appendChild(el('h2', null, 'So gehst du am besten vor'));
  const o = el('div', 'bildkarte');
  o.appendChild(el('p', null, '1. Hoere die Podcast-Folge zur Kette im Auto. Dieselben Bilder, dieselben Zahlen.'));
  o.appendChild(el('p', null, '2. Gehe die Kette einmal auf Stufe 0 durch und lies die Warum-Abschnitte.'));
  o.appendChild(el('p', null, '3. Am naechsten Tag Stufe 1, dann Stufe 2 und so weiter. Nicht alles an einem Tag.'));
  o.appendChild(el('p', null, '4. Taeglich fuenf Minuten Abfrage. Das ist der Teil, der die Fundstellen einbrennt.'));
  o.appendChild(el('p', null, '5. Die Karte ist dein Spickzettel. Schau dort nach, wenn du den Faden verlierst.'));
  b.appendChild(o);
  const f = el('div', 'fuss');
  f.textContent = 'Der Fortschritt liegt nur auf diesem Geraet, im Speicher des Browsers. Es wird nichts hochgeladen und nichts gemessen.';
  b.appendChild(f);
}

/* ------------------------------------------------------------- Stufenwahl */
function vWahl(b, kid) {
  const kt = KETTEN.find(x => x.id === kid);
  kopf(kt.name, kt.untertitel);
  b.appendChild(el('p', 'hin', kt.kurz));

  const o = el('div', 'bildkarte');
  o.appendChild(el('div', 'lt', 'Das Beispielobjekt'));
  o.appendChild(el('p', null, kt.objekt));
  b.appendChild(o);

  b.appendChild(el('h2', null, 'Stufe waehlen'));
  b.appendChild(el('p', 'hin', 'Die Stuetzen verschwinden von hinten nach vorn. Fang oben an und geh erst weiter, wenn eine Stufe ohne Fehler sitzt.'));
  const erreicht = stufeVon(kid);
  const max = kt.ohneZahlen ? 2 : 5;
  for (let s = 0; s < max; s++) {
    const nm = kt.ohneZahlen ? [{ n: 'Durchlesen', b: 'Die sechs Stationen mit Erklaerung.' }, { n: 'Reihenfolge selbst', b: 'Du sagst vor jeder Station, was jetzt dran ist.' }][s] : STUFENNAMEN[s];
    const k = el('button', 'kachel');
    k.style.borderLeftColor = s <= erreicht ? kt.farbe : 'var(--linie)';
    k.appendChild(el('b', null, 'Stufe ' + s + ': ' + nm.n + (s === erreicht ? '   ◀ hier stehst du' : '')));
    k.appendChild(el('small', null, nm.b));
    k.onclick = () => { starteLauf(kid, s); zeige('lauf'); };
    b.appendChild(k);
  }

  b.appendChild(el('h2', null, 'Dazu passend'));
  const u = el('button', 'kachel');
  u.style.borderLeftColor = 'var(--leise)';
  u.appendChild(el('b', null, 'Die Karte dieser Kette'));
  u.appendChild(el('small', null, 'Alle Schritte auf einen Blick, mit Werten und Fundstellen.'));
  u.onclick = () => zeige('uebersicht', kid);
  b.appendChild(u);

  const p = el('a', 'kachel');
  p.style.borderLeftColor = 'var(--leise)';
  p.href = '../rechenwege-' + String(kt.folge).padStart(2, '0') + '-085.mp3';
  p.appendChild(el('b', null, 'Podcast-Folge ' + kt.folge + ' zum Hoeren'));
  p.appendChild(el('small', null, 'Dieselbe Kette, dieselben Zahlen, dieselben Bilder. Tempo 0,85.'));
  b.appendChild(p);
}

/* -------------------------------------------------------------- Der Lauf */
function starteLauf(kid, stufe) {
  const kt = KETTEN.find(x => x.id === kid);
  const rechen = kt.schritte.filter(s => s.rechnen);
  let offenAb;
  if (kt.ohneZahlen || stufe === 0) offenAb = rechen.length;
  else if (stufe === 1) offenAb = Math.max(0, rechen.length - 1);
  else if (stufe === 2) offenAb = Math.max(0, rechen.length - Math.ceil(rechen.length / 2));
  else offenAb = 0;
  L = {
    kt, stufe, i: 0,
    soll: sollWerte(kt),
    werte: {},
    offen: new Set(rechen.slice(offenAb).map(s => s.id)),
    ordnungsfrage: (stufe >= 4) || (kt.ohneZahlen && stufe >= 1),
    fehler: 0, versuch: 0, gezeigt: false, ordnungOk: false, start: Date.now()
  };
}

function vLauf(b) {
  const kt = L.kt, s = kt.schritte[L.i];
  kopf(kt.name, 'Schritt ' + (L.i + 1) + ' von ' + kt.schritte.length + '  ·  Stufe ' + L.stufe);

  /* Band der drei Schritte des Paragrafen 6 */
  const band = el('div', 'band');
  const idx = STUFEN.findIndex(x => x.id === s.stufe);
  STUFEN.forEach((st, i) => {
    const d = el('div', i === idx ? 'an' : (i < idx ? 'war' : ''), st.kurz);
    d.title = st.name;
    band.appendChild(d);
  });
  b.appendChild(band);
  b.appendChild(el('div', 'bandtext', STUFEN[idx].name));

  const fo = el('div', 'fortschritt');
  const fi = el('i'); fi.style.width = (L.i / kt.schritte.length * 100) + '%';
  fo.appendChild(fi); b.appendChild(fo);

  /* Rechenzettel: was schon steht. Lang gewordene Zettel werden oben eingeklappt,
     damit die aktuelle Karte nicht aus dem Bild rutscht. */
  const z = el('div', 'zettel');
  const fertig = kt.schritte.slice(0, L.i);
  const ab = (L.zettelGanz || fertig.length <= 6) ? 0 : fertig.length - 5;
  if (ab > 0) {
    const auf = el('button', 'zeile-kommend');
    auf.style.cssText = 'width:100%;font:inherit;background:transparent;border:0;cursor:pointer;color:var(--leise);font-size:.8rem';
    auf.textContent = '▸ ' + ab + ' weitere Schritte anzeigen';
    auf.onclick = () => { L.zettelGanz = true; zeige('lauf'); };
    z.appendChild(auf);
  }
  fertig.slice(ab).forEach((x, i) => {
    const r = el('button', 'zeile-fertig' + (x.id === kt.ergebnisId ? ' hoehepunkt' : ''));
    r.appendChild(el('span', 'nr', (ab + i + 1) + ''));
    r.appendChild(el('span', 'nm', x.name));
    r.appendChild(el('span', 'wt', fmt(L.werte[x.id], x.einheit)));
    r.onclick = () => zeigeSchrittFenster(x, L.werte[x.id]);
    z.appendChild(r);
  });
  b.appendChild(z);

  /* Ordnungsfrage vor dem Schritt */
  if (L.ordnungsfrage && !L.ordnungOk) { b.appendChild(ordnungsKarte(s)); return; }

  b.appendChild(schrittKarte(s));

  /* Vorschau auf die naechsten Schritte, nur in den unteren Stufen */
  if (L.stufe <= 2 && !L.ordnungsfrage) {
    const rest = kt.schritte.slice(L.i + 1);
    if (rest.length) {
      b.appendChild(el('div', 'gruppe', 'was noch kommt'));
      rest.forEach((x, i) => {
        const r = el('div', 'zeile-kommend');
        r.appendChild(el('span', 'nr', (L.i + 2 + i) + ''));
        r.appendChild(el('span', 'nm', x.name));
        b.appendChild(r);
      });
    }
  }
}

function ordnungsKarte(s) {
  const kt = L.kt;
  const karte = el('div', 'schritt');
  karte.appendChild(el('h3', null, 'Was kommt jetzt?'));
  karte.appendChild(el('p', 'formel', 'Sag es dir zuerst selbst, dann tippe.'));
  const falsch = mische(kt.schritte.filter(x => x.id !== s.id)).slice(0, 3);
  const w = el('div', 'wahl');
  mische([s].concat(falsch)).forEach(x => {
    const kn = el('button', null, x.name);
    kn.onclick = () => {
      if (x.id === s.id) { kn.classList.add('gut'); L.ordnungOk = true; setTimeout(() => zeige('lauf'), 260); }
      else { kn.classList.add('schlecht'); L.fehler++; kn.disabled = true; }
    };
    w.appendChild(kn);
  });
  karte.appendChild(w);
  return karte;
}

function schrittKarte(s) {
  const karte = el('div', 'schritt');

  const m = el('div', 'marken');
  m.appendChild(el('span', 'marke p', s.paragraf));
  const bild = MERKBILDER[s.pnr];
  if (bild) {
    const mb = el('span', 'marke bild', 'Merkbild: ' + bild.wort);
    mb.onclick = () => fenster(bild.wort + '  ·  Paragraf ' + s.pnr, bild.szene);
    m.appendChild(mb);
  }
  karte.appendChild(m);

  karte.appendChild(el('h3', null, s.name));
  karte.appendChild(el('p', 'formel', s.formel));

  const offen = L.offen.has(s.id) && !L.gezeigt;

  /* Die Rechnung */
  if (s.zeile) {
    const r = el('div', 'rechnung');
    const rz = el('div', 'rz');
    const erl = [];
    s.zeile.forEach(tok => {
      if (typeof tok === 'string' && L.kt.schritte.some(x => x.id === tok)) {
        const q = L.kt.schritte.find(x => x.id === tok);
        const sp = el('span', 'zutat', fmt(L.werte[tok] !== undefined ? L.werte[tok] : L.soll[tok], q.einheit));
        sp.title = q.name;
        sp.onclick = () => zeigeSchrittFenster(q, L.werte[tok] !== undefined ? L.werte[tok] : L.soll[tok]);
        rz.appendChild(sp);
        erl.push(q.name);
      } else if (typeof tok === 'object') {
        rz.appendChild(el('span', 'konst', zahl(tok.k, tok.k % 1 ? 2 : 0)));
        erl.push(tok.e);
      } else {
        rz.appendChild(el('span', 'op', tok));
      }
    });
    r.appendChild(rz);
    r.appendChild(el('span', 'erl', erl.join('  ·  ')));

    const e = el('div', 'ergebnis');
    e.appendChild(el('span', 'gl', '='));
    if (offen) {
      const inp = el('input');
      inp.type = 'text'; inp.inputMode = 'decimal'; inp.placeholder = 'dein Ergebnis'; inp.id = 'eingabe';
      inp.autocomplete = 'off';
      e.appendChild(inp);
      e.appendChild(el('span', 'eh', einheitKurz(s.einheit)));
    } else {
      e.appendChild(el('span', 'wert', fmt(L.soll[s.id], s.einheit)));
    }
    r.appendChild(e);
    karte.appendChild(r);
  } else if (s.wert !== undefined) {
    const r = el('div', 'rechnung');
    const e = el('div', 'ergebnis');
    e.style.borderTop = '0'; e.style.paddingTop = '0'; e.style.marginTop = '0';
    e.appendChild(el('span', 'wert', fmt(s.wert, s.einheit)));
    r.appendChild(e);
    karte.appendChild(r);
  }

  const rueckPlatz = el('div');
  karte.appendChild(rueckPlatz);

  /* Erklaerungen */
  if (s.verweis) {
    const d = el('details', 'aufklapp');
    d.appendChild(el('summary', null, 'Wo kommt dieser Wert her?'));
    const i = el('div', 'inhalt');
    i.appendChild(el('span', null, 'Aus einer eigenen Rechenkette. '));
    const a = el('button', 'knopf stumm', 'Kette ' + KETTEN.find(x => x.id === s.verweis).name + ' ansehen');
    a.style.marginTop = '.4rem';
    a.onclick = () => zeige('uebersicht', s.verweis);
    i.appendChild(document.createElement('br'));
    i.appendChild(a);
    d.appendChild(i);
    karte.appendChild(d);
  }
  const dw = el('details', 'aufklapp');
  dw.appendChild(el('summary', null, 'Warum steht dieser Schritt hier?'));
  dw.appendChild(el('div', 'inhalt', s.warum));
  karte.appendChild(dw);
  if (s.weiter) {
    const d = el('details', 'aufklapp');
    d.appendChild(el('summary', null, 'Was passiert damit weiter?'));
    d.appendChild(el('div', 'inhalt', s.weiter));
    karte.appendChild(d);
  }
  if (s.falle) {
    const d = el('details', 'aufklapp warn');
    d.appendChild(el('summary', null, 'Typische Falle'));
    d.appendChild(el('div', 'inhalt', s.falle));
    karte.appendChild(d);
  }
  if (s.braucht && s.braucht.length) {
    const d = el('details', 'aufklapp');
    d.appendChild(el('summary', null, 'Womit haengt das zusammen?'));
    const i = el('div', 'inhalt');
    i.appendChild(el('div', null, 'Braucht: ' + s.braucht.map(x => L.kt.schritte.find(y => y.id === x).name).join(', ')));
    const fuettert = L.kt.schritte.filter(x => (x.braucht || []).indexOf(s.id) >= 0).map(x => x.name);
    i.appendChild(el('div', null, 'Geht weiter in: ' + (fuettert.length ? fuettert.join(', ') : 'nichts mehr, das ist ein Endwert')));
    d.appendChild(i);
    karte.appendChild(d);
  }

  /* Knoepfe */
  const kr = el('div', 'knopfreihe');
  if (offen) {
    const pr = el('button', 'knopf', 'Pruefen');
    pr.onclick = () => pruefeEingabe(s, rueckPlatz, kr);
    kr.appendChild(pr);
    const zg = el('button', 'knopf stumm', 'Ich weiss nicht');
    zg.onclick = () => { L.gezeigt = true; L.fehler++; zeige('lauf'); };
    kr.appendChild(zg);
    setTimeout(() => { const i = $('#eingabe'); if (i) { i.focus(); i.onkeydown = (ev) => { if (ev.key === 'Enter') pr.click(); }; } }, 30);
  } else {
    const w = el('button', 'knopf breit', L.i + 1 < L.kt.schritte.length ? 'Weiter' : 'Kette abschliessen');
    w.onclick = () => weiter(s);
    kr.appendChild(w);
  }
  karte.appendChild(kr);
  return karte;
}

function pruefeEingabe(s, rueckPlatz, kr) {
  const inp = $('#eingabe');
  const kandidaten = leseZahlen(inp.value);
  const soll = L.soll[s.id];
  if (!kandidaten.length) { inp.classList.add('falsch'); return; }
  if (kandidaten.some(g => Math.abs(g - soll) <= toleranz(s.einheit, soll))) {
    inp.classList.remove('falsch'); inp.classList.add('richtig'); inp.disabled = true;
    L.gezeigt = true;
    const r = el('div', 'rueck gut');
    r.appendChild(el('b', null, 'Richtig: ' + fmt(soll, s.einheit)));
    r.appendChild(el('span', null, 'Sag dir jetzt laut, warum ' + s.name + ' genau an dieser Stelle steht. Danach aufklappen und vergleichen.'));
    rueckPlatz.appendChild(r);
    kr.innerHTML = '';
    const w = el('button', 'knopf breit', L.i + 1 < L.kt.schritte.length ? 'Weiter' : 'Kette abschliessen');
    w.onclick = () => weiter(s);
    kr.appendChild(w);
  } else {
    L.versuch++; L.fehler++;
    inp.classList.add('falsch');
    rueckPlatz.innerHTML = '';
    const r = el('div', 'rueck schlecht');
    if (L.versuch === 1) {
      r.appendChild(el('b', null, 'Noch nicht.'));
      r.appendChild(el('span', null, 'Pruefe die Formel: ' + s.formel + '. Und achte auf die Einheit: ' + (einheitKurz(s.einheit) || 'siehe oben') + '.'));
    } else {
      r.appendChild(el('b', null, 'Die Loesung: ' + fmt(soll, s.einheit)));
      r.appendChild(el('span', null, s.warum));
      L.gezeigt = true;
      inp.disabled = true;
      kr.innerHTML = '';
      const w = el('button', 'knopf breit', 'Verstanden, weiter');
      w.onclick = () => weiter(s);
      kr.appendChild(w);
    }
    rueckPlatz.appendChild(r);
  }
}

function weiter(s) {
  L.werte[s.id] = L.soll[s.id];
  L.i++; L.versuch = 0; L.gezeigt = false; L.ordnungOk = false; L.zettelGanz = false;
  if (L.i >= L.kt.schritte.length) {
    const alt = stufeVon(L.kt.id);
    const maxSt = L.kt.ohneZahlen ? 1 : 4;
    if (L.fehler === 0 && L.stufe >= alt && alt < maxSt) { SP.stufen[L.kt.id] = alt + 1; sichern(); }
    SP.laeufe = (SP.laeufe || 0) + 1; sichern();
    zeige('ende');
  } else zeige('lauf');
}

function vEnde(b) {
  const kt = L.kt;
  kopf(kt.name, 'geschafft');
  const dauer = Math.round((Date.now() - L.start) / 1000);
  const k = el('div', 'schritt');
  k.appendChild(el('h3', null, L.fehler === 0 ? 'Ohne Fehler durch.' : 'Durch, mit ' + L.fehler + (L.fehler === 1 ? ' Fehler.' : ' Fehlern.')));
  const erg = kt.schritte.find(x => x.id === kt.ergebnisId) || kt.schritte[kt.schritte.length - 1];
  k.appendChild(el('p', 'formel', erg.name + ': ' + fmt(L.soll[erg.id], erg.einheit) + '   ·   ' + Math.floor(dauer / 60) + ' Minuten ' + (dauer % 60) + ' Sekunden'));
  const neu = stufeVon(kt.id);
  const maxSt = kt.ohneZahlen ? 1 : 4;
  if (L.fehler === 0 && neu > L.stufe) {
    const r = el('div', 'rueck gut');
    r.appendChild(el('b', null, 'Stufe ' + neu + ' ist jetzt frei.'));
    r.appendChild(el('span', null, 'Mach sie aber nicht heute. Ein Tag Abstand bringt mehr als eine zweite Runde jetzt.'));
    k.appendChild(r);
  } else if (L.fehler > 0) {
    const r = el('div', 'rueck schlecht');
    r.appendChild(el('b', null, 'Diese Stufe noch einmal.'));
    r.appendChild(el('span', null, 'Erst wenn eine Stufe ohne Fehler durchlaeuft, wird die naechste frei.'));
    k.appendChild(r);
  }
  b.appendChild(k);

  const a = el('button', 'kachel');
  a.style.borderLeftColor = 'var(--gut)';
  a.appendChild(el('b', null, 'Jetzt abfragen'));
  a.appendChild(el('small', null, 'Fuenf Minuten Karten. Genau jetzt sitzt es am besten.'));
  a.onclick = () => zeige('abfrage');
  b.appendChild(a);

  const u = el('button', 'kachel');
  u.style.borderLeftColor = kt.farbe;
  u.appendChild(el('b', null, 'Die ganze Kette ansehen'));
  u.appendChild(el('small', null, 'Alle Schritte mit Werten, als Spickzettel.'));
  u.onclick = () => zeige('uebersicht', kt.id);
  b.appendChild(u);

  const n = el('button', 'kachel');
  n.style.borderLeftColor = 'var(--leise)';
  n.appendChild(el('b', null, 'Zurueck zur Stufenwahl'));
  n.onclick = () => zeige('wahl', kt.id);
  b.appendChild(n);
}

/* ------------------------------------------------------------- Uebersicht */
function vKarte(b) {
  kopf('Die Karte', 'Jede Kette auf einen Blick');
  b.appendChild(el('p', 'hin', 'Dein Spickzettel. Oben die Zutaten, dann die drei Schritte des Paragrafen 6 Absatz 3, unten das Ergebnis.'));
  KETTEN.forEach(kt => {
    const k = el('button', 'kachel');
    k.style.borderLeftColor = kt.farbe;
    k.appendChild(el('b', null, kt.name));
    k.appendChild(el('small', null, kt.untertitel));
    k.onclick = () => zeige('uebersicht', kt.id);
    b.appendChild(k);
  });
  b.appendChild(el('h2', null, 'Die drei Schritte, die immer gelten'));
  STUFEN.forEach(st => {
    const d = el('div', 'bildkarte');
    const kz = el('div', 'kopfz');
    kz.appendChild(el('span', 'wort', st.kurz));
    kz.appendChild(el('span', 'par', st.name));
    d.appendChild(kz);
    d.appendChild(el('p', null, st.erklaerung));
    b.appendChild(d);
  });
}

function vUebersicht(b, kid) {
  const kt = KETTEN.find(x => x.id === kid);
  const w = sollWerte(kt);
  kopf(kt.name, 'die ganze Kette');
  b.appendChild(el('p', 'hin', kt.objekt));
  let letzteStufe = null;
  kt.schritte.forEach((s, i) => {
    if (s.stufe !== letzteStufe) {
      const st = STUFEN.find(x => x.id === s.stufe);
      b.appendChild(el('div', 'gruppe', st.kurz + ' — ' + st.name));
      letzteStufe = s.stufe;
    } else if (i > 0) {
      b.appendChild(el('div', 'pfeil', '↓'));
    }
    const r = el('button', 'uebersicht-schritt');
    if (s.id === kt.ergebnisId) r.style.borderColor = kt.farbe;
    const kz = el('div', 'k');
    kz.appendChild(el('span', 'n', (i + 1) + '. ' + s.name));
    kz.appendChild(el('span', 'v', fmt(w[s.id], s.einheit)));
    r.appendChild(kz);
    const bild = MERKBILDER[s.pnr];
    r.appendChild(el('div', 'u', s.paragraf + (bild ? '  ·  ' + bild.wort : '')));
    r.onclick = () => zeigeSchrittFenster(s, w[s.id], kt);
    b.appendChild(r);
  });
  const kn = el('button', 'knopf breit');
  kn.textContent = 'Diese Kette ueben';
  kn.style.marginTop = '1.2rem';
  kn.onclick = () => zeige('wahl', kid);
  b.appendChild(kn);
}

/* ---------------------------------------------------------------- Fenster */
function fenster(titel, text) {
  const alt = $('#fenster'); if (alt) alt.remove();
  const hg = el('div');
  hg.id = 'fenster';
  hg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:50;display:flex;align-items:flex-end;justify-content:center;padding:0';
  const k = el('div');
  k.style.cssText = 'background:var(--karte);border-radius:16px 16px 0 0;padding:1.1rem 1.1rem calc(1.4rem + env(safe-area-inset-bottom));max-width:720px;width:100%;max-height:82vh;overflow:auto;box-shadow:var(--schatten2)';
  k.appendChild(el('div', 'wort', titel));
  const p = el('p'); p.style.cssText = 'font-size:.92rem;margin:.5rem 0 0'; p.textContent = text;
  k.appendChild(p);
  const z = el('button', 'knopf stumm breit', 'Schliessen');
  z.style.marginTop = '1rem';
  z.onclick = () => hg.remove();
  k.appendChild(z);
  hg.appendChild(k);
  hg.onclick = (e) => { if (e.target === hg) hg.remove(); };
  document.body.appendChild(hg);
}
function zeigeSchrittFenster(s, wert, kt) {
  const bild = MERKBILDER[s.pnr];
  let t = s.paragraf + '\n\n' + s.formel + '\n\nErgebnis: ' + fmt(wert, s.einheit) + '\n\nWarum: ' + s.warum;
  if (s.falle) t += '\n\nFalle: ' + s.falle;
  if (s.weiter) t += '\n\nWeiter: ' + s.weiter;
  if (bild) t += '\n\nMerkbild ' + bild.wort + ': ' + bild.szene;
  fenster(s.name, t);
}

/* ---------------------------------------------------------------- Abfrage */
function vAbfrage(b) {
  kopf('Abfrage', 'Erst antworten, dann aufdecken');
  if (!A || !A.reihe.length) {
    const faellig = mische(KARTEN.filter(k => istFaellig(k.id)));
    if (!faellig.length) {
      b.appendChild(el('div', 'leer', 'Heute ist nichts faellig. Das ist gut so — zu frueh wiederholen bringt weniger. Rechne stattdessen eine Kette.'));
      const naechste = KARTEN.map(k => SP.planer[k.id] && SP.planer[k.id].due).filter(Boolean).sort()[0];
      if (naechste) b.appendChild(el('p', 'hin', 'Naechste Karte faellig am ' + new Date(naechste).toLocaleDateString('de-DE') + '.'));
      const kn = el('button', 'knopf breit', 'Trotzdem 10 Karten ueben');
      kn.onclick = () => { A = { reihe: mische(KARTEN).slice(0, 10), auf: false, gemacht: 0, frei: true }; zeige('abfrage'); };
      b.appendChild(kn);
      return;
    }
    A = { reihe: faellig.slice(0, 40), auf: false, gemacht: 0, frei: false };
  }
  const k = A.reihe[0];
  b.appendChild(el('p', 'hin', A.reihe.length + ' in dieser Runde  ·  ' + A.gemacht + ' geschafft' + (A.frei ? '  ·  freies Ueben, zaehlt nicht fuer den Plan' : '')));

  const kf = el('div', 'karte-frage');
  kf.appendChild(el('div', 'thema', k.t));
  kf.appendChild(el('div', 'f', k.f));
  if (!A.auf) {
    const kn = el('button', 'knopf breit', 'Antwort zeigen');
    kn.style.marginTop = '1rem';
    kn.onclick = () => { A.auf = true; zeige('abfrage'); };
    kf.appendChild(kn);
    kf.appendChild(el('p', 'hin', 'Sag die Antwort erst laut. Der Versuch ist der Teil, der wirkt — auch wenn er danebengeht.'));
  } else {
    kf.appendChild(el('div', 'a', k.a));
    const n = el('div', 'noten');
    [['Nochmal', 'wusste ich nicht', 1], ['Schwer', 'mit Muehe', 2], ['Gut', 'sass', 3], ['Leicht', 'sofort', 4]].forEach(([t, u, g]) => {
      const kn = el('button');
      kn.appendChild(document.createTextNode(t));
      kn.appendChild(el('small', null, u));
      kn.onclick = () => {
        if (!A.frei) planen(k.id, g);
        A.gemacht++;
        A.reihe.shift();
        if (g === 1 && A.reihe.length) A.reihe.splice(Math.min(4, A.reihe.length), 0, k);
        A.auf = false;
        if (!A.reihe.length) { A = null; zeige('abfrage'); } else zeige('abfrage');
      };
      n.appendChild(kn);
    });
    kf.appendChild(n);
  }
  b.appendChild(kf);

  const bd = el('button', 'knopf stumm breit', 'Runde beenden');
  bd.style.marginTop = '1.2rem';
  bd.onclick = () => { A = null; zeige('start'); };
  b.appendChild(bd);
}

/* ---------------------------------------------------------------- Bilder */
function vBilder(b) {
  kopf('Merkbilder', 'dieselben wie im Merktrainer');
  b.appendChild(el('p', 'hin', 'Jede Ziffer hat einen festen Laut, aus den Lauten wird ein Wort, aus dem Wort eine Szene. Vokale und H zaehlen nicht mit.'));
  const t = el('table', 'tabelle');
  const kopfz = el('tr');
  ['Ziffer', 'Laut', 'Eselsbruecke'].forEach(x => kopfz.appendChild(el('th', null, x)));
  t.appendChild(kopfz);
  MAJOR.forEach(m => {
    const r = el('tr');
    r.appendChild(el('td', null, String(m.z)));
    r.appendChild(el('td', null, m.laut));
    r.appendChild(el('td', null, m.bruecke));
    t.appendChild(r);
  });
  b.appendChild(t);

  b.appendChild(el('h2', null, 'Die Bilder zu den Rechenwegen'));
  const benutzt = {};
  KETTEN.forEach(kt => kt.schritte.forEach(s => { if (MERKBILDER[s.pnr]) benutzt[s.pnr] = 1; }));
  Object.keys(benutzt).map(Number).sort((a, c) => a - c).forEach(p => {
    const m = MERKBILDER[p];
    const d = el('div', 'bildkarte');
    const kz = el('div', 'kopfz');
    kz.appendChild(el('span', 'wort', m.wort));
    kz.appendChild(el('span', 'par', 'Paragraf ' + p));
    kz.appendChild(el('span', 'lt', 'Laute ' + m.laute + '  ·  Merktrainer Folge ' + m.trainer));
    d.appendChild(kz);
    d.appendChild(el('p', 'szene', m.szene));
    b.appendChild(d);
  });
  const f = el('div', 'fuss');
  f.innerHTML = 'Die Folgen des Merktrainers zu diesen Bildern liegen beim <a href="../">Podcast</a>.';
  b.appendChild(f);
}

/* ---------------------------------------------------------------- Aufbau */
bauKarten();
document.querySelectorAll('#leiste button').forEach(x => x.onclick = () => { if (x.dataset.ziel === 'abfrage') A = A || null; zeige(x.dataset.ziel); });
$('#zurueck').onclick = () => {
  if (ANSICHT === 'lauf' || ANSICHT === 'ende') zeige('wahl', L.kt.id);
  else if (ANSICHT === 'uebersicht' || ANSICHT === 'wahl' || ANSICHT === 'hilfe') zeige('start');
  else zeige('start');
};
zeige('start');
