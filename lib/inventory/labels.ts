import "server-only";
import bwipjs from "bwip-js";
import QRCode from "qrcode";

export const serialQrPayload = (senSerial: string) => `SEN:1:${senSerial}`;

export async function createSerialLabelAssets(senSerial: string) {
  const barcode = await bwipjs.toBuffer({ bcid: "code128", text: senSerial, includetext: false, scale: 2, height: 10, paddingwidth: 4, paddingheight: 2 });
  const barcodeDataUrl = `data:image/png;base64,${barcode.toString("base64")}`;
  const qrDataUrl = await QRCode.toDataURL(serialQrPayload(senSerial), { errorCorrectionLevel: "M", margin: 1, width: 240 });
  const barcodeSvg = `<img src="${barcodeDataUrl}" alt="Code 128 barcode" style="width:100%;height:48px;object-fit:contain" />`;
  return { barcodeDataUrl, barcodeSvg, qrDataUrl, qrPayload: serialQrPayload(senSerial) };
}
