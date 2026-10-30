// Enlace de donación del autor. Sustituye por tu enlace de PayPal:
//   PayPal.me:  https://www.paypal.me/TU_USUARIO
//   o botón de donación de PayPal (https://www.paypal.com/donate/?hosted_button_id=...)
export const DONATE_URL = "https://www.paypal.me/marianoog";
export const DONATE_CONFIGURED = !DONATE_URL.includes("TU_USUARIO");

// QR opcional: si existe src/assets/donate-qr.(png|jpg|jpeg|svg|webp) se muestra en la ventana de donación.
const qrFiles = import.meta.glob("./assets/donate-qr.{png,jpg,jpeg,svg,webp}", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
export const DONATE_QR: string | null = Object.values(qrFiles)[0] ?? null;
