import { useEffect, useState } from "react";
import QRCode from "qrcode";

const TEST_REGISTRATION_URL = "http://192.168.1.46:4174/r/e2004c2386beb08fccc5ba9f18a1eb1a?v=2";

const QrRegistrationTest = () => {
  const [qrImage, setQrImage] = useState("");

  useEffect(() => {
    QRCode.toDataURL(TEST_REGISTRATION_URL, {
      width: 720,
      margin: 3,
      errorCorrectionLevel: "M",
    }).then(setQrImage);
  }, []);

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <section className="mx-auto max-w-xl rounded-3xl bg-card p-6 text-center shadow-soft sm:p-10">
        <p className="text-sm font-medium text-primary">TEST REJESTRACJI</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-foreground">Zeskanuj Podróżówkę</h1>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          Zeskanuj kod telefonem podłączonym do tej samej sieci Wi‑Fi. Otworzy się formularz obdarowanego.
        </p>
        <div className="mx-auto mt-7 max-w-sm rounded-2xl border bg-white p-4">
          {qrImage ? (
            <img src={qrImage} alt="Kod QR do testowej rejestracji Podróżówki" className="h-auto w-full" />
          ) : (
            <div className="aspect-square animate-pulse rounded-xl bg-muted" />
          )}
        </div>
        <p className="mt-5 text-xs text-muted-foreground">Kod testowy: PDZ-PCCK-S3GG</p>
      </section>
    </main>
  );
};

export default QrRegistrationTest;
