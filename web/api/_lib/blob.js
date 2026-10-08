// Vercel Blob (private store) için ortak okuma/yazma yardımcıları.
//
// Private store'da SDK'nın get()'i stream döndürmez (stream: null), bu yüzden
// okuma head() -> downloadUrl -> Bearer fetch üçlüsüyle yapılır. Her okumaya
// önbellek kırıcı eklenir: kullanıcı ödeme yapıp sayfayı yenilediğinde planı ya
// hesabını ESKİ görmemeli.
//
// NOT: Kayıt SİLMEYİZ. Vercel Blob'da silinen bir yolun tekrar yazılması
// tombstone birikimi yüzünden "yazıldı ama okunmuyor" durumuna düşüyor (head var
// diyor, GET 404). Bu yüzden iptal/işlem sonrası kayıt "free" gibi bir değerle
// ÜZERİNE YAZILIR, silinmez.

export const BLOB_OKUNUR = !!process.env.BLOB_READ_WRITE_TOKEN;
const ONEKI = "zenai/";

const temizle = (yol) =>
  String(yol || "").replace(/[^A-Za-z0-9._/-]/g, "_").replace(/^\/+/, "");

// Kısa ömürlü değişken, Vercel'in lambda yeniden kullanımında kaçak yapmaz.
let sdk = null;
async function sdkAl() {
  if (!sdk) {
    const m = await import("@vercel/blob");
    sdk = { put: m.put, head: m.head, list: m.list };
  }
  return sdk;
}

export async function yolOku(yol) {
  if (!BLOB_OKUNUR) return null;
  const { head } = await sdkAl();
  const tam = ONEKI + temizle(yol);
  let url;
  try {
    const h = await head(tam, { token: process.env.BLOB_READ_WRITE_TOKEN });
    if (!h) return null;
    url = h.downloadUrl || h.url;
  } catch {
    return null; // kayıt yok
  }
  if (!url) return null;
  const ayirici = url.includes("?") ? "&" : "?";
  const r = await fetch(url + ayirici + "_t=" + Date.now(), {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });
  if (!r.ok) return null;
  try {
    return JSON.parse(await r.text());
  } catch {
    return null;
  }
}

export async function yolYaz(yol, veri) {
  if (!BLOB_OKUNUR) throw new Error("Depo yapılandırılmamış");
  const { put } = await sdkAl();
  await put(ONEKI + temizle(yol), JSON.stringify(veri), {
    token: process.env.BLOB_READ_WRITE_TOKEN,
    access: "private",
    addRandomSuffix: 0,
    allowOverwrite: true,
  });
  return true;
}

// YENİ: Tek seferlik kayıt ekler. Aynı yola asla ÜZERİNE YAZMAZ, bu yüzden
// eşzamanlı iki istek birbirinin verisini silemez.
//
// Neden gerekiyor: Depo gecikmeli (eventually consistent) çalışıyor. Aynı
// kaydı "oku → değiştir → yaz" döngüsüne sokarsanız iki yazma birbirini ezer
// ve sayaç GERİYE gider (ölçüldü: 1 → 2 → 2 → 5 → 5). Güvenlik sayacı gibi
// verilerde bunun yerine her olayı ayrı bir anahtara eklemek gerekir: sayı
// hiçbir zaman azalmaz, yalnızca ileri gider.
//
// DİKKAT — benzersizliği SDK'ya BIRAKMIYORUZ. `addRandomSuffix: true` değeri
// yolun SON NOKTASINDAN ayırıp oraya ekliyor. E-posta gibi "a@b.test" içeren
// bir yolda son nokta "dizin" adının içinde kalıyor ve rastgele son ek
// DİZİN ADININ ORTASINA gömülüyor:
//     istenen : zenai/sayac/kayit/eposta-a_b.test/1700
//     oluşan  : zenai/sayac/kayit/eposta-a_b-Xy9Z.test/1700
// Sonuç: list() öneki tutmuyor, sayaç kalıcı olarak 0 görünüyor (bu hata canlı
// ölçüldü). Bu yüzden son segmenti KENDİMİZ benzersizleştiriyoruz.
export async function yolEkle(yol, veri) {
  if (!BLOB_OKUNUR) throw new Error("Depo yapılandırılmamış");
  const { put } = await sdkAl();
  const benzersiz = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const ayrilmis = String(yol).split("/");
  const son = ayrilmis.pop() || "olay";
  ayrilmis.push(`${son}-${benzersiz}`);
  await put(ONEKI + temizle(ayrilmis.join("/")), JSON.stringify(veri), {
    token: process.env.BLOB_READ_WRITE_TOKEN,
    access: "private",
    allowOverwrite: false,
  });
  return true;
}

// Bir ön eki altındaki tüm kayıtları [{ yol, zaman }] olarak döndürür.
// Hata durumunda boş liste döner: çağıran taraf bunu "kayıt yok" sayar.
export async function yolListele(onerEk) {
  if (!BLOB_OKUNUR) return [];
  const { list } = await sdkAl();
  const cikti = [];
  let cursor;
  try {
    do {
      const r = await list({
        prefix: ONEKI + temizle(onerEk),
        limit: 1000,
        cursor,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      for (const b of r.blobs || []) {
        cikti.push({
          yol: b.pathname,
          zaman: Date.parse(b.uploadedAt || "") || 0,
        });
      }
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
  } catch {
    return cikti;
  }
  return cikti;
}
