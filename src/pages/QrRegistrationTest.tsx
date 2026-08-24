import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

const QrRegistrationTest = () => {
  const [qrImage, setQrImage] = useState("");
  const registrationUrl = useMemo(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    const baseUrl = (import.meta.env.VITE_TEST_QR_BASE_URL || window.location.origin).replace(/\/$/, "");
    return token ? `${baseUrl}/r/${token}` : "";
  }, []);

  useEffect(() => {
    if (!registrationUrl) return;
    QRCode.toDataURL(registrationUrl, {
      width: 720,
      margin: 3,
      errorCorrectionLevel: "M",
    }).then(setQrImage);
  }, [registrationUrl]);

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <section className="mx-auto max-w-xl rounded-3xl bg-card p-6 text-center shadow-soft sm:p-10">
        <p className="text-sm font-medium text-primary">TEST REJESTRACJI</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-foreground">Zeskanuj Podróżówkę</h1>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          Zeskanuj kod telefonem podłączonym do tej samej sieci Wi‑Fi. Otworzy się formularz obdarowanego.
        </p>
        {registrationUrl ? <div className="mx-auto mt-7 max-w-sm rounded-2xl border bg-white p-4">
          {qrImage ? (
            <img src={qrImage} alt="Kod QR do testowej rejestracji Podróżówki" className="h-auto w-full" />
          ) : (
            <div className="aspect-square animate-pulse rounded-xl bg-muted" />
          )}
        </div> : <p className="mt-7 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Brak tokenu testowego. Wygeneruj kartkę w Narzędziach Dev.</p>}
        {registrationUrl && <p className="mt-5 break-all text-xs text-muted-foreground">{registrationUrl}</p>}
      </section>
    </main>
  );
};

export default QrRegistrationTest;
